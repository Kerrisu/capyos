# CapyOS Frontend — Etapa 1: Setup + Tema

## Status
✅ Projeto criado (Vite + React), tema Minecraft aprovado migrado do
protótipo, capivara-gif integrada, build de produção testado sem erro aqui
no sandbox.

⚠️ **Ponto de atenção:** o `capy_dormindo.gif` está com ~2MB. É pesado pra
mobile. Quando for gerar as próximas poses, vale tentar reduzir paleta de
cores ou frames pra aliviar o tamanho do arquivo.

## Estrutura
```
capyos-frontend/
├── src/
│   ├── assets/
│   │   └── capy_dormindo.gif
│   ├── components/
│   │   ├── MinecraftButton.jsx
│   │   ├── MinecraftPanel.jsx
│   │   └── Capybara.jsx       (preparado pra receber mais poses depois)
│   ├── styles/
│   │   └── theme.css           (paleta, fontes, botão, painel)
│   ├── App.jsx
│   └── main.jsx
├── index.html
└── package.json
```

## Como rodar na sua máquina

```bash
cd capyos-frontend
npm install
npm run dev
```

Isso abre em algo como `http://localhost:5173`. Abre no navegador (ou no
celular, se estiver na mesma rede Wi-Fi, usando o IP da sua máquina em vez
de "localhost").

## O que testar

- [ ] A tela abre com o fundo em gradiente de céu
- [ ] A capivara aparece animando (respirando/balançando levemente)
- [ ] Os 3 botões cinza aparecem com o efeito de bisel 3D
- [ ] Clicar em cada botão muda o texto de feedback acima deles
- [ ] Testa também no celular (ou reduzindo a janela do navegador) pra ver
      se o layout se comporta bem em tela pequena

## Próximo passo (Etapa 2)
Conectar essa tela com o backend de verdade — puxar a lista de abas da
planilha via `/abas` e trocar os botões de "feedback fake" por ações reais.
