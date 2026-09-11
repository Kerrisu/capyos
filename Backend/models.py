"""
CapyOS Backend - Schemas Pydantic (modelos de dados das requisições/respostas)
"""

from pydantic import BaseModel
from typing import Optional, List

# --- MODELOS EXISTENTES DO CAPYOS ---
class GerarEscalaRequest(BaseModel):
    nome_aba: str
    url_planilha: Optional[str] = None

class PacienteEncontrado(BaseModel):
    nome: str
    horario: str
    tipo: str

class GerarEscalaResponse(BaseModel):
    mapa: dict
    nao_alocados: list
    texto_formatado: str
    total_pacientes_processados: int

class PacienteConfig(BaseModel):
    sala_fixa: str = ""
    resistencia_escada: bool = False
    preferencia_mezanino: bool = False
    aceita_externo: bool = True
    prioridade_clinica: bool = False
    divide_sala: bool = True
    grupo_match: Optional[str] = None

class PacienteUpsertRequest(BaseModel):
    nome: str
    config: PacienteConfig

class ConfiguracoesGerais(BaseModel):
    permite_divisao_geral: bool = True
    salas_bloqueadas: list[str] = []
    url_planilha: str = ""
    ordem_salas_mezanino: list[str] = []
    ordem_salas_terreo: list[str] = []
    ordem_salas_preferencial: list[str] = []
    todas_as_salas: list[str] = []
    salas_fora_do_pool: list[str] = []
    url_vacancia: str = ""
    aplicadores_formados: dict[str, str] = {}


# --- NOVOS MODELOS: FASE 1 (AUTENTICAÇÃO E PENDÊNCIAS) ---

class LoginRequest(BaseModel):
    login: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    nome: str
    papel: str

class PendenciaResponse(BaseModel):
    id: int
    data: str
    dia_semana: str
    horario: str
    tita: str
    aplicador: str
    feito: bool
    observacao: Optional[str]
    dias_pendente: int

class PendenciaUpdateRequest(BaseModel):
    feito: bool


# --- NOVOS MODELOS: FASE 2 (CADASTRO EM MASSA E REMOÇÃO EM LOTE) ---

class PendenciaBulkRequest(BaseModel):
    texto: str  # bloco colado, uma pendência por linha, campos separados por ';'

class PendenciaBulkResponse(BaseModel):
    inseridos: int
    erros: List[str]  # ex: "Linha 3: data inválida (use DD/MM/AAAA)"

class RemocaoLoteRequest(BaseModel):
    ids: List[int]

class RemocaoLoteResponse(BaseModel):
    removidos: int
