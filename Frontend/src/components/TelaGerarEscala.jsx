import { useState, useEffect } from "react";
import MinecraftButton from "./MinecraftButton";
import MinecraftPanel from "./MinecraftPanel";
import { getAbas, gerarEscala } from "../api/capyos";

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

// Estados possíveis da tela:
// carregando-abas -> pronto -> gerando -> resultado
//                       |
//                       -> erro (falha ao buscar abas OU ao gerar escala)
export default function TelaGerarEscala({ onVoltar }) {
  const [estado, setEstado] = useState("carregando-abas");
  const [abas, setAbas] = useState([]);
  const [abaSelecionada, setAbaSelecionada] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    console.log(`${DEBUG_TAG} TelaGerarEscala montada. Buscando abas...`);
    getAbas()
      .then((data) => {
        console.log(`${DEBUG_TAG} Abas recebidas:`, data.abas);
        setAbas(data.abas || []);
        setAbaSelecionada(data.abas?.[0] || "");
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao buscar abas:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }, []);

  function handleGerar() {
    if (!abaSelecionada) return;
    console.log(`${DEBUG_TAG} Gerando escala para aba: ${abaSelecionada}`);
    setEstado("gerando");
    setErro("");

    gerarEscala({ nomeAba: abaSelecionada })
      .then((data) => {
        console.log(`${DEBUG_TAG} Escala gerada. Total processados: ${data.total_pacientes_processados}`);
        setResultado(data);
        setEstado("resultado");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao gerar escala:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }

  function handleGerarOutraAba() {
    setResultado(null);
    setEstado("pronto");
  }

  return (
    <div style={{ width: "100%", maxWidth: 460 }}>
      <MinecraftPanel title="Gerar Escala">
        {estado === "carregando-abas" && (
          <p style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B" }}>
            🟡 Carregando abas da planilha...
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

        {(estado === "pronto" || estado === "gerando") && (
          <>
            <label
              style={{
                display: "block",
                fontSize: 16,
                color: "#2B2B2B",
                marginBottom: 6,
              }}
            >
              Escolha o dia:
            </label>
            <select
              value={abaSelecionada}
              onChange={(e) => setAbaSelecionada(e.target.value)}
              disabled={estado === "gerando"}
              style={{
                width: "100%",
                fontSize: 16,
                padding: 8,
                marginBottom: 14,
                fontFamily: "VT323, monospace",
              }}
            >
              {abas.map((aba) => (
                <option key={aba} value={aba}>
                  {aba}
                </option>
              ))}
            </select>

            <MinecraftButton onClick={handleGerar} disabled={estado === "gerando" || !abaSelecionada}>
              {estado === "gerando" ? "Gerando..." : "Gerar Escala"}
            </MinecraftButton>

            <MinecraftButton onClick={onVoltar} disabled={estado === "gerando"}>
              Voltar
            </MinecraftButton>
          </>
        )}

        {estado === "resultado" && resultado && (
          <>
            <p style={{ fontSize: 16, color: "#2B2B2B", marginBottom: 4 }}>
              ✅ {resultado.total_pacientes_processados} assistidos processados
            </p>

            {resultado.nao_alocados?.length > 0 && (
              <div
                style={{
                  background: "#FFD4D4",
                  border: "2px solid #8B0000",
                  padding: 8,
                  marginBottom: 12,
                  fontSize: 15,
                  color: "#2B2B2B",
                }}
              >
                ⚠️ {resultado.nao_alocados.length} sem sala alocada:
                <br />
                {resultado.nao_alocados.join(", ")}
              </div>
            )}

            <div
              style={{
                background: "#FFFFFF",
                color: "#2B2B2B",
                padding: 10,
                maxHeight: 260,
                overflowY: "auto",
                fontSize: 15,
                fontFamily: "VT323, monospace",
                whiteSpace: "pre-wrap",
                marginBottom: 14,
                border: "2px solid #373737",
              }}
            >
              {resultado.texto_formatado}
            </div>

            <MinecraftButton onClick={handleGerarOutraAba}>Gerar outra aba</MinecraftButton>
            <MinecraftButton onClick={onVoltar}>Voltar ao início</MinecraftButton>
          </>
        )}
      </MinecraftPanel>
    </div>
  );
}
