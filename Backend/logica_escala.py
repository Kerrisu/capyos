"""
CapyOS Backend - logica_escala.py (adaptado da versão desktop)

Principais mudanças em relação ao original:
1. Removida a dependência de caminho de .exe (sys._MEIPASS) para achar credenciais.
2. Credenciais agora podem vir de:
   a) Variável de ambiente GOOGLE_CREDENTIALS_JSON (conteúdo do credenciais.json como string) -> USO EM PRODUÇÃO
   b) Arquivo local "credenciais.json" na raiz do projeto -> USO EM DESENVOLVIMENTO LOCAL (nunca commitar!)
3. callback_progresso continua existindo (mantém compatibilidade com a lógica original),
   mas agora ele só imprime debug — quem realmente vai acompanhar progresso pela rota
   HTTP receberá o resultado final de uma vez (streaming de progresso fica pra uma etapa futura, se quiser).
"""

import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os
import json
import unicodedata

# --- CONFIGURAÇÕES ---
HORARIOS_PADRAO = ["13:15H", "14:00H", "14:45H", "15:30H", "16:15H", "17:00H", "17:45H"]

DEBUG_TAG = "🔧[CAPYOS-DEBUG]"


def carregar_credenciais_dict():
    """
    Retorna o dicionário de credenciais do Google, buscando primeiro na
    variável de ambiente (produção) e depois no arquivo local (desenvolvimento).
    """
    creds_env = os.environ.get("GOOGLE_CREDENTIALS_JSON")

    if creds_env:
        print(f"{DEBUG_TAG} Credenciais encontradas via variável de ambiente GOOGLE_CREDENTIALS_JSON.")
        try:
            return json.loads(creds_env)
        except json.JSONDecodeError as e:
            print(f"{DEBUG_TAG} ERRO: GOOGLE_CREDENTIALS_JSON não é um JSON válido: {e}")
            raise

    # Fallback para desenvolvimento local
    caminho_local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "credenciais.json")
    print(f"{DEBUG_TAG} Variável de ambiente não encontrada. Tentando arquivo local: {caminho_local}")

    if os.path.exists(caminho_local):
        print(f"{DEBUG_TAG} Arquivo local de credenciais encontrado, carregando...")
        with open(caminho_local, "r", encoding="utf-8") as f:
            return json.load(f)

    print(f"{DEBUG_TAG} ERRO: Nenhuma credencial encontrada (nem env var, nem arquivo local).")
    raise FileNotFoundError(
        "Credenciais do Google não encontradas. Configure GOOGLE_CREDENTIALS_JSON "
        "ou coloque um credenciais.json na raiz do projeto (apenas em dev local)."
    )


def conectar_google_sheets(url_planilha):
    print(f"{DEBUG_TAG} Iniciando conexão com Google Sheets para URL: {url_planilha}")
    escopos = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]

    creds_dict = carregar_credenciais_dict()
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, escopos)
    print(f"{DEBUG_TAG} Credenciais carregadas com sucesso. Autorizando cliente gspread...")

    client = gspread.authorize(creds)
    print(f"{DEBUG_TAG} Cliente gspread autorizado. Abrindo planilha...")

    planilha = client.open_by_url(url_planilha)
    print(f"{DEBUG_TAG} Planilha aberta com sucesso: '{planilha.title}'")
    return planilha


# FUNÇÃO PARA LISTAR ABAS DISPONÍVEIS NA PLANILHA
def listar_abas(url_planilha):
    """Retorna uma lista com os nomes de todas as abas da planilha"""
    print(f"{DEBUG_TAG} listar_abas() chamada com url={url_planilha}")
    try:
        planilha = conectar_google_sheets(url_planilha)
        abas = [aba.title for aba in planilha.worksheets()]
        print(f"{DEBUG_TAG} Abas encontradas: {abas}")
        return abas
    except Exception as e:
        print(f"{DEBUG_TAG} ERRO ao listar abas: {e}")
        return []


# --- PROCESSAMENTO DA ESCALA ---

# --- CORES DE REFERÊNCIA (calibradas em 06/08/2026 com a planilha real) ---
# Usamos combinação EXATA (com pequena tolerância) em vez de faixas soltas,
# porque a planilha ganhou mais cores (rosa/magenta, azul, cinza) e faixas
# soltas tipo "g > 0.65" acabavam capturando cores erradas por engano
# (ex: o azul da PISCINA caía dentro da faixa de verde).
COR_VERDE = (0.4, 1.0, 0.6)      # REFERÊNCIA
COR_AMARELO = (1.0, 1.0, 0.4)    # SUPRIDA
TOLERANCIA_COR = 0.05


def _cor_bate(r, g, b, alvo):
    """Confere se a cor (r,g,b) está bem próxima da cor alvo, com tolerância pequena."""
    return (
        abs(r - alvo[0]) <= TOLERANCIA_COR and
        abs(g - alvo[1]) <= TOLERANCIA_COR and
        abs(b - alvo[2]) <= TOLERANCIA_COR
    )


def _normalizar(texto):
    """Maiúsculo e sem acento, pra comparações de texto não falharem por causa de á/ã/ç etc."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).upper().strip()


def processar_escala(url_planilha, callback_progresso, nome_aba):
    """
    callback_progresso: função que recebe (valor_float, texto_status).
    Na versão desktop, ela mexia direto na barra do Tkinter.
    Aqui, por padrão, ela só imprime debug — mas mantém a assinatura
    para não quebrar compatibilidade e permitir um futuro sistema de
    progresso em tempo real via WebSocket, se você quiser.
    """
    try:
        callback_progresso(0.1, "Conectando e baixando metadados...")
        print(f"{DEBUG_TAG} processar_escala() iniciada. nome_aba={nome_aba}")

        planilha = conectar_google_sheets(url_planilha)
        try:
            aba = planilha.worksheet(nome_aba)
            print(f"{DEBUG_TAG} Aba '{nome_aba}' encontrada.")
        except Exception:
            aba = planilha.get_worksheet(0)
            print(f"{DEBUG_TAG} Aba '{nome_aba}' NÃO encontrada, usando a primeira aba disponível: '{aba.title}'")

        # IMPORTANTE: restringimos a busca só à aba desejada (ranges) e só
        # aos campos que realmente usamos (fields). Sem isso, o Google
        # Sheets devolve a formatação completa de TODAS as abas da
        # planilha inteira, o que estoura a memória do servidor (Render
        # free tem só 512MB) em planilhas grandes.
        fmt = aba.spreadsheet.fetch_sheet_metadata({
            "ranges": [aba.title],
            "includeGridData": True,
            "fields": "sheets.properties.title,sheets.data.rowData.values.formattedValue,sheets.data.rowData.values.effectiveFormat.backgroundColor",
        })
        sheet_data = [s for s in fmt['sheets'] if s['properties']['title'] == aba.title][0]
        rows_data = sheet_data['data'][0].get('rowData', [])
        print(f"{DEBUG_TAG} {len(rows_data)} linhas baixadas da planilha.")

        pacientes_encontrados = []
        registrados = set()
        horarios_limpos = [h.replace("H", "").strip().upper() for h in HORARIOS_PADRAO]

        # Mapa coluna -> nome do profissional daquele bloco. É atualizado toda
        # vez que encontramos uma linha "HORÁRIO" (a linha ANTERIOR a ela tem
        # os nomes dos profissionais). Isso é necessário pra regra do Jorge
        # (assistidos dele vão sempre pra ABA 04), já que a ordem das colunas
        # muda de bloco pra bloco no dia.
        mapa_coluna_profissional = {}
        linha_anterior_values = None

        total_linhas = len(rows_data)
        callback_progresso(0.3, "Analisando cores dos pacientes...")

        for i, row in enumerate(rows_data):
            if i % 5 == 0:
                prog = 0.3 + (float(i) / float(total_linhas)) * 0.6 if total_linhas else 0.3
                callback_progresso(prog, f"Processando linha {i}...")

            values = row.get('values', [])
            if not values:
                linha_anterior_values = values
                continue

            texto_coluna_a_bruto = values[0].get('formattedValue', '').strip()
            texto_normalizado = _normalizar(texto_coluna_a_bruto)

            if texto_normalizado == "HORARIO":
                novo_mapa = {}
                if linha_anterior_values:
                    for j, cell in enumerate(linha_anterior_values):
                        if j == 0:
                            continue
                        nome_prof = cell.get('formattedValue', '').strip()
                        if nome_prof:
                            novo_mapa[j] = nome_prof
                if novo_mapa:
                    mapa_coluna_profissional = novo_mapa
                    print(f"{DEBUG_TAG} Novo bloco de profissionais detectado: {mapa_coluna_profissional}")
                linha_anterior_values = values
                continue

            texto_coluna_a = texto_coluna_a_bruto.upper().replace("H", "")

            if texto_coluna_a not in horarios_limpos:
                linha_anterior_values = values
                continue

            for j, cell in enumerate(values):
                if j == 0:
                    continue

                valor = cell.get('formattedValue', '').strip()
                if not valor:
                    continue

                nome_limpo = " ".join(valor.upper().split())
                chave_unica = (nome_limpo, texto_coluna_a)

                if chave_unica in registrados:
                    continue

                cor_data = cell.get('effectiveFormat', {}).get('backgroundColor', {})
                r = cor_data.get('red', 0)
                g = cor_data.get('green', 0)
                b = cor_data.get('blue', 0)

                is_verde = _cor_bate(r, g, b, COR_VERDE)
                is_amarelo = _cor_bate(r, g, b, COR_AMARELO)

                if is_verde or is_amarelo:
                    pacientes_encontrados.append({
                        "nome": nome_limpo,
                        "horario": texto_coluna_a + "H",
                        "tipo": "REFERENCIA" if is_verde else "SUPRIDA",
                        "profissional": mapa_coluna_profissional.get(j)
                    })
                    registrados.add(chave_unica)

            linha_anterior_values = values

        callback_progresso(0.9, "Organizando lista final...")
        print(f"{DEBUG_TAG} processar_escala() concluída. {len(pacientes_encontrados)} pacientes encontrados.")
        return pacientes_encontrados

    except Exception as e:
        print(f"{DEBUG_TAG} ERRO em processar_escala(): {e}")
        return f"Erro no processamento: {str(e)}"


# --- DIAGNÓSTICO DE CORES (usado quando a planilha muda o padrão visual) ---

def inspecionar_cores(url_planilha, nome_aba):
    """
    Não classifica nada. Só varre as células preenchidas nos horários padrão
    e devolve a cor RGB crua de cada uma, pra gente conseguir recalibrar
    is_verde/is_amarelo quando a planilha mudar de tom.
    """
    print(f"{DEBUG_TAG} inspecionar_cores() iniciada. nome_aba={nome_aba}")
    try:
        planilha = conectar_google_sheets(url_planilha)
        try:
            aba = planilha.worksheet(nome_aba)
        except Exception:
            aba = planilha.get_worksheet(0)
            print(f"{DEBUG_TAG} Aba '{nome_aba}' não encontrada, usando a primeira: '{aba.title}'")

        # Mesma restrição de processar_escala: só a aba certa, só os campos
        # usados, pra não estourar a memória do servidor.
        fmt = aba.spreadsheet.fetch_sheet_metadata({
            "ranges": [aba.title],
            "includeGridData": True,
            "fields": "sheets.properties.title,sheets.data.rowData.values.formattedValue,sheets.data.rowData.values.effectiveFormat.backgroundColor",
        })
        sheet_data = [s for s in fmt['sheets'] if s['properties']['title'] == aba.title][0]
        rows_data = sheet_data['data'][0].get('rowData', [])

        horarios_limpos = [h.replace("H", "").strip().upper() for h in HORARIOS_PADRAO]
        amostras = []

        for row in rows_data:
            values = row.get('values', [])
            if not values:
                continue

            texto_coluna_a = values[0].get('formattedValue', '').strip().upper().replace("H", "")
            if texto_coluna_a not in horarios_limpos:
                continue

            for j, cell in enumerate(values):
                if j == 0:
                    continue
                valor = cell.get('formattedValue', '').strip()
                if not valor:
                    continue

                cor_data = cell.get('effectiveFormat', {}).get('backgroundColor', {})
                r = round(cor_data.get('red', 0), 3)
                g = round(cor_data.get('green', 0), 3)
                b = round(cor_data.get('blue', 0), 3)

                veredito = "VERDE" if _cor_bate(r, g, b, COR_VERDE) else (
                    "AMARELO" if _cor_bate(r, g, b, COR_AMARELO) else "ignorado"
                )

                amostras.append({
                    "nome": " ".join(valor.upper().split()),
                    "horario": texto_coluna_a + "H",
                    "r": r,
                    "g": g,
                    "b": b,
                    "veredito": veredito
                })

        print(f"{DEBUG_TAG} inspecionar_cores() concluída. {len(amostras)} células amostradas.")
        return amostras

    except Exception as e:
        print(f"{DEBUG_TAG} ERRO em inspecionar_cores(): {e}")
        return f"Erro: {str(e)}"


# --- FUNÇÃO DE DISTRIBUIÇÃO DE SALAS (IA) ---

def distribuir_salas_ia(lista_pacientes, configuracoes):
    print(f"{DEBUG_TAG} distribuir_salas_ia() iniciada com {len(lista_pacientes) if isinstance(lista_pacientes, list) else 'N/A'} pacientes.")

    pacientes_db = configuracoes.get("pacientes", {})
    regras_gerais = configuracoes.get("configuracoes_gerais", {})

    super_grupo = [
        "LUCCA CAVALCANTI", "LUCAS EMANUEL", "JONATHAN BEZERRA", "CHRISTIAN RAFAEL",
        "LUCCA GREGO", "CALEB SANTOS", "YCARO AZEVEDO",
        "YURI AZEVEDO", "MURILO GONÇALVES", "DAVI HEITOR", "LUCAS BENTO", "JOSE MARCOS",
        "BERNARDO RIBEIRO", "WILLIAM ALVES"
    ]

    apelidos = {
        "MALU": "MARIA LUIZA",
        "LAVINIA F": "LAVINIA FIGUEIRAS",
        "LAVINIA FIGUEIRA": "LAVINIA FIGUEIRAS",
        "LUCAS E": "LUCAS EMANUEL",
        "ANTONY V": "ANTHONY VINICIUS",
        "ANTHONY VINCIUS": "ANTHONY VINICIUS",
        "PEDRO ACIOLLY": "PEDRO ACCIOLY",
        "WILLIAM": "WILLIAM ALVES",
        "WILLIAN": "WILLIAM ALVES"
    }

    salas_terreo = regras_gerais.get("ordem_salas_terreo", [])
    bloqueadas = regras_gerais.get("salas_bloqueadas", [])

    # A ordem de preferência agora vem do config_pacientes.json (chave
    # "ordem_salas_preferencial" dentro de configuracoes_gerais). Se não
    # existir lá (ex: config antigo), usamos essa lista como valor padrão
    # de segurança, idêntica à que sempre esteve fixa no código.
    ordem_padrao_fallback = ["ABA 13", "ABA 12", "ABA 11", "ABA 10", "ABA 09", "ABA 08", "ABA 07", "ABA 05", "ABA 01", "ABA 02", "ABA 03", "ABA 04"]
    ordem_preferencial = regras_gerais.get("ordem_salas_preferencial", ordem_padrao_fallback)
    if "ordem_salas_preferencial" not in regras_gerais:
        print(f"{DEBUG_TAG} AVISO: 'ordem_salas_preferencial' não está no config_pacientes.json, usando lista padrão de fallback.")
    salas_ativas = [s for s in ordem_preferencial if s not in bloqueadas]

    horarios = ["13:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45"]
    mapa_final = {sala: {h: "" for h in horarios} for sala in salas_ativas + bloqueadas}

    pacientes_alocados_no_horario = {h: set() for h in horarios}
    nao_alocados = []

    if not isinstance(lista_pacientes, list):
        print(f"{DEBUG_TAG} ERRO: lista_pacientes não é uma lista (provavelmente veio uma mensagem de erro do processar_escala): {lista_pacientes}")
        return mapa_final, nao_alocados

    fila = sorted(lista_pacientes, key=lambda x: (
        not pacientes_db.get(apelidos.get(x['nome'].strip().upper(), x['nome'].strip().upper()), {}).get('sala_fixa', ''),
        not pacientes_db.get(apelidos.get(x['nome'].strip().upper(), x['nome'].strip().upper()), {}).get('prioridade_clinica', False),
        apelidos.get(x['nome'].strip().upper(), x['nome'].strip().upper()) not in super_grupo
    ))

    for p in fila:
        nome_original = p['nome'].strip().upper()
        nome = apelidos.get(nome_original, nome_original)

        horario = p['horario'].replace("H", "").strip()
        info = pacientes_db.get(nome, {})
        if nome in pacientes_alocados_no_horario[horario]:
            continue

        sala_destinada = None

        # --- REGRA DO JORGE: assistidos dele vão sempre pra ABA 04, ---
        # --- ignorando bloqueio de sala e qualquer outra regra. ------
        if p.get("profissional") and _normalizar(p["profissional"]) == "JORGE":
            conteudo_atual_aba04 = mapa_final["ABA 04"][horario]
            if not conteudo_atual_aba04:
                mapa_final["ABA 04"][horario] = nome_original
            else:
                ja_tem = nome_original in conteudo_atual_aba04
                if not ja_tem:
                    qtd_atual = len(conteudo_atual_aba04.split(" / "))
                    mapa_final["ABA 04"][horario] = f"{conteudo_atual_aba04} / {nome_original}"
                    if qtd_atual + 1 > 2:
                        print(f"{DEBUG_TAG} AVISO: mais de 2 assistidos do Jorge na ABA 04 às {horario} — confira se está correto: {mapa_final['ABA 04'][horario]}")
            sala_destinada = "ABA 04"
            pacientes_alocados_no_horario[horario].add(nome)
            continue

        sf = info.get("sala_fixa")
        if sf and sf in mapa_final and sf not in bloqueadas:
            if not mapa_final[sf][horario] or nome_original in mapa_final[sf][horario]:
                sala_destinada = sf
                mapa_final[sf][horario] = nome_original

        if not sala_destinada:
            for sala in salas_ativas:
                conteudo_atual = mapa_final[sala][horario]

                if not conteudo_atual:
                    if info.get("resistencia_escada") and sala not in salas_terreo:
                        continue
                    sala_destinada = sala
                    mapa_final[sala][horario] = nome_original
                    break
                else:
                    dono_nome_bruto = conteudo_atual.split(" / ")[0].strip()
                    dono_nome = apelidos.get(dono_nome_bruto.upper(), dono_nome_bruto.upper())
                    info_dono = pacientes_db.get(dono_nome, {})

                    pode_entrar = not info_dono.get("sala_fixa") and info_dono.get("divide_sala", True)

                    if pode_entrar and len(conteudo_atual.split(" / ")) < 2:
                        mesmo_grupo = info.get("grupo_match") == info_dono.get("grupo_match") and info.get("grupo_match") is not None
                        if mesmo_grupo or nome in super_grupo:
                            mapa_final[sala][horario] = f"{conteudo_atual} / {nome_original}"
                            sala_destinada = sala
                            break

        if not sala_destinada and info.get("prioridade_clinica"):
            for sala in salas_ativas:
                conteudo_atual = mapa_final[sala][horario]
                if conteudo_atual:
                    dono_nome_bruto = conteudo_atual.split(" / ")[0].strip()
                    dono_nome = apelidos.get(dono_nome_bruto.upper(), dono_nome_bruto.upper())
                    info_dono = pacientes_db.get(dono_nome, {})

                    if not info_dono.get("sala_fixa") and info_dono.get("divide_sala", True):
                        if len(conteudo_atual.split(" / ")) < 3:
                            mapa_final[sala][horario] = f"{conteudo_atual} / {nome_original}"
                            sala_destinada = sala
                            break

        if sala_destinada:
            if " / " not in mapa_final[sala_destinada][horario]:
                mapa_final[sala_destinada][horario] = nome_original
            pacientes_alocados_no_horario[horario].add(nome)
        else:
            nao_alocados.append(f"{horario} - {nome_original}")

    print(f"{DEBUG_TAG} distribuir_salas_ia() concluída. {len(nao_alocados)} pacientes sem sala.")
    return mapa_final, nao_alocados


# --- FORMATAÇÃO PARA TEXTO FINAL ---

def formatar_mapa_para_texto(mapa_final, nao_alocados):
    """Transforma o dicionário de salas no texto final formatado para o usuário."""
    print(f"{DEBUG_TAG} formatar_mapa_para_texto() chamada.")
    texto = "📌*Deem prioridade aos menores estar no MEZANINO. As ABAS de baixo são prioritárias dos assistidos com resistências as escadas!*\n\n"
    texto += "*VACÂNCIA DIÁRIA*✨💚\n\n"

    horarios = ["13:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45"]
    salas_ordenadas = sorted(mapa_final.keys(), key=lambda x: int(x.split()[1]))

    for sala in salas_ordenadas:
        eh_normalmente_bloqueada = "04" in sala or "06" in sala
        tem_ocupante = any(mapa_final[sala].get(h) for h in horarios)

        if eh_normalmente_bloqueada and not tem_ocupante:
            icon = "❌"
        elif eh_normalmente_bloqueada and tem_ocupante:
            # Bloqueada pra uso geral, mas tem gente lá (ex: exceção do Jorge
            # na ABA 04) — precisa aparecer, senão a equipe não vê quem tá lá.
            icon = "🔒"
        else:
            icon = "✨"

        texto += f"*{sala}* {icon}\n"

        if icon == "❌":
            texto += "\n"
            continue

        for h in horarios:
            paciente = mapa_final[sala].get(h, "")
            texto += f"{h} {paciente}\n"
        texto += "\n"

    texto += "---\n⚠️ *ALERTA: PACIENTES SEM SALA (LOTADO)*\n"

    if not nao_alocados:
        texto += "✅ Todos os pacientes foram alocados com sucesso."
    else:
        for item in nao_alocados:
            if isinstance(item, dict):
                h_p = item.get('horario', '??:??')
                n_p = item.get('nome', 'Desconhecido')
                texto += f"• {h_p} - {n_p}\n"
            else:
                texto += f"• Horário não definido - {item}\n"

    return texto
