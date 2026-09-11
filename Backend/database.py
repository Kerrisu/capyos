"""
CapyOS Backend - Camada de acesso ao banco de dados (Postgres / Neon)

Substitui a leitura/escrita direta do config_pacientes.json por um banco
de verdade, pra sobreviver a deploys na nuvem (disco descartável) e evitar
duas pessoas se sobrescreverem ao editar pacientes diferentes ao mesmo tempo.

Duas tabelas:
  - pacientes: uma linha por assistido (mesmos campos do PacienteConfig)
  - configuracoes_gerais: uma linha única (id sempre 1) com as configs globais
"""

import os
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from datetime import date

DEBUG_TAG = "🔧[CAPYOS-DB-DEBUG]"


class ErroBancoDados(Exception):
    """Erro genérico de conexão/consulta ao banco, pra tratar igual em toda rota."""
    pass


# Mesmo universo de salas usado como fallback em logica_escala.py
# (distribuir_salas_ia). Repetido aqui porque salvar_configuracoes_gerais_db
# precisa de um default seguro pra "todas_as_salas" que NÃO seja lista
# vazia — ver comentário em criar_tabelas() sobre por que '{}' quebraria
# o pool de salas em produção.
TODAS_AS_SALAS_DEFAULT = ["ABA 01", "ABA 02", "ABA 03", "ABA 04", "ABA 05", "ABA 06",
                          "ABA 07", "ABA 08", "ABA 09", "ABA 10", "ABA 11", "ABA 12", "ABA 13"]


def _get_database_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ErroBancoDados(
            "DATABASE_URL não configurada. Confira o .env (local) ou as "
            "variáveis de ambiente do servidor (produção)."
        )
    return url


def get_connection():
    """Abre uma conexão nova com o Postgres. Uma por operação, app é pequeno."""
    try:
        return psycopg.connect(_get_database_url())
    except psycopg.OperationalError as e:
        print(f"{DEBUG_TAG} ERRO ao conectar no banco: {e}")
        raise ErroBancoDados(f"Não foi possível conectar ao banco de dados: {e}")


def criar_tabelas():
    """
    Cria as tabelas se ainda não existirem. Roda automaticamente no startup
    do FastAPI (ver main.py) — seguro rodar toda vez, não duplica nada.
    """
    print(f"{DEBUG_TAG} Verificando/criando tabelas...")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # ====================================================
            # 1. CRIANDO AS NOVAS TABELAS (USUÁRIOS E PENDÊNCIAS)
            # ====================================================
            cur.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(255) NOT NULL,
                    login VARCHAR(100) UNIQUE NOT NULL,
                    senha_hash VARCHAR(255) NOT NULL,
                    papel VARCHAR(50) NOT NULL -- 'aplicador' ou 'coordenacao'
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS pendencias (
                    id SERIAL PRIMARY KEY,
                    data DATE NOT NULL,
                    dia_semana VARCHAR(20),
                    horario VARCHAR(10),
                    tita VARCHAR(255),
                    aplicador VARCHAR(255) NOT NULL,
                    feito BOOLEAN DEFAULT FALSE,
                    observacao TEXT
                );
            """)

            # ====================================================
            # 2. CRIANDO AS TABELAS ANTIGAS DO CAPYOS
            # ====================================================
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pacientes (
                    nome TEXT PRIMARY KEY,
                    sala_fixa TEXT NOT NULL DEFAULT '',
                    resistencia_escada BOOLEAN NOT NULL DEFAULT FALSE,
                    preferencia_mezanino BOOLEAN NOT NULL DEFAULT FALSE,
                    aceita_externo BOOLEAN NOT NULL DEFAULT TRUE,
                    prioridade_clinica BOOLEAN NOT NULL DEFAULT FALSE,
                    divide_sala BOOLEAN NOT NULL DEFAULT TRUE,
                    grupo_match TEXT
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS configuracoes_gerais (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    permite_divisao_geral BOOLEAN NOT NULL DEFAULT TRUE,
                    salas_bloqueadas TEXT[] NOT NULL DEFAULT '{}',
                    url_planilha TEXT NOT NULL DEFAULT '',
                    ordem_salas_mezanino TEXT[] NOT NULL DEFAULT '{}',
                    ordem_salas_terreo TEXT[] NOT NULL DEFAULT '{}',
                    ordem_salas_preferencial TEXT[] NOT NULL DEFAULT '{}',
                    todas_as_salas TEXT[] NOT NULL DEFAULT '{"ABA 01","ABA 02","ABA 03","ABA 04","ABA 05","ABA 06","ABA 07","ABA 08","ABA 09","ABA 10","ABA 11","ABA 12","ABA 13"}',
                    salas_fora_do_pool TEXT[] NOT NULL DEFAULT '{}',
                    url_vacancia TEXT NOT NULL DEFAULT '',
                    aplicadores_formados JSONB NOT NULL DEFAULT '{}'::jsonb,
                    CONSTRAINT id_unico CHECK (id = 1)
                );
            """)

            # --- Migração pra bancos que já existiam antes dessas colunas
            cur.execute("""
                ALTER TABLE configuracoes_gerais
                    ADD COLUMN IF NOT EXISTS todas_as_salas TEXT[]
                        NOT NULL DEFAULT '{"ABA 01","ABA 02","ABA 03","ABA 04","ABA 05","ABA 06","ABA 07","ABA 08","ABA 09","ABA 10","ABA 11","ABA 12","ABA 13"}',
                    ADD COLUMN IF NOT EXISTS salas_fora_do_pool TEXT[]
                        NOT NULL DEFAULT '{}',
                    ADD COLUMN IF NOT EXISTS url_vacancia TEXT
                        NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS aplicadores_formados JSONB
                        NOT NULL DEFAULT '{}'::jsonb;
            """)
        conn.commit()
        print(f"{DEBUG_TAG} Tabelas OK.")
    finally:
        conn.close()

# --- PACIENTES: operações específicas (não é "carrega tudo, salva tudo") ---

def listar_pacientes_dict():
    """Devolve { NOME: {config...}, ... } — mesmo shape que o JSON antigo."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT nome, sala_fixa, resistencia_escada, preferencia_mezanino,
                       aceita_externo, prioridade_clinica, divide_sala, grupo_match
                FROM pacientes ORDER BY nome;
            """)
            linhas = cur.fetchall()
        resultado = {}
        for linha in linhas:
            nome = linha.pop("nome")
            resultado[nome] = dict(linha)
        return resultado
    finally:
        conn.close()


def buscar_paciente_db(nome_normalizado):
    """Devolve o dict de config de UM paciente, ou None se não existir."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT sala_fixa, resistencia_escada, preferencia_mezanino,
                       aceita_externo, prioridade_clinica, divide_sala, grupo_match
                FROM pacientes WHERE nome = %s;
            """, (nome_normalizado,))
            linha = cur.fetchone()
        return dict(linha) if linha else None
    finally:
        conn.close()


def upsert_paciente_db(nome_normalizado, config: dict):
    """Cria o paciente se não existir, ou atualiza se já existir (upsert de verdade,
    só mexe nessa linha — não afeta os outros 67 assistidos)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO pacientes (
                    nome, sala_fixa, resistencia_escada, preferencia_mezanino,
                    aceita_externo, prioridade_clinica, divide_sala, grupo_match
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (nome) DO UPDATE SET
                    sala_fixa = EXCLUDED.sala_fixa,
                    resistencia_escada = EXCLUDED.resistencia_escada,
                    preferencia_mezanino = EXCLUDED.preferencia_mezanino,
                    aceita_externo = EXCLUDED.aceita_externo,
                    prioridade_clinica = EXCLUDED.prioridade_clinica,
                    divide_sala = EXCLUDED.divide_sala,
                    grupo_match = EXCLUDED.grupo_match;
            """, (
                nome_normalizado,
                config.get("sala_fixa", ""),
                config.get("resistencia_escada", False),
                config.get("preferencia_mezanino", False),
                config.get("aceita_externo", True),
                config.get("prioridade_clinica", False),
                config.get("divide_sala", True),
                config.get("grupo_match"),
            ))
        conn.commit()
    finally:
        conn.close()


def remover_paciente_db(nome_normalizado):
    """Remove um paciente. Devolve True se realmente existia e foi removido."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM pacientes WHERE nome = %s;", (nome_normalizado,))
            existia = cur.rowcount > 0
        conn.commit()
        return existia
    finally:
        conn.close()


# --- CONFIGURAÇÕES GERAIS ---
# obter_configuracoes_gerais() já é usada em produção (via /gerar-escala).
# salvar_configuracoes_gerais_db() ainda não tem rota própria — isso é o
# Ponto 4.2 (endpoint GET/PUT), que vai chamar essa função já pronta.

def obter_configuracoes_gerais():
    """Devolve o dict de configuracoes_gerais, ou {} se a linha ainda não existir."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT permite_divisao_geral, salas_bloqueadas, url_planilha,
                       ordem_salas_mezanino, ordem_salas_terreo, ordem_salas_preferencial,
                       todas_as_salas, salas_fora_do_pool, url_vacancia, aplicadores_formados
                FROM configuracoes_gerais WHERE id = 1;
            """)
            linha = cur.fetchone()
        return dict(linha) if linha else {}
    finally:
        conn.close()


def salvar_configuracoes_gerais_db(config: dict):
    """Cria ou substitui a linha única de configuracoes_gerais (id=1).
    Usado pelo endpoint PUT /configuracoes-gerais (Ponto 4.2) e pelo script
    de migração."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO configuracoes_gerais (
                    id, permite_divisao_geral, salas_bloqueadas, url_planilha,
                    ordem_salas_mezanino, ordem_salas_terreo, ordem_salas_preferencial,
                    todas_as_salas, salas_fora_do_pool, url_vacancia, aplicadores_formados
                ) VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    permite_divisao_geral = EXCLUDED.permite_divisao_geral,
                    salas_bloqueadas = EXCLUDED.salas_bloqueadas,
                    url_planilha = EXCLUDED.url_planilha,
                    ordem_salas_mezanino = EXCLUDED.ordem_salas_mezanino,
                    ordem_salas_terreo = EXCLUDED.ordem_salas_terreo,
                    ordem_salas_preferencial = EXCLUDED.ordem_salas_preferencial,
                    todas_as_salas = EXCLUDED.todas_as_salas,
                    salas_fora_do_pool = EXCLUDED.salas_fora_do_pool,
                    url_vacancia = EXCLUDED.url_vacancia,
                    aplicadores_formados = EXCLUDED.aplicadores_formados;
            """, (
                config.get("permite_divisao_geral", True),
                config.get("salas_bloqueadas", []),
                config.get("url_planilha", ""),
                config.get("ordem_salas_mezanino", []),
                config.get("ordem_salas_terreo", []),
                config.get("ordem_salas_preferencial", []),
                config.get("todas_as_salas") or TODAS_AS_SALAS_DEFAULT,
                config.get("salas_fora_do_pool", []),
                config.get("url_vacancia", ""),
                Jsonb(config.get("aplicadores_formados", {})),
            ))
        conn.commit()
    finally:
        conn.close()


# --- ACESSO COMPLETO: mesmo shape do config_pacientes.json antigo ---
# Usado só pela rota /gerar-escala, porque a lógica de alocação (logica_escala.py)
# espera o dict inteiro no formato {"configuracoes_gerais": {...}, "pacientes": {...}}.
# Assim não precisamos mexer em nada dentro do logica_escala.py.

def carregar_config_completo():
    return {
        "configuracoes_gerais": obter_configuracoes_gerais(),
        "pacientes": listar_pacientes_dict(),
    }


def buscar_usuario_por_login(login: str):
    """Busca o usuário pelo login para validar a senha e gerar o token no main.py."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT id, nome, login, senha_hash, papel
                FROM usuarios
                WHERE login = %s;
            """, (login,))
            linha = cur.fetchone()
        return dict(linha) if linha else None
    finally:
        conn.close()


def listar_pendencias_db(nome_usuario: str, papel: str):
    """
    Retorna as pendências do banco.
    Se coordenação, retorna todas. Se aplicador, retorna apenas as atreladas ao seu nome.
    """
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            if papel == "coordenacao":
                cur.execute("""
                    SELECT id, data, dia_semana, horario, tita, aplicador, feito, observacao
                    FROM pendencias
                    ORDER BY data ASC, horario ASC;
                """)
            else:
                cur.execute("""
                    SELECT id, data, dia_semana, horario, tita, aplicador, feito, observacao
                    FROM pendencias
                    WHERE aplicador = %s
                    ORDER BY data ASC, horario ASC;
                """, (nome_usuario,))
            linhas = cur.fetchall()

        hoje = date.today()
        resultado = []
        for linha in linhas:
            linha_dict = dict(linha)
            data_pendencia = linha_dict.get("data")
            if data_pendencia is not None:
                linha_dict["dias_pendente"] = (hoje - data_pendencia).days
                linha_dict["data"] = data_pendencia.isoformat()  # date -> "2026-09-11"
            else:
                linha_dict["dias_pendente"] = 0
            resultado.append(linha_dict)
        return resultado
    finally:
        conn.close()


def marcar_pendencia_como_feita(id_pendencia: int, feito: bool, nome_usuario: str, papel: str):
    """
    Atualiza o status (✅) de uma pendência.
    Trava de segurança: aplicador só consegue alterar a própria pendência.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if papel == "coordenacao":
                # Coordenação tem poder absoluto para alterar qualquer linha
                cur.execute("""
                    UPDATE pendencias
                    SET feito = %s
                    WHERE id = %s;
                """, (feito, id_pendencia))
            else:
                # Aplicador só consegue dar UPDATE se a linha pertencer a ele
                cur.execute("""
                    UPDATE pendencias
                    SET feito = %s
                    WHERE id = %s AND aplicador = %s;
                """, (feito, id_pendencia, nome_usuario))
            linhas_afetadas = cur.rowcount
        conn.commit()
        return linhas_afetadas > 0
    finally:
        conn.close()


def inserir_pendencias_em_lote(pendencias: list[dict]) -> int:
    """
    Insere várias pendências de uma vez (cadastro em massa dos auxiliares/coordenação).
    Cada item de `pendencias` é um dict com: data (date), dia_semana, horario,
    tita, aplicador, observacao (pode ser None).
    Retorna quantas linhas foram efetivamente inseridas.
    """
    if not pendencias:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO pendencias (data, dia_semana, horario, tita, aplicador, observacao)
                VALUES (%(data)s, %(dia_semana)s, %(horario)s, %(tita)s, %(aplicador)s, %(observacao)s);
            """, pendencias)
        conn.commit()
        return len(pendencias)
    finally:
        conn.close()


def remover_pendencias_em_lote(ids: list[int]) -> int:
    """
    Remove definitivamente do banco as pendências cujo id está na lista.
    Trava de segurança: só remove linhas que já estão marcadas como feito = TRUE,
    pra nunca apagar por engano algo que ainda está pendente de verdade.
    Retorna quantas linhas foram removidas.
    """
    if not ids:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM pendencias
                WHERE id = ANY(%s) AND feito = TRUE;
            """, (ids,))
            linhas_removidas = cur.rowcount
        conn.commit()
        return linhas_removidas
    finally:
        conn.close()
