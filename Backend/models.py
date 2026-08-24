"""
CapyOS Backend - Schemas Pydantic (modelos de dados das requisições/respostas)
"""

from pydantic import BaseModel
from typing import Optional


class GerarEscalaRequest(BaseModel):
    nome_aba: str
    url_planilha: Optional[str] = None  # se não vier, usa a salva no config_pacientes.json


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
    """Configurações comportamentais/logísticas de um assistido."""
    sala_fixa: str = ""
    resistencia_escada: bool = False
    preferencia_mezanino: bool = False
    aceita_externo: bool = True
    prioridade_clinica: bool = False
    divide_sala: bool = True
    grupo_match: Optional[str] = None


class PacienteUpsertRequest(BaseModel):
    """Usado para cadastrar um assistido novo ou editar um existente."""
    nome: str
    config: PacienteConfig


class ConfiguracoesGerais(BaseModel):
    """
    Espelha 1:1 as colunas de configuracoes_gerais (ver database.py).
    Usado tanto na resposta do GET quanto no corpo do PUT — o PUT sempre
    substitui a linha inteira (mesmo padrão de upsert_paciente_db, só que
    aqui só existe UMA linha, id=1).
    """
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
