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

            cur.execute("""
                CREATE TABLE IF NOT EXISTS relatos_aba (
                    id SERIAL PRIMARY KEY,
                    assistido VARCHAR(255) NOT NULL,
                    dia_semana VARCHAR(20) NOT NULL,
                    horario VARCHAR(10) NOT NULL,
                    tipo VARCHAR(30) NOT NULL, -- 'sem_aba' ou 'perdeu_sessao'
                    observacao TEXT,
                    aplicador VARCHAR(255) NOT NULL,
                    data_criacao TIMESTAMP NOT NULL DEFAULT NOW()
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

            # ====================================================
            # 3. REGISTRO AUTOMÁTICO DE REFERÊNCIA/PISCINA (à parte do
            #    Cadastro em Massa, só coordenação)
            # ====================================================
            cur.execute("""
                CREATE TABLE IF NOT EXISTS execucoes_direcionamento (
                    id SERIAL PRIMARY KEY,
                    data_hora_execucao TIMESTAMP NOT NULL DEFAULT NOW(),
                    data_referencia DATE NOT NULL,
                    dia_semana VARCHAR(20),
                    aba_usada VARCHAR(100),
                    tipo_execucao VARCHAR(20) NOT NULL, -- 'MANUAL' ou 'AUTOMATICA'
                    status VARCHAR(20) NOT NULL,         -- 'SUCESSO', 'ERRO' ou 'SEM_ABA_HOJE'
                    mensagem_erro TEXT,
                    total_sessoes INTEGER NOT NULL DEFAULT 0
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessoes_direcionamento (
                    id SERIAL PRIMARY KEY,
                    execucao_id INTEGER NOT NULL REFERENCES execucoes_direcionamento(id) ON DELETE CASCADE,
                    data_referencia DATE NOT NULL,
                    dia_semana VARCHAR(20),
                    horario VARCHAR(10),
                    tita VARCHAR(255),
                    aplicador VARCHAR(255),
                    tipo VARCHAR(20) NOT NULL, -- 'REFERENCIA' ou 'PISCINA'
                    conflito BOOLEAN NOT NULL DEFAULT FALSE -- true = mesma tita/horário com 2 aplicadores na planilha (erro de preenchimento), precisa checagem manual
                );
            """)
            # --- Migração pra quem já tinha essa tabela sem a coluna conflito
            cur.execute("""
                ALTER TABLE sessoes_direcionamento
                    ADD COLUMN IF NOT EXISTS conflito BOOLEAN NOT NULL DEFAULT FALSE;
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
                        NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS horario_registro_direcionamento VARCHAR(5);
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


def obter_estatisticas_dashboard(nome_usuario: str, papel: str) -> dict:
    """
    Números do dashboard inicial. Coordenação vê o total geral (pendências,
    concluídas e ajustes de sessão de aba no TiTa); aplicador vê só a
    pendência/conclusão atrelada ao próprio nome. Sempre total histórico
    (sem filtro de data).
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if papel == "coordenacao":
                cur.execute("SELECT COUNT(*) FROM pendencias WHERE feito = false;")
                pendentes = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM pendencias WHERE feito = true;")
                concluidos = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM relatos_aba;")
                ajustes_aba = cur.fetchone()[0]
                return {"pendentes": pendentes, "concluidos": concluidos, "ajustes_aba": ajustes_aba}
            else:
                cur.execute("SELECT COUNT(*) FROM pendencias WHERE aplicador = %s AND feito = false;", (nome_usuario,))
                pendentes = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM pendencias WHERE aplicador = %s AND feito = true;", (nome_usuario,))
                concluidos = cur.fetchone()[0]
                return {"pendentes": pendentes, "concluidos": concluidos}
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


def inserir_relato_aba(assistido: str, dia_semana: str, horario: str, tipo: str, observacao, aplicador: str) -> dict:
    """Registra um relato de sessão sem ABA no TITA (perdeu a sessão ou nunca teve)."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                INSERT INTO relatos_aba (assistido, dia_semana, horario, tipo, observacao, aplicador)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, assistido, dia_semana, horario, tipo, observacao, aplicador, data_criacao;
            """, (assistido, dia_semana, horario, tipo, observacao, aplicador))
            linha = dict(cur.fetchone())
        conn.commit()
        linha["data_criacao"] = linha["data_criacao"].isoformat()
        return linha
    finally:
        conn.close()


def listar_relatos_aba_db(dia_semana: str = None, tipo: str = None) -> list[dict]:
    """Lista os relatos de sessão sem ABA, mais recentes primeiro, com filtros opcionais."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            condicoes = []
            parametros = []
            if dia_semana:
                condicoes.append("dia_semana = %s")
                parametros.append(dia_semana)
            if tipo:
                condicoes.append("tipo = %s")
                parametros.append(tipo)
            where = f"WHERE {' AND '.join(condicoes)}" if condicoes else ""
            cur.execute(f"""
                SELECT id, assistido, dia_semana, horario, tipo, observacao, aplicador, data_criacao
                FROM relatos_aba
                {where}
                ORDER BY data_criacao DESC;
            """, parametros)
            linhas = cur.fetchall()
        resultado = []
        for linha in linhas:
            item = dict(linha)
            item["data_criacao"] = item["data_criacao"].isoformat()
            resultado.append(item)
        return resultado
    finally:
        conn.close()


def remover_relatos_aba_em_lote(ids: list[int]) -> int:
    """Remove definitivamente os relatos selecionados (depois que a coordenação já
    fez os ajustes necessários no TITA). Retorna quantas linhas foram removidas."""
    if not ids:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM relatos_aba
                WHERE id = ANY(%s);
            """, (ids,))
            linhas_removidas = cur.rowcount
        conn.commit()
        return linhas_removidas
    finally:
        conn.close()


# --- GESTÃO DE USUÁRIOS/LOGINS ---

class LoginJaExisteError(Exception):
    """Levantado quando se tenta criar um usuário com um login que já existe."""
    pass


# --- REGISTRO DE REFERÊNCIA/PISCINA ---

def obter_horario_registro_direcionamento():
    """Devolve o horário agendado (string 'HH:MM') ou None se nunca foi configurado."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT horario_registro_direcionamento FROM configuracoes_gerais WHERE id = 1;")
            linha = cur.fetchone()
        return linha[0] if linha else None
    finally:
        conn.close()


def salvar_horario_registro_direcionamento(horario: str):
    """
    Atualiza só o horário agendado, sem mexer no resto de configuracoes_gerais.
    Se a linha (id=1) ainda não existir, cria uma com os defaults do resto.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO configuracoes_gerais (id, todas_as_salas, horario_registro_direcionamento)
                VALUES (1, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    horario_registro_direcionamento = EXCLUDED.horario_registro_direcionamento;
            """, (TODAS_AS_SALAS_DEFAULT, horario))
        conn.commit()
    finally:
        conn.close()


def criar_execucao_direcionamento(data_referencia, dia_semana, aba_usada, tipo_execucao,
                                   status, mensagem_erro, total_sessoes) -> dict:
    """Registra uma rodada (manual ou automática) no log de execuções."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                INSERT INTO execucoes_direcionamento
                    (data_referencia, dia_semana, aba_usada, tipo_execucao, status, mensagem_erro, total_sessoes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, data_hora_execucao, data_referencia, dia_semana, aba_usada,
                          tipo_execucao, status, mensagem_erro, total_sessoes;
            """, (data_referencia, dia_semana, aba_usada, tipo_execucao, status, mensagem_erro, total_sessoes))
            linha = dict(cur.fetchone())
        conn.commit()
        linha["data_hora_execucao"] = linha["data_hora_execucao"].isoformat()
        linha["data_referencia"] = linha["data_referencia"].isoformat()
        return linha
    finally:
        conn.close()


def inserir_sessoes_direcionamento(execucao_id: int, data_referencia, dia_semana: str, sessoes: list[dict]) -> int:
    """Insere as sessões (referência/piscina) encontradas numa execução. Retorna quantas foram inseridas."""
    if not sessoes:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO sessoes_direcionamento
                    (execucao_id, data_referencia, dia_semana, horario, tita, aplicador, tipo, conflito)
                VALUES (%(execucao_id)s, %(data_referencia)s, %(dia_semana)s, %(horario)s,
                        %(tita)s, %(aplicador)s, %(tipo)s, %(conflito)s);
            """, [
                {
                    "execucao_id": execucao_id,
                    "data_referencia": data_referencia,
                    "dia_semana": dia_semana,
                    "horario": s.get("horario"),
                    "tita": s.get("tita"),
                    "aplicador": s.get("aplicador"),
                    "tipo": s.get("tipo"),
                    "conflito": s.get("conflito", False),
                }
                for s in sessoes
            ])
        conn.commit()
        return len(sessoes)
    finally:
        conn.close()


def ja_rodou_automatico_hoje(data_referencia) -> bool:
    """Confere se já rodou uma execução AUTOMÁTICA com sucesso hoje, pra não disparar 2x."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM execucoes_direcionamento
                WHERE tipo_execucao = 'AUTOMATICA'
                  AND status = 'SUCESSO'
                  AND data_referencia = %s
                LIMIT 1;
            """, (data_referencia,))
            return cur.fetchone() is not None
    finally:
        conn.close()


def listar_execucoes_direcionamento(dia_semana: str = None, limite: int = 30) -> list[dict]:
    """Lista as execuções (mais recentes primeiro), com filtro opcional por dia_semana (aba)."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            condicoes = []
            parametros = []
            if dia_semana:
                condicoes.append("dia_semana = %s")
                parametros.append(dia_semana)
            where = f"WHERE {' AND '.join(condicoes)}" if condicoes else ""
            parametros.append(limite)
            cur.execute(f"""
                SELECT id, data_hora_execucao, data_referencia, dia_semana, aba_usada,
                       tipo_execucao, status, mensagem_erro, total_sessoes
                FROM execucoes_direcionamento
                {where}
                ORDER BY data_hora_execucao DESC
                LIMIT %s;
            """, parametros)
            linhas = cur.fetchall()
        resultado = []
        for linha in linhas:
            item = dict(linha)
            item["data_hora_execucao"] = item["data_hora_execucao"].isoformat()
            item["data_referencia"] = item["data_referencia"].isoformat()
            resultado.append(item)
        return resultado
    finally:
        conn.close()


def listar_sessoes_direcionamento(execucao_id: int) -> list[dict]:
    """Lista as sessões (referência/piscina) de UMA execução específica."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT id, execucao_id, data_referencia, dia_semana, horario, tita, aplicador, tipo, conflito
                FROM sessoes_direcionamento
                WHERE execucao_id = %s
                ORDER BY horario, aplicador;
            """, (execucao_id,))
            linhas = cur.fetchall()
        resultado = []
        for linha in linhas:
            item = dict(linha)
            item["data_referencia"] = item["data_referencia"].isoformat()
            resultado.append(item)
        return resultado
    finally:
        conn.close()


def criar_usuario_db(nome: str, login: str, senha_hash: str, papel: str) -> dict:
    """
    Cria um novo usuário (aplicador ou coordenação). Levanta LoginJaExisteError
    se o login já estiver em uso (constraint UNIQUE na coluna login).
    """
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            try:
                cur.execute("""
                    INSERT INTO usuarios (nome, login, senha_hash, papel)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, nome, login, papel;
                """, (nome, login, senha_hash, papel))
                usuario_criado = cur.fetchone()
            except psycopg.errors.UniqueViolation:
                conn.rollback()
                raise LoginJaExisteError(f"Já existe um usuário com o login '{login}'.")
        conn.commit()
        return dict(usuario_criado)
    finally:
        conn.close()


def listar_usuarios_db() -> list[dict]:
    """Lista todos os usuários (sem o hash da senha), pra tela de gestão."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT id, nome, login, papel
                FROM usuarios
                ORDER BY papel DESC, nome ASC;
            """)
            linhas = cur.fetchall()
        return [dict(linha) for linha in linhas]
    finally:
        conn.close()


def contar_coordenadores_db() -> int:
    """Conta quantos usuários com papel 'coordenacao' existem — usado como
    trava de segurança pra nunca deixar o sistema sem nenhum coordenador."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM usuarios WHERE papel = 'coordenacao';")
            (total,) = cur.fetchone()
        return total
    finally:
        conn.close()


def remover_usuario_db(login: str) -> bool:
    """Remove um usuário pelo login. Retorna True se realmente existia e foi removido."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM usuarios WHERE login = %s;", (login,))
            existia = cur.rowcount > 0
        conn.commit()
        return existia
    finally:
        conn.close()
