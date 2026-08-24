import { useState, useEffect } from "react";
import MinecraftButton from "./MinecraftButton";
import MinecraftPanel from "./MinecraftPanel";
import { obterConfiguracoesGerais, salvarConfiguracoesGerais } from "../api/capyos";

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

// Mesmo shape do modelo ConfiguracoesGerais no backend (models.py). Usado
// só como fallback antes do GET responder — nunca é o que vai pro banco.
const CONFIG_PADRAO = {
  permite_divisao_geral: true,
  salas_bloqueadas: [],
  url_planilha: "",
  ordem_salas_mezanino: [],
  ordem_salas_terreo: [],
  ordem_salas_preferencial: [],
  todas_as_salas: [],
  salas_fora_do_pool: [],
  url_vacancia: "",
  aplicadores_formados: {},
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 16,
  padding: 8,
  marginBottom: 14,
  fontFamily: "VT323, monospace",
  border: "2px solid #373737",
};

const labelStyle = {
  display: "block",
  fontSize: 16,
  color: "#2B2B2B",
  marginBottom: 4,
};

const secaoTituloStyle = {
  fontSize: 17,
  fontWeight: "bold",
  color: "#2B2B2B",
  marginTop: 18,
  marginBottom: 6,
  borderBottom: "2px solid #373737",
  paddingBottom: 3,
};

const secaoAjudaStyle = {
  fontSize: 13,
  color: "#555",
  marginBottom: 8,
};

function CheckboxCampo({ checked, onChange, label }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: 16,
        color: "#2B2B2B",
        marginBottom: 10,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, marginRight: 8 }}
      />
      {label}
    </label>
  );
}

// Grade de checkboxes pra escolher um subconjunto de `todasAsSalas`
// (usado por salas_bloqueadas, ordem_salas_terreo e salas_fora_do_pool —
// todas são "marque quais dessas salas se aplicam").
function GradeSalas({ todasAsSalas, selecionadas, onAlternar }) {
  if (todasAsSalas.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "#8B0000", marginBottom: 10 }}>
        Cadastre pelo menos uma sala em "Todas as salas do sistema" primeiro.
      </p>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        marginBottom: 10,
      }}
    >
      {todasAsSalas.map((sala) => (
        <CheckboxCampo
          key={sala}
          checked={selecionadas.includes(sala)}
          onChange={() => onAlternar(sala)}
          label={sala}
        />
      ))}
    </div>
  );
}

// Estados: carregando -> pronto -> salvando -> (volta pra "pronto", com
// sucesso temporário ou erro persistente)
export default function TelaConfiguracoes({ onVoltar }) {
  const [estado, setEstado] = useState("carregando");
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const [novaSalaTexto, setNovaSalaTexto] = useState("");
  const [novoAplicadorNome, setNovoAplicadorNome] = useState("");
  const [novoAplicadorSala, setNovoAplicadorSala] = useState("");

  useEffect(() => {
    console.log(`${DEBUG_TAG} TelaConfiguracoes montada. Buscando configuracoes_gerais...`);
    obterConfiguracoesGerais()
      .then((data) => {
        console.log(`${DEBUG_TAG} configuracoes_gerais recebida:`, data);
        setConfig({ ...CONFIG_PADRAO, ...data });
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao buscar configuracoes_gerais:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }, []);

  function atualizarCampo(campo, valor) {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
  }

  // Usado pelas 3 grades de checkbox (bloqueadas / terreo / fora do pool):
  // adiciona a sala na lista se não tiver, remove se já tiver.
  function alternarNaLista(campo, sala) {
    setConfig((atual) => {
      const lista = atual[campo];
      const jaTem = lista.includes(sala);
      return {
        ...atual,
        [campo]: jaTem ? lista.filter((s) => s !== sala) : [...lista, sala],
      };
    });
  }

  function adicionarSala() {
    const nome = novaSalaTexto.trim().replace(/\s+/g, " ").toUpperCase();
    if (!nome) return;
    if (config.todas_as_salas.includes(nome)) {
      setErro(`"${nome}" já está na lista de salas.`);
      return;
    }
    setErro("");
    setConfig((atual) => ({ ...atual, todas_as_salas: [...atual.todas_as_salas, nome] }));
    setNovaSalaTexto("");
  }

  // Remove a sala de TODO lugar que ela possa aparecer — não só de
  // todas_as_salas — pra nunca deixar uma referência solta apontando pra
  // uma sala que não existe mais (ex: sala citada em aplicadores_formados
  // mas removida do universo de salas).
  function removerSala(sala) {
    setConfig((atual) => ({
      ...atual,
      todas_as_salas: atual.todas_as_salas.filter((s) => s !== sala),
      salas_bloqueadas: atual.salas_bloqueadas.filter((s) => s !== sala),
      salas_fora_do_pool: atual.salas_fora_do_pool.filter((s) => s !== sala),
      ordem_salas_terreo: atual.ordem_salas_terreo.filter((s) => s !== sala),
      aplicadores_formados: Object.fromEntries(
        Object.entries(atual.aplicadores_formados).filter(([, salaDoAplicador]) => salaDoAplicador !== sala)
      ),
    }));
  }

  function adicionarAplicador() {
    const nome = novoAplicadorNome.trim().replace(/\s+/g, " ").toUpperCase();
    if (!nome || !novoAplicadorSala) return;
    setConfig((atual) => ({
      ...atual,
      aplicadores_formados: { ...atual.aplicadores_formados, [nome]: novoAplicadorSala },
    }));
    setNovoAplicadorNome("");
    setNovoAplicadorSala("");
  }

  function removerAplicador(nome) {
    setConfig((atual) => {
      const copia = { ...atual.aplicadores_formados };
      delete copia[nome];
      return { ...atual, aplicadores_formados: copia };
    });
  }

  function handleSalvar() {
    console.log(`${DEBUG_TAG} Salvando configuracoes_gerais:`, config);
    setEstado("salvando");
    setErro("");

    salvarConfiguracoesGerais(config)
      .then((data) => {
        console.log(`${DEBUG_TAG} configuracoes_gerais salva com sucesso:`, data);
        setConfig({ ...CONFIG_PADRAO, ...data });
        setEstado("pronto");
        setSucesso(true);
        setTimeout(() => setSucesso(false), 3000);
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao salvar configuracoes_gerais:`, e);
        setErro(e.message);
        setEstado("pronto");
      });
  }

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <MinecraftPanel title="Configurações Gerais">
        {estado === "carregando" && (
          <p style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B" }}>
            🟡 Carregando configurações...
          </p>
        )}

        {estado === "erro" && (
          <>
            <p style={{ fontSize: 16, color: "#8B0000", textAlign: "center", marginBottom: 12 }}>
              🔴 {erro}
            </p>
            <MinecraftButton onClick={onVoltar}>Voltar</MinecraftButton>
          </>
        )}

        {(estado === "pronto" || estado === "salvando") && (
          <>
            <div style={secaoTituloStyle}>Planilhas</div>
            <label style={labelStyle}>URL do Direcionamento de Salas:</label>
            <input
              type="text"
              value={config.url_planilha}
              onChange={(e) => atualizarCampo("url_planilha", e.target.value)}
              disabled={estado === "salvando"}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={inputStyle}
            />
            <label style={labelStyle}>URL da Vacância:</label>
            <input
              type="text"
              value={config.url_vacancia}
              onChange={(e) => atualizarCampo("url_vacancia", e.target.value)}
              disabled={estado === "salvando"}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={inputStyle}
            />

            <div style={secaoTituloStyle}>Divisão de sala</div>
            <CheckboxCampo
              checked={config.permite_divisao_geral}
              onChange={(v) => atualizarCampo("permite_divisao_geral", v)}
              label="Permitir divisão de sala (regra geral)"
            />

            <div style={secaoTituloStyle}>Todas as salas do sistema</div>
            <p style={secaoAjudaStyle}>
              Universo completo de salas conhecidas — inclui as 13 ABAs e
              qualquer sala especial (ex: Musicoterapia, Caixa de Areia).
              As grades abaixo só mostram salas que estiverem aqui.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {config.todas_as_salas.map((sala) => (
                <span
                  key={sala}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 14,
                    fontFamily: "VT323, monospace",
                    padding: "3px 6px",
                    border: "2px solid #373737",
                    background: "#F0F8FF",
                    color: "#2B2B2B",
                  }}
                >
                  {sala}
                  <button
                    type="button"
                    onClick={() => removerSala(sala)}
                    disabled={estado === "salvando"}
                    title={`Remover ${sala}`}
                    style={{
                      marginLeft: 6,
                      fontFamily: "VT323, monospace",
                      fontSize: 14,
                      border: "none",
                      background: "transparent",
                      color: "#8B0000",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {config.todas_as_salas.length === 0 && (
                <span style={{ fontSize: 14, color: "#8B0000" }}>Nenhuma sala cadastrada ainda.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <input
                type="text"
                value={novaSalaTexto}
                onChange={(e) => setNovaSalaTexto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarSala())}
                disabled={estado === "salvando"}
                placeholder="Ex: ABA 14, MUSICOTERAPIA COM TATAMES..."
                style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0 }}
              />
              <MinecraftButton
                onClick={adicionarSala}
                disabled={estado === "salvando"}
                style={{ width: "auto", flexShrink: 0, marginBottom: 0, whiteSpace: "nowrap" }}
              >
                + Add
              </MinecraftButton>
            </div>

            <div style={secaoTituloStyle}>Salas bloqueadas</div>
            <p style={secaoAjudaStyle}>Não recebem ninguém automaticamente nem manual.</p>
            <GradeSalas
              todasAsSalas={config.todas_as_salas}
              selecionadas={config.salas_bloqueadas}
              onAlternar={(sala) => alternarNaLista("salas_bloqueadas", sala)}
            />

            <div style={secaoTituloStyle}>Salas do térreo</div>
            <p style={secaoAjudaStyle}>
              Marcadas aqui = térreo. As demais (dentre "Todas as salas") são
              tratadas como mezanino.
            </p>
            <GradeSalas
              todasAsSalas={config.todas_as_salas}
              selecionadas={config.ordem_salas_terreo}
              onAlternar={(sala) => alternarNaLista("ordem_salas_terreo", sala)}
            />

            <div style={secaoTituloStyle}>Salas fora do pool automático</div>
            <p style={secaoAjudaStyle}>
              Continuam existindo e aceitando sala fixa, mas o algoritmo
              nunca aloca ninguém nelas automaticamente (ex: Musicoterapia
              com Tatames, Caixa de Areia, Mercado da Inclusão).
            </p>
            <GradeSalas
              todasAsSalas={config.todas_as_salas}
              selecionadas={config.salas_fora_do_pool}
              onAlternar={(sala) => alternarNaLista("salas_fora_do_pool", sala)}
            />

            <div style={secaoTituloStyle}>Aplicadores formados</div>
            <p style={secaoAjudaStyle}>
              Igual a Regra do Jorge: assistidos desse profissional vão
              sempre pra sala configurada, ignorando bloqueio e demais
              regras. Combina com o início do nome do profissional na
              planilha.
            </p>
            {Object.entries(config.aplicadores_formados).length === 0 && (
              <p style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>Nenhum cadastrado ainda.</p>
            )}
            {Object.entries(config.aplicadores_formados).map(([nomeAplicador, sala]) => (
              <div
                key={nomeAplicador}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 15,
                  color: "#2B2B2B",
                  padding: "4px 0",
                  borderBottom: "1px solid #E0E0E0",
                  marginBottom: 4,
                }}
              >
                <span>
                  <strong>{nomeAplicador}</strong> → {sala}
                </span>
                <button
                  type="button"
                  onClick={() => removerAplicador(nomeAplicador)}
                  disabled={estado === "salvando"}
                  style={{
                    fontFamily: "VT323, monospace",
                    fontSize: 14,
                    padding: "2px 8px",
                    border: "2px solid #373737",
                    background: "#FFD4D4",
                    color: "#2B2B2B",
                    cursor: "pointer",
                  }}
                >
                  Remover
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 14 }}>
              <input
                type="text"
                value={novoAplicadorNome}
                onChange={(e) => setNovoAplicadorNome(e.target.value)}
                disabled={estado === "salvando"}
                placeholder="Nome do profissional"
                style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0 }}
              />
              <select
                value={novoAplicadorSala}
                onChange={(e) => setNovoAplicadorSala(e.target.value)}
                disabled={estado === "salvando"}
                style={{ ...inputStyle, marginBottom: 0, width: 120 }}
              >
                <option value="">Sala...</option>
                {config.todas_as_salas.map((sala) => (
                  <option key={sala} value={sala}>
                    {sala}
                  </option>
                ))}
              </select>
              <MinecraftButton
                onClick={adicionarAplicador}
                disabled={estado === "salvando" || !novoAplicadorNome.trim() || !novoAplicadorSala}
                style={{ width: "auto", flexShrink: 0, marginBottom: 0, whiteSpace: "nowrap" }}
              >
                + Add
              </MinecraftButton>
            </div>

            {erro && (
              <p style={{ fontSize: 15, color: "#8B0000", marginBottom: 10 }}>
                🔴 {erro}
              </p>
            )}

            <MinecraftButton onClick={handleSalvar} disabled={estado === "salvando"}>
              {estado === "salvando" ? "Salvando..." : sucesso ? "✅ Salvo!" : "Salvar configurações"}
            </MinecraftButton>

            <MinecraftButton onClick={onVoltar} disabled={estado === "salvando"}>
              Voltar
            </MinecraftButton>
          </>
        )}
      </MinecraftPanel>
    </div>
  );
}
