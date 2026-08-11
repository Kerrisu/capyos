import { useState, useEffect } from "react";
import MinecraftButton from "./MinecraftButton";
import MinecraftPanel from "./MinecraftPanel";
import { getAbas, gerarEscala, formatarEscala } from "../api/capyos";

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

// Estados possíveis da tela:
// carregando-abas -> pronto -> gerando -> resolvendo-conflitos -> formatando -> resultado
//                       |                        (só entra aqui se
//                       -> erro                   sobrar gente sem sala)
const HORARIOS = ["13:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45"];

// Faz uma cópia profunda do mapa de salas, pra poder mexer sem alterar o
// resultado original vindo da API (útil pra permitir "recomeçar" se algo
// der errado no meio da alocação manual).
function clonarMapa(mapa) {
  return JSON.parse(JSON.stringify(mapa));
}

// O backend manda cada pendência como uma string "HH:MM - NOME".
// Essa função separa os dois pedaços de volta.
function parsePendencia(item) {
  const idx = item.indexOf(" - ");
  if (idx === -1) {
    return { horario: "??:??", nome: item };
  }
  return { horario: item.slice(0, idx).trim(), nome: item.slice(idx + 3).trim() };
}

function ordenarSalas(mapa) {
  return Object.keys(mapa).sort((a, b) => {
    const na = parseInt(a.split(" ")[1], 10);
    const nb = parseInt(b.split(" ")[1], 10);
    return (isNaN(na) ? 99 : na) - (isNaN(nb) ? 99 : nb);
  });
}

// Renderiza "ABA 07 | Com: BEATRIZ ARAUJO / LILIA MELO" com cada ocupante
// em uma cor de destaque diferente (1º verde escuro, 2º amarelo escuro,
// 3º em diante vermelho escuro), já que o fundo do botão é claro.
function LabelSala({ sala, ocupantes }) {
  if (!ocupantes) {
    return <>{sala} | (Vazia)</>;
  }

  const nomes = ocupantes.split(" / ");

  return (
    <>
      {sala} | Com:{" "}
      {nomes.map((nome, i) => (
        <span key={i} className={`sala-nome--${Math.min(i, 2)}`}>
          {nome}
          {i < nomes.length - 1 ? " / " : ""}
        </span>
      ))}
    </>
  );
}

export default function TelaGerarEscala({ onVoltar }) {
  const [estado, setEstado] = useState("carregando-abas");
  const [abas, setAbas] = useState([]);
  const [abaSelecionada, setAbaSelecionada] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  // --- Estado da fase de alocação manual (Parte 2 QoL) ---
  const [mapaAtual, setMapaAtual] = useState(null);
  const [naoAlocadosFinal, setNaoAlocadosFinal] = useState([]);
  const [filaRestante, setFilaRestante] = useState([]);

  // --- Texto final (pode vir direto do /gerar-escala, ou recalculado
  // depois da alocação manual via /formatar-escala) ---
  const [textoFinal, setTextoFinal] = useState("");
  const [copiado, setCopiado] = useState(false);

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

  // Quando a fila de pendências zera (todo mundo foi alocado ou pulado),
  // manda o mapa final pro backend formatar o texto e vai pra tela de
  // resultado.
  useEffect(() => {
    if (estado !== "resolvendo-conflitos" || !mapaAtual) return;
    if (filaRestante.length > 0) return;

    console.log(`${DEBUG_TAG} Fila de alocação manual zerada. Formatando texto final...`);
    setEstado("formatando");

    formatarEscala({ mapa: mapaAtual, naoAlocados: naoAlocadosFinal })
      .then((data) => {
        setTextoFinal(data.texto_formatado);
        setEstado("resultado");
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao formatar escala final:`, e);
        setErro(e.message);
        setEstado("erro");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filaRestante, estado, mapaAtual]);

  function handleGerar() {
    if (!abaSelecionada) return;
    console.log(`${DEBUG_TAG} Gerando escala para aba: ${abaSelecionada}`);
    setEstado("gerando");
    setErro("");

    gerarEscala({ nomeAba: abaSelecionada })
      .then((data) => {
        console.log(`${DEBUG_TAG} Escala gerada. Total processados: ${data.total_pacientes_processados}`);
        setResultado(data);

        if (data.nao_alocados && data.nao_alocados.length > 0) {
          // Tem gente sem sala: entra na fase de alocação manual antes
          // de mostrar o resultado final.
          console.log(`${DEBUG_TAG} ${data.nao_alocados.length} paciente(s) sem sala. Iniciando alocação manual...`);
          setMapaAtual(clonarMapa(data.mapa));
          setNaoAlocadosFinal([...data.nao_alocados]);
          setFilaRestante([...data.nao_alocados]);
          setEstado("resolvendo-conflitos");
        } else {
          setTextoFinal(data.texto_formatado);
          setEstado("resultado");
        }
      })
      .catch((e) => {
        console.error(`${DEBUG_TAG} Erro ao gerar escala:`, e);
        setErro(e.message);
        setEstado("erro");
      });
  }

  function handleGerarOutraAba() {
    setResultado(null);
    setMapaAtual(null);
    setNaoAlocadosFinal([]);
    setFilaRestante([]);
    setTextoFinal("");
    setCopiado(false);
    setEstado("pronto");
  }

  function handleEscolherSala(sala, horario, nome, itemOriginal) {
    console.log(`${DEBUG_TAG} Alocando manualmente: ${nome} (${horario}) -> ${sala}`);
    setMapaAtual((prev) => {
      const novo = clonarMapa(prev);
      const atual = novo[sala][horario];
      novo[sala][horario] = atual ? `${atual} / ${nome}` : nome;
      return novo;
    });
    setNaoAlocadosFinal((prev) => prev.filter((x) => x !== itemOriginal));
    setFilaRestante((prev) => prev.slice(1));
  }

  function handlePular(itemOriginal) {
    console.log(`${DEBUG_TAG} Pulando / deixando sem sala: ${itemOriginal}`);
    // Continua em naoAlocadosFinal (já está lá desde o início) — só avança a fila.
    setFilaRestante((prev) => prev.slice(1));
  }

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(textoFinal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      console.error(`${DEBUG_TAG} Erro ao copiar pra área de transferência:`, e);
      setErro("Não consegui copiar automaticamente. Selecione o texto manualmente.");
    }
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

        {estado === "resolvendo-conflitos" && filaRestante.length > 0 && (() => {
          const itemAtual = filaRestante[0];
          const { horario, nome } = parsePendencia(itemAtual);
          const filaDetalhada = filaRestante
            .map((item) => {
              const p = parsePendencia(item);
              return `${p.nome} (${p.horario})`;
            })
            .join("  |  ");

          return (
            <>
              <div
                style={{
                  background: "#2b2b2b",
                  padding: 10,
                  marginBottom: 10,
                  border: "2px solid #373737",
                }}
              >
                <p style={{ fontSize: 12, color: "#aaaaaa", textAlign: "center", marginBottom: 6 }}>
                  PRÓXIMOS DA FILA:
                </p>
                <p style={{ fontSize: 14, color: "#2ecc71", textAlign: "center" }}>
                  {filaDetalhada}
                </p>
              </div>

              <p className="alocando-agora">
                ALOCANDO AGORA: {nome} ({horario})
              </p>

              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  marginBottom: 10,
                  border: "2px solid #373737",
                  padding: 6,
                  background: "#1f1f1f",
                }}
              >
                {ordenarSalas(mapaAtual).map((sala) => {
                  const ocupantes = mapaAtual[sala][horario] || "";
                  const qtd = ocupantes ? ocupantes.split(" / ").length : 0;

                  // Igual ao app antigo: sala com 3 ou mais pessoas não
                  // aparece como opção pra evitar amontoar demais.
                  if (qtd >= 3) return null;

                  return (
                    <div key={sala} style={{ marginBottom: 6 }}>
                      <MinecraftButton
                        className="mc-button--sala"
                        onClick={() => handleEscolherSala(sala, horario, nome, itemAtual)}
                      >
                        <LabelSala sala={sala} ocupantes={ocupantes} />
                      </MinecraftButton>
                    </div>
                  );
                })}
              </div>

              <MinecraftButton
                className="mc-button--danger"
                onClick={() => handlePular(itemAtual)}
              >
                Pular / Deixar sem sala
              </MinecraftButton>
            </>
          );
        })()}

        {estado === "formatando" && (
          <p style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B" }}>
            🟡 Organizando escala final...
          </p>
        )}

        {estado === "resultado" && resultado && (
          <>
            <p style={{ fontSize: 16, color: "#2B2B2B", marginBottom: 4 }}>
              ✅ {resultado.total_pacientes_processados} assistidos processados
            </p>

            {naoAlocadosFinal.length > 0 && (
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
                ⚠️ {naoAlocadosFinal.length} sem sala alocada:
                <br />
                {naoAlocadosFinal.join(", ")}
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
              {textoFinal}
            </div>

            <MinecraftButton onClick={handleCopiar}>
              {copiado ? "✅ Vacância copiada!" : "Copiar Vacância"}
            </MinecraftButton>

            <MinecraftButton onClick={onVoltar}>Voltar ao início</MinecraftButton>
          </>
        )}
      </MinecraftPanel>
    </div>
  );
}
