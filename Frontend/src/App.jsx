import AppAplicadores from "./components/AppAplicadores";
import "./styles/theme.css";

// A partir da unificação: "/" e "/aplicador" levam pro mesmo app, com login
// obrigatório pra tudo (inclusive Direcionamento de Salas, que virou só mais
// um grupo de botões dentro do menu da coordenação). Antes disso, "/" caía
// direto no CapyOS de Salas sem nenhuma verificação de login.
export default function App() {
  return <AppAplicadores />;
}
