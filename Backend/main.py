"""
CapyOS Backend
Etapa 1: Esqueleto do FastAPI (rota /health) - CONCLUÍDA E TESTADA
Etapa 2: Conexão com Google Sheets + rota /abas
Etapa 6.2: Migrado de config_pacientes.json (arquivo local) para Postgres (Neon)
Parte 2 (QoL): rota /formatar-escala - suporte à alocação manual de
pacientes sem sala no frontend.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime
from dotenv import load_dotenv
import os
import logica_escala
import database
from models import GerarEscalaRequest, GerarEscalaResponse, PacienteUpsertRequest, ConfiguracoesGerais

DEBUG_TAG = "🔧[CAPYOS-DEBUG]"

# Carrega o .env local (se existir). Em produção (Render, etc.) as env vars
# já vêm configuradas direto na plataforma, então isso não atrapalha nada.
load_dotenv()
print(f"{DEBUG_TAG} .env carregado (se existir).")

print(f"{DEBUG_TAG} Iniciando módulo main.py...")


def callback_progresso_debug(valor, texto):
    """Substitui o callback que mexia na barra do Tkinter: aqui só logamos."""
    print(f"{DEBUG_TAG} Progresso: {int(valor * 100)}% - {texto}")


app = FastAPI(title="CapyOS Backend", version="0.5.0")


@app.on_event("startup")
def ao_iniciar():
    """Garante que as tabelas existem no banco assim que o servidor sobe.
    Idempotente: seguro rodar toda vez, não duplica nem apaga nada."""
    print(f"{DEBUG_TAG} Rodando startup: garantindo tabelas do banco...")
    try:
        database.criar_tabelas()
    except database.ErroBancoDados as e:
        print(f"{DEBUG_TAG} ERRO no startup ao criar tabelas: {e}")


# --- CORS: permite que o frontend (rodando em outro domínio/porta) chame essa API ---
# Em dev local, o React normalmente roda em localhost:3000 (Create React App)
# ou localhost:5173 (Vite). Em produção, você vai configurar a variável de
# ambiente CORS_ALLOWED_ORIGINS com o domínio real do frontend (ex:
# "https://capyos.vercel.app"), separando por vírgula se tiver mais de um.
_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if _origins_env:
    origins_permitidas = [o.strip() for o in _origins_env.split(",") if o.strip()]
    print(f"{DEBUG_TAG} CORS configurado via env var. Origens permitidas: {origins_permitidas}")
else:
    origins_permitidas = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    print(f"{DEBUG_TAG} CORS_ALLOWED_ORIGINS não definida. Usando padrão de desenvolvimento: {origins_permitidas}")
    print(f"{DEBUG_TAG} AVISO: configure CORS_ALLOWED_ORIGINS em produção com o domínio real do frontend.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_permitidas,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"{DEBUG_TAG} Instância do FastAPI criada com sucesso.")


@app.get("/health")
def health_check():
    """
    Rota simples para confirmar que o servidor está de pé.
    Se isso responder, a Etapa 1 está OK.
    """
    print("🔧[CAPYOS-DEBUG] Rota /health foi chamada.")
    return {
        "status": "ok",
        "servico": "CapyOS Backend",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/")
def raiz():
    print(f"{DEBUG_TAG} Rota / (raiz) foi chamada.")
    return {"mensagem": "CapyOS Backend está rodando. Veja /health ou /docs"}


@app.get("/debug/credenciais-status")
def status_credenciais():
    """
    Rota SÓ de diagnóstico: confirma se as credenciais do Google foram
    encontradas e carregadas corretamente, SEM nunca expor o conteúdo delas.
    Útil pra você testar localmente antes de tentar buscar abas de verdade.
    """
    print(f"{DEBUG_TAG} Rota /debug/credenciais-status foi chamada.")
    try:
        creds_dict = logica_escala.carregar_credenciais_dict()
        # Só devolvemos campos não sensíveis, pra confirmar que carregou certo
        return {
            "credenciais_encontradas": True,
            "client_email": creds_dict.get("client_email"),
            "project_id": creds_dict.get("project_id"),
        }
    except Exception as e:
        print(f"{DEBUG_TAG} Falha ao carregar credenciais: {e}")
        return {
            "credenciais_encontradas": False,
            "erro": str(e)
        }


@app.get("/abas")
def listar_abas_planilha(url: str = None):
    """
    Recebe a URL da planilha e devolve a lista de nomes de abas.
    Exemplo de chamada: GET /abas?url=https://docs.google.com/spreadsheets/d/XXXX

    Se 'url' não for fornecida, cai no fallback de buscar
    configuracoes_gerais -> url_planilha no banco, igual /gerar-escala já
    faz. Isso permite o frontend nunca precisar saber/mandar a URL da
    planilha manualmente.
    """
    print(f"{DEBUG_TAG} Rota /abas foi chamada com url={url}")

    if not url:
        print(f"{DEBUG_TAG} url não fornecida, tentando fallback do banco...")
        try:
            config = database.carregar_config_completo()
        except database.ErroBancoDados as e:
            print(f"{DEBUG_TAG} ERRO ao consultar banco: {e}")
            raise HTTPException(status_code=500, detail=str(e))

        url = config.get("configuracoes_gerais", {}).get("url_planilha")

        if not url:
            print(f"{DEBUG_TAG} ERRO: nenhuma url fornecida nem salva no banco.")
            raise HTTPException(
                status_code=400,
                detail="Parâmetro 'url' não foi fornecido e não há url_planilha salva no banco."
            )

        print(f"{DEBUG_TAG} Usando url_planilha do banco: {url}")

    abas = logica_escala.listar_abas(url)

    if not abas:
        print(f"{DEBUG_TAG} Nenhuma aba encontrada ou erro na conexão.")
        raise HTTPException(
            status_code=502,
            detail="Não foi possível conectar à planilha. Verifique a URL, as credenciais e se a planilha foi compartilhada com o e-mail da service account."
        )

    print(f"{DEBUG_TAG} Retornando {len(abas)} aba(s) encontrada(s).")
    return {"abas": abas}


@app.get("/debug/cores")
def inspecionar_cores_planilha(url: str, nome_aba: str):
    """
    Rota temporária de diagnóstico: devolve a cor RGB crua de cada célula
    preenchida, sem classificar em REFERÊNCIA/SUPRIDA. Use isso quando a
    planilha mudar de tom de cor, pra recalibrar os limites do algoritmo.
    """
    print(f"{DEBUG_TAG} Rota /debug/cores chamada. url={url} nome_aba={nome_aba}")

    amostras = logica_escala.inspecionar_cores(url, nome_aba)

    if isinstance(amostras, str):
        raise HTTPException(status_code=502, detail=amostras)

    resumo = {
        "verde": sum(1 for a in amostras if a["veredito"] == "VERDE"),
        "amarelo": sum(1 for a in amostras if a["veredito"] == "AMARELO"),
        "ignorado": sum(1 for a in amostras if a["veredito"] == "ignorado"),
    }
    resumo["total_classificados"] = resumo["verde"] + resumo["amarelo"]

    print(f"{DEBUG_TAG} Resumo /debug/cores: {resumo}")

    return {"total_amostras": len(amostras), "resumo": resumo, "amostras": amostras}


@app.post("/gerar-escala", response_model=GerarEscalaResponse)
def gerar_escala(request: GerarEscalaRequest):
    """
    Roda o pipeline completo: baixa a planilha, identifica os pacientes
    (por cor), distribui nas salas seguindo as regras salvas no banco
    e devolve tanto os dados estruturados quanto o texto pronto pra WhatsApp.
    """
    print(f"{DEBUG_TAG} Rota /gerar-escala chamada. nome_aba={request.nome_aba}")

    try:
        config = database.carregar_config_completo()
    except database.ErroBancoDados as e:
        print(f"{DEBUG_TAG} ERRO ao consultar banco: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    url_planilha = request.url_planilha or config.get("configuracoes_gerais", {}).get("url_planilha")
    if not url_planilha:
        print(f"{DEBUG_TAG} ERRO: nenhuma url_planilha fornecida nem salva no banco.")
        raise HTTPException(
            status_code=400,
            detail="Nenhuma url_planilha foi fornecida e não há uma salva no banco."
        )

    print(f"{DEBUG_TAG} Usando url_planilha={url_planilha}")

    resultado = logica_escala.processar_escala(url_planilha, callback_progresso_debug, request.nome_aba)

    if isinstance(resultado, str):
        # processar_escala devolve string quando dá erro
        print(f"{DEBUG_TAG} ERRO retornado por processar_escala: {resultado}")
        raise HTTPException(status_code=502, detail=resultado)

    print(f"{DEBUG_TAG} {len(resultado)} pacientes identificados na planilha (verde/amarelo).")

    mapa_final, nao_alocados = logica_escala.distribuir_salas_ia(resultado, config)
    salas_bloqueadas = config.get("configuracoes_gerais", {}).get("salas_bloqueadas", [])
    texto_formatado = logica_escala.formatar_mapa_para_texto(mapa_final, nao_alocados, salas_bloqueadas)

    print(f"{DEBUG_TAG} /gerar-escala concluída com sucesso. {len(nao_alocados)} pacientes sem sala.")

    return GerarEscalaResponse(
        mapa=mapa_final,
        nao_alocados=nao_alocados,
        texto_formatado=texto_formatado,
        total_pacientes_processados=len(resultado)
    )


# --- FORMATAÇÃO DE UM MAPA JÁ RESOLVIDO (ex: depois de alocação manual) ---

class FormatarEscalaRequest(BaseModel):
    """
    mapa: mesmo formato de GerarEscalaResponse.mapa (sala -> horario -> nome).
    nao_alocados: lista de strings "HH:MM - NOME" que continuam sem sala
    (ex: pacientes que o coordenador escolheu "Pular" na alocação manual).
    """
    mapa: Dict[str, Dict[str, str]]
    nao_alocados: List[str]


class FormatarEscalaResponse(BaseModel):
    texto_formatado: str


@app.post("/formatar-escala", response_model=FormatarEscalaResponse)
def formatar_escala(request: FormatarEscalaRequest):
    """
    Recebe um mapa de salas (por exemplo, já editado manualmente no
    frontend depois da tela de alocação de pacientes sem sala) e devolve
    o texto pronto pra WhatsApp.

    IMPORTANTE: reaproveita a MESMA função `formatar_mapa_para_texto` usada
    em /gerar-escala, em vez de ter uma segunda implementação em
    JavaScript no frontend — evita o tipo de divergência de lógica que já
    causou o bug do horário de 17:00H (duas normalizações ligeiramente
    diferentes que um dia saíram de sincronia uma da outra).
    """
    print(f"{DEBUG_TAG} Rota /formatar-escala chamada. {len(request.nao_alocados)} pacientes sem sala.")

    try:
        config = database.obter_configuracoes_gerais()
    except database.ErroBancoDados as e:
        print(f"{DEBUG_TAG} ERRO ao consultar banco: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    salas_bloqueadas = config.get("salas_bloqueadas", [])
    texto_formatado = logica_escala.formatar_mapa_para_texto(request.mapa, request.nao_alocados, salas_bloqueadas)

    return FormatarEscalaResponse(texto_formatado=texto_formatado)


class EscreverVacanciaRequest(BaseModel):
    """
    mapa: mesmo formato de GerarEscalaResponse.mapa (sala -> horario -> nome),
    já com qualquer ajuste manual que o coordenador tenha feito na tela de
    alocação — escrevemos exatamente o que veio, sem recalcular nada aqui.

    url_vacancia: OBRIGATÓRIO por enquanto. Ainda não existe uma tela pra
    salvar isso na configuração do banco (mesma limitação que afeta o
    Ponto 4 — configuracoes_gerais só tem leitura hoje), então o frontend
    precisa mandar a URL certa em toda chamada. Quando o Ponto 4.4 existir,
    isso pode virar Optional com fallback pro banco, igual url_planilha.
    """
    mapa: Dict[str, Dict[str, str]]
    nome_aba: str
    url_vacancia: str


class EscreverVacanciaResponse(BaseModel):
    sucesso: bool
    aba_atualizada: str
    celulas_escritas: int


@app.post("/escrever-vacancia", response_model=EscreverVacanciaResponse)
def escrever_vacancia_rota(request: EscreverVacanciaRequest):
    """
    Escreve o mapa de alocação (já gerado por /gerar-escala, possivelmente
    ajustado manualmente pelo coordenador na tela de alocação) direto na
    aba do dia correspondente da planilha de Vacância — substitui o fluxo
    antigo de "Copiar Vacância", que só copiava texto pra área de
    transferência.
    """
    print(f"{DEBUG_TAG} Rota /escrever-vacancia chamada. aba={request.nome_aba}")

    try:
        celulas_escritas = logica_escala.escrever_vacancia(
            request.url_vacancia, request.nome_aba, request.mapa
        )
    except ValueError as e:
        print(f"{DEBUG_TAG} ERRO em /escrever-vacancia (aba não encontrada): {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        detalhe = f"{type(e).__name__}: {e!r}"
        print(f"{DEBUG_TAG} ERRO em /escrever-vacancia: {detalhe}")
        raise HTTPException(status_code=500, detail=f"Erro ao escrever na Vacância: {detalhe}")

    print(f"{DEBUG_TAG} /escrever-vacancia concluída. {celulas_escritas} células escritas em '{request.nome_aba}'.")

    return EscreverVacanciaResponse(
        sucesso=True,
        aba_atualizada=request.nome_aba,
        celulas_escritas=celulas_escritas,
    )


# --- ROTAS DE GERENCIAMENTO DE PACIENTES ---

@app.get("/pacientes")
def listar_pacientes():
    """Lista todos os assistidos cadastrados no banco."""
    print(f"{DEBUG_TAG} Rota GET /pacientes chamada.")
    try:
        pacientes = database.listar_pacientes_dict()
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"pacientes": pacientes}


@app.get("/pacientes/{nome}")
def buscar_paciente(nome: str):
    """Busca um assistido específico pelo nome (case-insensitive)."""
    nome_normalizado = nome.strip().upper()
    print(f"{DEBUG_TAG} Rota GET /pacientes/{{nome}} chamada. nome={nome_normalizado}")

    try:
        config_paciente = database.buscar_paciente_db(nome_normalizado)
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    if config_paciente is None:
        print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' não encontrado.")
        raise HTTPException(status_code=404, detail=f"Assistido '{nome_normalizado}' não encontrado.")

    return {"nome": nome_normalizado, "config": config_paciente}


@app.post("/pacientes")
def cadastrar_ou_editar_paciente(request: PacienteUpsertRequest):
    """
    Cadastra um assistido novo ou atualiza um existente (upsert).
    Se o nome já existir no banco, sobrescreve a configuração dele.
    Se não existir, cria um registro novo. Só mexe nessa linha — não
    afeta os demais assistidos.
    """
    nome_normalizado = request.nome.strip().upper()
    print(f"{DEBUG_TAG} Rota POST /pacientes chamada. nome={nome_normalizado}")

    try:
        ja_existia = database.buscar_paciente_db(nome_normalizado) is not None
        database.upsert_paciente_db(nome_normalizado, request.config.model_dump())
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    acao = "atualizado" if ja_existia else "cadastrado"
    print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' {acao} com sucesso.")

    return {
        "mensagem": f"Assistido '{nome_normalizado}' {acao} com sucesso.",
        "novo_cadastro": not ja_existia,
        "nome": nome_normalizado,
        "config": request.config.model_dump()
    }


@app.delete("/pacientes/{nome}")
def remover_paciente(nome: str):
    """Remove um assistido do banco (ex: saída do caseload)."""
    nome_normalizado = nome.strip().upper()
    print(f"{DEBUG_TAG} Rota DELETE /pacientes/{{nome}} chamada. nome={nome_normalizado}")

    try:
        existia = database.remover_paciente_db(nome_normalizado)
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not existia:
        print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' não encontrado para remoção.")
        raise HTTPException(status_code=404, detail=f"Assistido '{nome_normalizado}' não encontrado.")

    print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' removido com sucesso.")

    return {"mensagem": f"Assistido '{nome_normalizado}' removido com sucesso."}


# --- CONFIGURAÇÕES GERAIS (Ponto 4.2) ---
# Antes só existia obter_configuracoes_gerais() sendo lida internamente por
# /gerar-escala e /abas. Essas duas rotas abrem isso pro frontend (tela do
# Ponto 4.3) poder ler e editar sem precisar mexer direto no Neon via SQL.

@app.get("/configuracoes-gerais", response_model=ConfiguracoesGerais)
def obter_configuracoes_gerais_rota():
    """
    Devolve a linha única (id=1) de configuracoes_gerais. Se a linha ainda
    não existir por algum motivo, devolve os defaults do modelo em vez de
    erro — a tela de configurações sempre tem algo pra mostrar/editar.
    """
    print(f"{DEBUG_TAG} Rota GET /configuracoes-gerais chamada.")

    try:
        config = database.obter_configuracoes_gerais()
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ConfiguracoesGerais(**config)


@app.put("/configuracoes-gerais", response_model=ConfiguracoesGerais)
def salvar_configuracoes_gerais_rota(request: ConfiguracoesGerais):
    """
    Substitui a linha inteira de configuracoes_gerais (id=1) pelo payload
    recebido. Sempre manda o objeto completo — não é um patch parcial,
    então o frontend precisa buscar (GET), editar em memória e mandar
    tudo de volta (PUT), igual o resto do CapyOS já faz com pacientes.
    """
    print(f"{DEBUG_TAG} Rota PUT /configuracoes-gerais chamada.")

    try:
        database.salvar_configuracoes_gerais_db(request.model_dump())
    except database.ErroBancoDados as e:
        raise HTTPException(status_code=500, detail=str(e))

    print(f"{DEBUG_TAG} configuracoes_gerais salva com sucesso.")

    return request


if __name__ == "__main__":
    import uvicorn
    print("🔧[CAPYOS-DEBUG] Subindo servidor via uvicorn diretamente (modo dev)...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
