"""
CapyOS Backend
Etapa 1: Esqueleto do FastAPI (rota /health) - CONCLUÍDA E TESTADA
Etapa 2: Conexão com Google Sheets + rota /abas
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from dotenv import load_dotenv
import json
import os
import logica_escala
from models import GerarEscalaRequest, GerarEscalaResponse, PacienteUpsertRequest

DEBUG_TAG = "🔧[CAPYOS-DEBUG]"

# Carrega o .env local (se existir). Em produção (Render, etc.) as env vars
# já vêm configuradas direto na plataforma, então isso não atrapalha nada.
load_dotenv()
print(f"{DEBUG_TAG} .env carregado (se existir).")

print(f"{DEBUG_TAG} Iniciando módulo main.py...")

CAMINHO_CONFIG_PACIENTES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config_pacientes.json")


def carregar_config_pacientes():
    """Carrega o config_pacientes.json do disco do servidor."""
    print(f"{DEBUG_TAG} Carregando config_pacientes.json de: {CAMINHO_CONFIG_PACIENTES}")
    if not os.path.exists(CAMINHO_CONFIG_PACIENTES):
        print(f"{DEBUG_TAG} ERRO: config_pacientes.json não encontrado.")
        raise FileNotFoundError("config_pacientes.json não encontrado no servidor.")

    with open(CAMINHO_CONFIG_PACIENTES, "r", encoding="utf-8") as f:
        config = json.load(f)
    print(f"{DEBUG_TAG} config_pacientes.json carregado. {len(config.get('pacientes', {}))} pacientes cadastrados.")
    return config


def salvar_config_pacientes(config):
    """Persiste o config_pacientes.json de volta no disco do servidor."""
    print(f"{DEBUG_TAG} Salvando config_pacientes.json em: {CAMINHO_CONFIG_PACIENTES}")
    with open(CAMINHO_CONFIG_PACIENTES, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    print(f"{DEBUG_TAG} config_pacientes.json salvo com sucesso. {len(config.get('pacientes', {}))} pacientes agora.")


def callback_progresso_debug(valor, texto):
    """Substitui o callback que mexia na barra do Tkinter: aqui só logamos."""
    print(f"{DEBUG_TAG} Progresso: {int(valor * 100)}% - {texto}")


app = FastAPI(title="CapyOS Backend", version="0.4.0")

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
    configuracoes_gerais -> url_planilha do config_pacientes.json,
    igual /gerar-escala já faz. Isso permite o frontend nunca precisar
    saber/mandar a URL da planilha manualmente.
    """
    print(f"{DEBUG_TAG} Rota /abas foi chamada com url={url}")

    if not url:
        print(f"{DEBUG_TAG} url não fornecida, tentando fallback do config_pacientes.json...")
        try:
            config = carregar_config_pacientes()
        except FileNotFoundError as e:
            print(f"{DEBUG_TAG} ERRO ao carregar config_pacientes.json: {e}")
            raise HTTPException(status_code=500, detail=str(e))

        url = config.get("configuracoes_gerais", {}).get("url_planilha")

        if not url:
            print(f"{DEBUG_TAG} ERRO: nenhuma url fornecida nem salva no config.")
            raise HTTPException(
                status_code=400,
                detail="Parâmetro 'url' não foi fornecido e não há url_planilha salva no config_pacientes.json."
            )

        print(f"{DEBUG_TAG} Usando url_planilha do config: {url}")

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
    (por cor), distribui nas salas seguindo as regras do config_pacientes.json
    e devolve tanto os dados estruturados quanto o texto pronto pra WhatsApp.
    """
    print(f"{DEBUG_TAG} Rota /gerar-escala chamada. nome_aba={request.nome_aba}")

    try:
        config = carregar_config_pacientes()
    except FileNotFoundError as e:
        print(f"{DEBUG_TAG} ERRO ao carregar config_pacientes.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    url_planilha = request.url_planilha or config.get("configuracoes_gerais", {}).get("url_planilha")
    if not url_planilha:
        print(f"{DEBUG_TAG} ERRO: nenhuma url_planilha fornecida nem salva no config.")
        raise HTTPException(
            status_code=400,
            detail="Nenhuma url_planilha foi fornecida e não há uma salva no config_pacientes.json."
        )

    print(f"{DEBUG_TAG} Usando url_planilha={url_planilha}")

    resultado = logica_escala.processar_escala(url_planilha, callback_progresso_debug, request.nome_aba)

    if isinstance(resultado, str):
        # processar_escala devolve string quando dá erro
        print(f"{DEBUG_TAG} ERRO retornado por processar_escala: {resultado}")
        raise HTTPException(status_code=502, detail=resultado)

    print(f"{DEBUG_TAG} {len(resultado)} pacientes identificados na planilha (verde/amarelo).")

    mapa_final, nao_alocados = logica_escala.distribuir_salas_ia(resultado, config)
    texto_formatado = logica_escala.formatar_mapa_para_texto(mapa_final, nao_alocados)

    print(f"{DEBUG_TAG} /gerar-escala concluída com sucesso. {len(nao_alocados)} pacientes sem sala.")

    return GerarEscalaResponse(
        mapa=mapa_final,
        nao_alocados=nao_alocados,
        texto_formatado=texto_formatado,
        total_pacientes_processados=len(resultado)
    )


# --- ROTAS DE GERENCIAMENTO DE PACIENTES ---

@app.get("/pacientes")
def listar_pacientes():
    """Lista todos os assistidos cadastrados no config_pacientes.json."""
    print(f"{DEBUG_TAG} Rota GET /pacientes chamada.")
    try:
        config = carregar_config_pacientes()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"pacientes": config.get("pacientes", {})}


@app.get("/pacientes/{nome}")
def buscar_paciente(nome: str):
    """Busca um assistido específico pelo nome (case-insensitive)."""
    nome_normalizado = nome.strip().upper()
    print(f"{DEBUG_TAG} Rota GET /pacientes/{{nome}} chamada. nome={nome_normalizado}")

    try:
        config = carregar_config_pacientes()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    pacientes = config.get("pacientes", {})
    if nome_normalizado not in pacientes:
        print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' não encontrado.")
        raise HTTPException(status_code=404, detail=f"Assistido '{nome_normalizado}' não encontrado.")

    return {"nome": nome_normalizado, "config": pacientes[nome_normalizado]}


@app.post("/pacientes")
def cadastrar_ou_editar_paciente(request: PacienteUpsertRequest):
    """
    Cadastra um assistido novo ou atualiza um existente (upsert).
    Se o nome já existir no config_pacientes.json, sobrescreve a configuração dele.
    Se não existir, cria um registro novo.
    """
    nome_normalizado = request.nome.strip().upper()
    print(f"{DEBUG_TAG} Rota POST /pacientes chamada. nome={nome_normalizado}")

    try:
        config = carregar_config_pacientes()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    ja_existia = nome_normalizado in config.get("pacientes", {})

    config.setdefault("pacientes", {})[nome_normalizado] = request.config.model_dump()
    salvar_config_pacientes(config)

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
    """Remove um assistido do config_pacientes.json (ex: saída do caseload)."""
    nome_normalizado = nome.strip().upper()
    print(f"{DEBUG_TAG} Rota DELETE /pacientes/{{nome}} chamada. nome={nome_normalizado}")

    try:
        config = carregar_config_pacientes()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    pacientes = config.get("pacientes", {})
    if nome_normalizado not in pacientes:
        print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' não encontrado para remoção.")
        raise HTTPException(status_code=404, detail=f"Assistido '{nome_normalizado}' não encontrado.")

    del pacientes[nome_normalizado]
    salvar_config_pacientes(config)
    print(f"{DEBUG_TAG} Paciente '{nome_normalizado}' removido com sucesso.")

    return {"mensagem": f"Assistido '{nome_normalizado}' removido com sucesso."}


if __name__ == "__main__":
    import uvicorn
    print("🔧[CAPYOS-DEBUG] Subindo servidor via uvicorn diretamente (modo dev)...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
