import { useState, useEffect } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCenter,
} from "@dnd-kit/core";
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

// Agrupa a fila de pendências por horário, na ordem real dos horários do
// dia (não alfabética) — horários fora da lista conhecida vão pro final,
// ordenados entre si. Mantém o itemOriginal junto de cada nome pra dar
// pra arrastar/remover qualquer item da fila, não só o primeiro.
function agruparPorHorario(fila) {
  const grupos = {};

  fila.forEach((item) => {
    const { horario, nome } = parsePendencia(item);
    if (!grupos[horario]) grupos[horario] = [];
    grupos[horario].push({ nome, itemOriginal: item });
  });

  return Object.keys(grupos)
    .sort((a, b) => {
      const ia = HORARIOS.indexOf(a);
      const ib = HORARIOS.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map((horario) => ({ horario, itens: grupos[horario] }));
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

// Chip arrastável — representa um nome, seja na fila (sem sala) ou já
// alocado numa sala. `dragData` carrega a origem pra o handleDragEnd
// saber de onde tirar e pra onde somar.
function NomeArrastavel({ id, nome, dragData, disabled, destaque }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: dragData,
    disabled,
  });

  return (
    <span
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      className={[
        "nome-arrastavel",
        disabled ? "nome-arrastavel--desabilitado" : "",
        isDragging ? "nome-arrastavel--ativo" : "",
        destaque ? "nome-arrastavel--atual" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {nome}
    </span>
  );
}

// Uma sala como zona de drop. Mostra os ocupantes atuais como chips
// arrastáveis (pra dar pra mover pra OUTRA sala) e um botão "Alocar aqui"
// como atalho de clique pro item que está no topo da fila (ALOCANDO AGORA).
// Sem limite rígido: dá pra soltar em cima de uma sala cheia, só acende
// o aviso laranja.
function SalaSlot({ sala, horario, ocupantes, onClickSala }) {
  const { setNodeRef, isOver } = useDroppable({ id: sala, data: { sala, horario } });
  const nomes = ocupantes ? ocupantes.split(" / ").filter(Boolean) : [];
  const qtd = nomes.length;
  const vaiEstourar = isOver && qtd >= 2;

  return (
    <div
      ref={setNodeRef}
      className={[
        "sala-slot",
        isOver ? "sala-slot--over" : "",
        vaiEstourar ? "sala-slot--aviso" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="sala-slot__cabecalho">
        <span className="sala-slot__nome">{sala}</span>
        <span
          className={
            "sala-slot__contagem " +
            (qtd === 0
              ? "sala-slot__contagem--vazia"
              : qtd <= 2
              ? "sala-slot__contagem--ok"
              : "sala-slot__contagem--cheia")
          }
        >
          {qtd}/2{qtd > 2 ? "+" : ""}
        </span>
      </div>

      <div className="sala-slot__ocupantes">
        {nomes.length === 0 && <span className="sala-slot__vazia-label">(vazia)</span>}
        {nomes.map((nome) => (
          <NomeArrastavel
            key={`${sala}-${horario}-${nome}`}
            id={`sala::${sala}::${horario}::${nome}`}
            nome={nome}
            dragData={{ origem: "sala", sala, horario, nome }}
          />
        ))}
      </div>

      <MinecraftButton className="mc-button--sala mc-button--sala-slot" onClick={onClickSala}>
        Alocar aqui
      </MinecraftButton>
    </div>
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

  // PointerSensor com distância mínima evita que um clique simples vire
  // drag sem querer. TouchSensor com delay evita brigar com o scroll no
  // celular (segura um pouco antes de começar a arrastar).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

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

  // Aloca alguém que ainda está na fila (sem sala) numa sala. Usado pelo
  // botão "Alocar aqui" e por um drag vindo da fila. Usa filter (não
  // slice) pra funcionar com qualquer item da fila, não só o primeiro —
  // isso permite arrastar qualquer pendência do horário atual, não só a
  // que está "ALOCANDO AGORA".
  function handleEscolherSala(sala, horario, nome, itemOriginal) {
    console.log(`${DEBUG_TAG} Alocando manualmente: ${nome} (${horario}) -> ${sala}`);
    setMapaAtual((prev) => {
      const novo = clonarMapa(prev);
      const atual = novo[sala][horario];
      novo[sala][horario] = atual ? `${atual} / ${nome}` : nome;
      return novo;
    });
    setNaoAlocadosFinal((prev) => prev.filter((x) => x !== itemOriginal));
    setFilaRestante((prev) => prev.filter((x) => x !== itemOriginal));
  }

  // Move alguém que JÁ está numa sala pra outra sala, no mesmo horário.
  // Só sai da sala de origem e entra na de destino — nunca troca de
  // posição com quem já está lá. Sem limite: pode passar de 2, é
  // intencional (soft warning fica só na cor do slot durante o drag).
  function handleMoverEntreSalas(nome, horario, salaOrigem, salaDestino) {
    if (salaOrigem === salaDestino) return;
    console.log(`${DEBUG_TAG} Movendo: ${nome} (${horario}) ${salaOrigem} -> ${salaDestino}`);
    setMapaAtual((prev) => {
      const novo = clonarMapa(prev);

      const nomesOrigem = (novo[salaOrigem][horario] || "")
        .split(" / ")
        .filter((n) => n && n !== nome);
      novo[salaOrigem][horario] = nomesOrigem.join(" / ");

      const destinoAtual = novo[salaDestino][horario];
      novo[salaDestino][horario] = destinoAtual ? `${destinoAtual} / ${nome}` : nome;

      return novo;
    });
  }

  function handlePular(itemOriginal) {
    console.log(`${DEBUG_TAG} Pulando / deixando sem sala: ${itemOriginal}`);
    setFilaRestante((prev) => prev.filter((x) => x !== itemOriginal));
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return; // soltou fora de qualquer sala, não faz nada

    const data = active.data.current;
    if (!data) return;
    const salaDestino = over.id;

    if (data.origem === "fila") {
      handleEscolherSala(salaDestino, data.horario, data.nome, data.itemOriginal);
    } else if (data.origem === "sala") {
      handleMoverEntreSalas(data.nome, data.horario, data.sala, salaDestino);
    }
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
          const { horario: horarioAtual, nome: nomeAtual } = parsePendencia(itemAtual);
          const gruposFila = agruparPorHorario(filaRestante);

          return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div
                style={{
                  background: "#2b2b2b",
                  padding: 10,
                  marginBottom: 10,
                  border: "2px solid #373737",
                }}
              >
                <p style={{ fontSize: 12, color: "#aaaaaa", textAlign: "center", marginBottom: 8 }}>
                  PRÓXIMOS DA FILA (arraste os do horário atual pra uma sala):
                </p>
                {gruposFila.map((grupo) => {
                  const doHorarioAtual = grupo.horario === horarioAtual;
                  return (
                    <div key={grupo.horario} className="fila-grupo">
                      <span className="fila-horario-badge">{grupo.horario}</span>
                      <span className="fila-contagem">
                        {grupo.itens.length} {grupo.itens.length === 1 ? "assistido" : "assistidos"}
                      </span>
                      <div className="fila-nomes">
                        {grupo.itens.map(({ nome, itemOriginal }) => (
                          <NomeArrastavel
                            key={itemOriginal}
                            id={`fila::${itemOriginal}`}
                            nome={nome}
                            destaque={itemOriginal === itemAtual}
                            disabled={!doHorarioAtual}
                            dragData={{ origem: "fila", horario: grupo.horario, nome, itemOriginal }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="alocando-agora">
                ALOCANDO AGORA: {nomeAtual} ({horarioAtual})
              </p>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  marginBottom: 10,
                  border: "2px solid #373737",
                  padding: 6,
                  background: "#1f1f1f",
                }}
              >
                {ordenarSalas(mapaAtual).map((sala) => (
                  <SalaSlot
                    key={sala}
                    sala={sala}
                    horario={horarioAtual}
                    ocupantes={mapaAtual[sala][horarioAtual] || ""}
                    onClickSala={() => handleEscolherSala(sala, horarioAtual, nomeAtual, itemAtual)}
                  />
                ))}
              </div>

              <MinecraftButton
                className="mc-button--danger"
                onClick={() => handlePular(itemAtual)}
              >
                Pular / Deixar sem sala
              </MinecraftButton>
            </DndContext>
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
