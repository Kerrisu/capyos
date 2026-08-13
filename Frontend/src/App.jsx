import { useState } from "react";
import MinecraftButton from "./components/MinecraftButton";
import MinecraftPanel from "./components/MinecraftPanel";
import Capybara from "./components/Capybara";
import TelaGerarEscala from "./components/TelaGerarEscala";
import TelaPacientes from "./components/TelaPacientes";
import TelaLoading from "./components/TelaLoading";
import "./styles/theme.css";

export default function App() {
  // Enquanto "carregando" for true, a TelaLoading fica pingando /health e
  // segura a renderização do resto do app — assim o Ken não vê a tela
  // "verificando conexão" piscando junto com o conteúdo normal.
  //
  // Removido (Parte 2): o indicador 🟢/🔴 de status do backend que ficava
  // aqui embaixo do título. A TelaLoading já garante que o backend
  // respondeu antes de chegar nessa tela, então o indicador era
  // redundante — não existe mais "statusBackend" nem o ping repetido de
  // /health depois do carregamento inicial.
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("home"); // home | gerar-escala | pacientes

  if (carregando) {
    return <TelaLoading onPronto={() => setCarregando(false)} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 16px",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Capybara pose="dormindo" />
      </div>
      <h1 className="mc-title" style={{ fontSize: 22, marginBottom: 6, textAlign: "center" }}>
        CapyOS
      </h1>
      <p style={{ fontSize: 20, color: "#F0F8FF", textShadow: "2px 2px 0 rgba(0,0,0,0.35)", marginBottom: 20 }}>
        Direcionamento de Salas
      </p>
      {tela === "home" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <MinecraftPanel title="Ações rápidas">
            <MinecraftButton onClick={() => setTela("gerar-escala")}>
              Gerar Escala
            </MinecraftButton>
            <MinecraftButton onClick={() => setTela("pacientes")}>
              Gerenciar Assistidos
            </MinecraftButton>
          </MinecraftPanel>
        </div>
      )}
      {tela === "gerar-escala" && <TelaGerarEscala onVoltar={() => setTela("home")} />}
      {tela === "pacientes" && <TelaPacientes onVoltar={() => setTela("home")} />}
    </div>
  );
}
