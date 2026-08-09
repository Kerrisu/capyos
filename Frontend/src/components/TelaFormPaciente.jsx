import { useState, useEffect } from "react";
import MinecraftButton from "./MinecraftButton";
import MinecraftPanel from "./MinecraftPanel";
import { buscarPaciente, salvarPaciente } from "../api/capyos";

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

const CONFIG_PADRAO = {
  sala_fixa: "",
  resistencia_escada: false,
  preferencia_mezanino: false,
  aceita_externo: true,
  prioridade_clinica: false,
  divide_sala: true,
  grupo_match: "",
};

const SALAS = Array.from({ length: 13 }, (_, i) => `ABA ${String(i + 1).padStart(2, "0")}`);

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 16,
  padding: 8,
  marginBottom: 14,
  fontFamily: "VT323, monospace",
  border: "2px solid #373737",
};

const selectStyle = { ...inputStyle };

const labelStyle = {
  display: "block",
  fontSize: 16,
  color: "#2B2B2B",
  marginBottom: 4,
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

// Estados: (se editando) carregando -> pronto ; (se novo) pronto direto
// pronto -> salvando -> (volta pra "pronto" com erro, ou dispara onSalvo)
export default function TelaFormPaciente({ nomeInicial, gruposExistentes = [], onVoltar, onSalvo }) {
  const modoEdicao = Boolean(nomeInicial);
  const [estado, setEstado] = useState(modoEdicao ? "carregando" : "pronto");
  const [nome, setNome] = useState(nomeInicial || "");
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [erro, setErro] = useState("");
  const [modoNovoGrupo, setModoNovoGrupo] = useState(false);

  useEffect(() => {
    if (!modoEdicao) return;
    console.log(`${DEBUG_TAG} TelaFormPaciente montada em modo edição. Buscando ${nomeInicial}...`);
    buscarPaciente(nomeInicial)
      .then((data) => {
        console.log(`${DEBUG_TAG} Paciente encontrado:`, data);
        const grupoAtual = data.config.grupo_match || "";
        setConfig({ ...CONFIG_PADRAO, ...data.config, grupo_match: grupoAtual });
        // Se o grupo salvo não está mais na lista de grupos existentes (ex: só esse
        // paciente tinha esse grupo), abre direto no modo "digitar" pra não perder o valor.
        if (grupoAtual && !gruposExistentes.includes(grupoAtual)) {
          setModoNovoGrupo(true);
        }
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao buscar paciente:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }, [modoEdicao, nomeInicial]);

  function atualizarCampo(campo, valor) {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
  }

  function handleSalvar() {
    // Colapsa espaços duplicados no meio do texto (ex: "ARTHUR  FERNANDES" -> "ARTHUR FERNANDES"),
    // além do trim nas pontas. Evita duplicatas silenciosas por formatação de digitação.
    const nomeLimpo = nome.trim().replace(/\s+/g, " ");
    if (!nomeLimpo) {
      setErro("O nome do assistido é obrigatório.");
      return;
    }

    const grupoLimpo = config.grupo_match.trim().replace(/\s+/g, " ");

    console.log(`${DEBUG_TAG} Salvando paciente: ${nomeLimpo}`, config);
    setEstado("salvando");
    setErro("");

    salvarPaciente(nomeLimpo, {
      ...config,
      grupo_match: grupoLimpo || null,
    })
      .then((data) => {
        console.log(`${DEBUG_TAG} Paciente salvo com sucesso:`, data);
        onSalvo();
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao salvar paciente:`, e);
        setErro(e.message);
        setEstado("pronto");
      });
  }

  return (
    <div style={{ width: "100%", maxWidth: 460 }}>
      <MinecraftPanel title={modoEdicao ? `Editar: ${nomeInicial}` : "Novo Assistido"}>
        {estado === "carregando" && (
          <p style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B" }}>
            🟡 Carregando dados do assistido...
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
            <label style={labelStyle}>Nome do assistido:</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={modoEdicao || estado === "salvando"}
              placeholder="Ex: ARTHUR FERNANDES"
              style={{
                ...inputStyle,
                background: modoEdicao ? "#E8E8E8" : "#FFFFFF",
              }}
            />

            <label style={labelStyle}>Sala fixa (opcional):</label>
            <select
              value={config.sala_fixa}
              onChange={(e) => atualizarCampo("sala_fixa", e.target.value)}
              disabled={estado === "salvando"}
              style={selectStyle}
            >
              <option value="">— Nenhuma —</option>
              {SALAS.map((sala) => (
                <option key={sala} value={sala}>
                  {sala}
                </option>
              ))}
              {config.sala_fixa && !SALAS.includes(config.sala_fixa) && (
                <option value={config.sala_fixa}>{config.sala_fixa} (valor atual, fora da lista)</option>
              )}
            </select>

            <label style={labelStyle}>Grupo match (opcional):</label>
            {!modoNovoGrupo ? (
              <select
                value={config.grupo_match}
                onChange={(e) => {
                  if (e.target.value === "__novo__") {
                    atualizarCampo("grupo_match", "");
                    setModoNovoGrupo(true);
                  } else {
                    atualizarCampo("grupo_match", e.target.value);
                  }
                }}
                disabled={estado === "salvando"}
                style={selectStyle}
              >
                <option value="">— Nenhum —</option>
                {gruposExistentes.map((grupo) => (
                  <option key={grupo} value={grupo}>
                    {grupo}
                  </option>
                ))}
                <option value="__novo__">+ Digitar novo grupo...</option>
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={config.grupo_match}
                  onChange={(e) => atualizarCampo("grupo_match", e.target.value)}
                  disabled={estado === "salvando"}
                  placeholder="Ex: GRUPO-A"
                  style={{ ...inputStyle, marginBottom: 6 }}
                  autoFocus
                />
                {gruposExistentes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setModoNovoGrupo(false);
                      atualizarCampo("grupo_match", "");
                    }}
                    disabled={estado === "salvando"}
                    style={{
                      fontFamily: "VT323, monospace",
                      fontSize: 14,
                      padding: "3px 8px",
                      border: "2px solid #373737",
                      background: "#F0F8FF",
                      color: "#2B2B2B",
                      cursor: "pointer",
                      marginBottom: 14,
                    }}
                  >
                    Escolher um grupo existente
                  </button>
                )}
              </>
            )}

            <CheckboxCampo
              checked={config.aceita_externo}
              onChange={(v) => atualizarCampo("aceita_externo", v)}
              label="Aceita externo"
            />
            <CheckboxCampo
              checked={config.divide_sala}
              onChange={(v) => atualizarCampo("divide_sala", v)}
              label="Divide sala"
            />
            <CheckboxCampo
              checked={config.resistencia_escada}
              onChange={(v) => atualizarCampo("resistencia_escada", v)}
              label="Resistência a escada"
            />
            <CheckboxCampo
              checked={config.preferencia_mezanino}
              onChange={(v) => atualizarCampo("preferencia_mezanino", v)}
              label="Preferência por mezanino"
            />
            <CheckboxCampo
              checked={config.prioridade_clinica}
              onChange={(v) => atualizarCampo("prioridade_clinica", v)}
              label="Prioridade clínica"
            />

            {erro && (
              <p style={{ fontSize: 15, color: "#8B0000", marginBottom: 10 }}>
                🔴 {erro}
              </p>
            )}

            <MinecraftButton onClick={handleSalvar} disabled={estado === "salvando"}>
              {estado === "salvando" ? "Salvando..." : "Salvar"}
            </MinecraftButton>

            <MinecraftButton onClick={onVoltar} disabled={estado === "salvando"}>
              Cancelar
            </MinecraftButton>
          </>
        )}
      </MinecraftPanel>
    </div>
  );
}
