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

DEBUG_TAG = "🔧[CAPYOS-DB-DEBUG]"


class ErroBancoDados(Exception):
    """Erro genérico de conexão/consulta ao banco, pra tratar igual em toda rota."""
    pass


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
                    CONSTRAINT id_unico CHECK (id = 1)
                );
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


# --- CONFIGURAÇÕES GERAIS: só leitura por enquanto (não tem tela de editar isso ainda) ---

def obter_configuracoes_gerais():
    """Devolve o dict de configuracoes_gerais, ou {} se a linha ainda não existir."""
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT permite_divisao_geral, salas_bloqueadas, url_planilha,
                       ordem_salas_mezanino, ordem_salas_terreo, ordem_salas_preferencial
                FROM configuracoes_gerais WHERE id = 1;
            """)
            linha = cur.fetchone()
        return dict(linha) if linha else {}
    finally:
        conn.close()


def salvar_configuracoes_gerais_db(config: dict):
    """Cria ou substitui a linha única de configuracoes_gerais (id=1).
    Usado só pelo script de migração (migrar_json_para_db.py) por enquanto."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO configuracoes_gerais (
                    id, permite_divisao_geral, salas_bloqueadas, url_planilha,
                    ordem_salas_mezanino, ordem_salas_terreo, ordem_salas_preferencial
                ) VALUES (1, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    permite_divisao_geral = EXCLUDED.permite_divisao_geral,
                    salas_bloqueadas = EXCLUDED.salas_bloqueadas,
                    url_planilha = EXCLUDED.url_planilha,
                    ordem_salas_mezanino = EXCLUDED.ordem_salas_mezanino,
                    ordem_salas_terreo = EXCLUDED.ordem_salas_terreo,
                    ordem_salas_preferencial = EXCLUDED.ordem_salas_preferencial;
            """, (
                config.get("permite_divisao_geral", True),
                config.get("salas_bloqueadas", []),
                config.get("url_planilha", ""),
                config.get("ordem_salas_mezanino", []),
                config.get("ordem_salas_terreo", []),
                config.get("ordem_salas_preferencial", []),
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
