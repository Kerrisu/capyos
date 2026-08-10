import { useState, useEffect } from "react";
import MinecraftButton from "./components/MinecraftButton";
import MinecraftPanel from "./components/MinecraftPanel";
import Capybara from "./components/Capybara";
import TelaGerarEscala from "./components/TelaGerarEscala";
import TelaPacientes from "./components/TelaPacientes";
import { getHealth } from "./api/capyos";
import "./styles/theme.css";

export default function App() {
  const [feedback, setFeedback] = useState("Toca em um botão pra ver o efeito de clique");
  const [statusBackend, setStatusBackend] = useState("verificando"); // verificando | online | offline
  const [tela, setTela] = useState("home"); // home | gerar-escala | pacientes

  useEffect(() => {
    getHealth()
      .then(() => setStatusBackend("online"))
      .catch(() => setStatusBackend("offline"));
  }, []);

  const statusInfo = {
    verificando: { texto: "🟡 Verificando conexão com o backend...", cor: "#F0F8FF" },
    online: { texto: "🟢 Backend conectado", cor: "#D4FFD4" },
    offline: { texto: "🔴 Backend offline (confere se o uvicorn está rodando)", cor: "#FFD4D4" },
  }[statusBackend];

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
      <p style={{ fontSize: 20, color: "#F0F8FF", textShadow: "2px 2px 0 rgba(0,0,0,0.35)", marginBottom: 8 }}>
        Direcionamento de Salas
      </p>

      <p
        style={{
          fontSize: 16,
          color: statusInfo.cor,
          textShadow: "1px 1px 0 rgba(0,0,0,0.4)",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        {statusInfo.texto}
      </p>

      {tela === "home" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <MinecraftPanel title="Ações rápidas">
            <div style={{ fontSize: 18, textAlign: "center", color: "#2B2B2B", minHeight: 24, marginBottom: 8 }}>
              {feedback}
            </div>

            <MinecraftButton
              onClick={() => {
                setFeedback("✅ Gerar Escala — pressionado!");
                setTela("gerar-escala");
              }}
            >
              Gerar Escala
            </MinecraftButton>

            <MinecraftButton
              onClick={() => {
                setFeedback("⭐ Gerenciar Assistidos — pressionado!");
                setTela("pacientes");
              }}
            >
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
