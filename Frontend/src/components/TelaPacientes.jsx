import { useState, useEffect } from "react";
import MinecraftButton from "./MinecraftButton";
import MinecraftPanel from "./MinecraftPanel";
import TelaFormPaciente from "./TelaFormPaciente";
import { listarPacientes, removerPaciente } from "../api/capyos";

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

function Badge({ ativo, label }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 13,
        fontFamily: "VT323, monospace",
        padding: "2px 6px",
        marginRight: 6,
        marginBottom: 4,
        border: "2px solid #373737",
        background: ativo ? "#D4FFD4" : "#F0F0F0",
        color: "#2B2B2B",
      }}
    >
      {ativo ? "✅" : "⬜"} {label}
    </span>
  );
}

// Estados da lista: carregando -> pronto -> erro
// Vista: lista -> form (novo ou editando um nome específico) -> volta pra lista
export default function TelaPacientes({ onVoltar }) {
  const [estado, setEstado] = useState("carregando");
  const [pacientes, setPacientes] = useState([]); // vira array de {nome, config}
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [vista, setVista] = useState("lista"); // lista | form
  const [nomeEditando, setNomeEditando] = useState(null); // null = cadastro novo
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(null); // nome do paciente ou null
  const [removendoNome, setRemovendoNome] = useState(null); // nome em processo de remoção, ou null
  const [erroRemocao, setErroRemocao] = useState("");

  function carregarPacientes() {
    console.log(`${DEBUG_TAG} Buscando pacientes...`);
    setEstado("carregando");
    listarPacientes()
      .then((data) => {
        const dict = data.pacientes || {};
        const lista = Object.entries(dict)
          .map(([nome, config]) => ({ nome, config }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        console.log(`${DEBUG_TAG} ${lista.length} paciente(s) recebido(s).`);
        setPacientes(lista);
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao buscar pacientes:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }

  useEffect(() => {
    carregarPacientes();
  }, []);

  function handleSalvo() {
    console.log(`${DEBUG_TAG} Formulário salvo, voltando pra lista e recarregando.`);
    setVista("lista");
    setNomeEditando(null);
    carregarPacientes();
  }

  function handleConfirmarRemocao(nome) {
    console.log(`${DEBUG_TAG} Removendo paciente: ${nome}`);
    setRemovendoNome(nome);
    setErroRemocao("");

    removerPaciente(nome)
      .then(() => {
        console.log(`${DEBUG_TAG} Paciente '${nome}' removido com sucesso.`);
        setConfirmandoRemocao(null);
        setRemovendoNome(null);
        carregarPacientes();
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao remover paciente:`, e);
        setErroRemocao(e.message);
        setRemovendoNome(null);
      });
  }

  if (vista === "form") {
    const gruposExistentes = [...new Set(
      pacientes.map((p) => p.config.grupo_match).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return (
      <TelaFormPaciente
        nomeInicial={nomeEditando}
        gruposExistentes={gruposExistentes}
        onVoltar={() => {
          setVista("lista");
          setNomeEditando(null);
        }}
        onSalvo={handleSalvo}
      />
    );
  }

  const buscaNormalizada = busca.trim().toUpperCase();
  const pacientesFiltrados = buscaNormalizada
    ? pacientes.filter((p) => p.nome.includes(buscaNormalizada))
    : pacientes;

  return (
    <div style={{ width: "100%", maxWidth: 460 }}>
      <MinecraftPanel title="Gerenciar Assistidos">
        {estado === "carregando" && (
          <p style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B" }}>
            🟡 Carregando assistidos...
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

        {estado === "pronto" && (
          <>
            <MinecraftButton
              onClick={() => {
                setNomeEditando(null);
                setVista("form");
              }}
            >
              + Novo Assistido
            </MinecraftButton>

            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: 16,
                padding: 8,
                marginTop: 10,
                marginBottom: 10,
                fontFamily: "VT323, monospace",
                border: "2px solid #373737",
              }}
            />

            <p style={{ fontSize: 15, color: "#2B2B2B", marginBottom: 10 }}>
              {pacientesFiltrados.length} de {pacientes.length} assistido(s)
            </p>

            <div
              style={{
                maxHeight: 340,
                overflowY: "auto",
                marginBottom: 14,
                border: "2px solid #373737",
                background: "#FFFFFF",
              }}
            >
              {pacientesFiltrados.length === 0 && (
                <p style={{ fontSize: 15, color: "#2B2B2B", textAlign: "center", padding: 12 }}>
                  Nenhum assistido encontrado.
                </p>
              )}

              {pacientesFiltrados.map(({ nome, config }) => (
                <div
                  key={nome}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "2px solid #E0E0E0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 17, fontWeight: "bold", color: "#2B2B2B" }}>
                      {nome}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => {
                          setNomeEditando(nome);
                          setVista("form");
                        }}
                        style={{
                          fontFamily: "VT323, monospace",
                          fontSize: 14,
                          padding: "3px 10px",
                          border: "2px solid #373737",
                          background: "#F0F8FF",
                          color: "#2B2B2B",
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setErroRemocao("");
                          setConfirmandoRemocao(nome);
                        }}
                        style={{
                          fontFamily: "VT323, monospace",
                          fontSize: 14,
                          padding: "3px 10px",
                          border: "2px solid #373737",
                          background: "#FFD4D4",
                          color: "#2B2B2B",
                          cursor: "pointer",
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  {confirmandoRemocao === nome && (
                    <div
                      style={{
                        background: "#FFF3CD",
                        border: "2px solid #8B0000",
                        padding: 8,
                        marginBottom: 6,
                        fontSize: 14,
                        color: "#2B2B2B",
                      }}
                    >
                      <p style={{ margin: "0 0 8px 0" }}>
                        ⚠️ Remover <strong>{nome}</strong> definitivamente? Essa ação não tem volta.
                      </p>
                      {erroRemocao && removendoNome === null && (
                        <p style={{ margin: "0 0 8px 0", color: "#8B0000" }}>🔴 {erroRemocao}</p>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleConfirmarRemocao(nome)}
                          disabled={removendoNome === nome}
                          style={{
                            fontFamily: "VT323, monospace",
                            fontSize: 14,
                            padding: "3px 10px",
                            border: "2px solid #373737",
                            background: "#8B0000",
                            color: "#FFFFFF",
                            cursor: "pointer",
                          }}
                        >
                          {removendoNome === nome ? "Removendo..." : "Sim, remover"}
                        </button>
                        <button
                          onClick={() => setConfirmandoRemocao(null)}
                          disabled={removendoNome === nome}
                          style={{
                            fontFamily: "VT323, monospace",
                            fontSize: 14,
                            padding: "3px 10px",
                            border: "2px solid #373737",
                            background: "#F0F0F0",
                            color: "#2B2B2B",
                            cursor: "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>
                    Sala fixa: {config.sala_fixa ? config.sala_fixa : "—"}
                    {config.grupo_match ? ` · Grupo: ${config.grupo_match}` : ""}
                  </div>

                  <div>
                    <Badge ativo={config.aceita_externo} label="Aceita externo" />
                    <Badge ativo={config.divide_sala} label="Divide sala" />
                    <Badge ativo={config.resistencia_escada} label="Resist. escada" />
                    <Badge ativo={config.preferencia_mezanino} label="Pref. mezanino" />
                    <Badge ativo={config.prioridade_clinica} label="Prioridade clínica" />
                  </div>
                </div>
              ))}
            </div>

            <MinecraftButton onClick={onVoltar}>Voltar</MinecraftButton>
          </>
        )}
      </MinecraftPanel>
    </div>
  );
}
