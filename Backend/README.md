# CapyOS Backend — Etapa 2: Conexão com Google Sheets

## Status
- ✅ Etapa 1 (esqueleto FastAPI) — testada aqui no sandbox.
- ✅ Etapa 2 (lógica adaptada + rota /abas) — testada aqui no sandbox com credenciais
  falsas (só validando o fluxo). **Falta testar com sua planilha de verdade — isso só
  dá pra fazer na sua máquina**, porque meu ambiente aqui não alcança domínios do Google.

## Como testar na sua máquina

### 1. Preparar o ambiente
```bash
cd capyos-backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Colocar suas credenciais (escolha UMA opção)

**Opção A — arquivo local (mais rápido pra testar agora):**
Coloque seu `credenciais.json` de verdade na raiz da pasta `capyos-backend/`
(mesmo nível do `main.py`). Ele já está no `.gitignore`, então não corre risco
de ir pro GitHub sem querer.

**Opção B — variável de ambiente (é como vai funcionar em produção):**
Copie `.env.example` para `.env` e cole o conteúdo do seu `credenciais.json`
em uma linha só na variável `GOOGLE_CREDENTIALS_JSON`. Pra gerar essa linha
única, rode:
```bash
python -c "import json; print(json.dumps(json.load(open('credenciais.json'))))"
```
e cole o resultado no `.env`.

### 3. Subir o servidor
```bash
uvicorn main:app --reload
```
Você deve ver no terminal os logs `🔧[CAPYOS-DEBUG]` confirmando que o servidor
subiu.

### 4. Testar as rotas
Abra outro terminal (ou o navegador) e teste:

```bash
# Deve retornar status ok
curl http://localhost:8000/health

# Deve confirmar que achou suas credenciais (mostra seu client_email e project_id,
# NUNCA a chave privada)
curl http://localhost:8000/debug/credenciais-status

# Troque a URL pela URL real da sua planilha de escala
curl "http://localhost:8000/abas?url=SUA_URL_DA_PLANILHA_AQUI"
```

**O que esperar em `/abas`:**
- ✅ Se der certo: `{"abas": ["Segunda", "Terça", ...]}` (os nomes reais das suas abas)
- ❌ Se der erro 502: confira no terminal do servidor os logs `🔧[CAPYOS-DEBUG]`
  — eles vão te dizer exatamente onde travou (credencial não achada, planilha não
  compartilhada com o e-mail da service account, URL errada, etc.)

**Atenção:** a planilha precisa estar compartilhada com o e-mail da sua service
account (o `client_email` que aparece em `/debug/credenciais-status`), senão o
Google nega o acesso mesmo com a credencial certa.

### 5. Também dá pra ver a documentação interativa
Com o servidor rodando, acesse `http://localhost:8000/docs` no navegador — o
FastAPI gera uma interface pra testar as rotas clicando, sem precisar de curl.

---

## Quando isso funcionar, me avisa o resultado
Me manda o que apareceu (sucesso com as abas, ou o erro que apareceu no log)
que a gente segue pra Etapa 3: a rota `/gerar-escala`, que já roda o algoritmo
de distribuição de salas de verdade.
