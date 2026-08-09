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
