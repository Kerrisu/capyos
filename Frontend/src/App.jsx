import { useState } from "react";
import MinecraftButton from "./components/MinecraftButton";
import MinecraftPanel from "./components/MinecraftPanel";
import Capybara from "./components/Capybara";
import TelaGerarEscala from "./components/TelaGerarEscala";
import TelaPacientes from "./components/TelaPacientes";
import TelaConfiguracoes from "./components/TelaConfiguracoes";
import TelaLoading from "./components/TelaLoading";
import AppAplicadores from "./components/AppAplicadores"; // <--- 1. IMPORT NOVO AQUI
import "./styles/theme.css";

export default function App() {
  // =========================================================================
  // 2. VERIFICAÇÃO DA URL (ROTA SIMPLES)
  // Se acessar /aplicador, exibe a tela nova e para a execução por aqui.
  // =========================================================================
  if (window.location.pathname === "/aplicador" || window.location.pathname.startsWith("/aplicador/")) {
    return <AppAplicadores />;
  }

  // =========================================================================
  // O RESTO DO SEU CÓDIGO CONTINUA EXATAMENTE IGUAL PARA OS AUXILIARES
  // =========================================================================
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("home"); // home | gerar-escala | pacientes | configuracoes

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
            <MinecraftButton onClick={() => setTela("configuracoes")}>
              Configurações Gerais
            </MinecraftButton>
          </MinecraftPanel>
        </div>
      )}
      {tela === "gerar-escala" && <TelaGerarEscala onVoltar={() => setTela("home")} />}
      {tela === "pacientes" && <TelaPacientes onVoltar={() => setTela("home")} />}
      {tela === "configuracoes" && <TelaConfiguracoes onVoltar={() => setTela("home")} />}
    </div>
  );
}
