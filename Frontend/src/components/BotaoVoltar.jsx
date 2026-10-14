import MinecraftButton from "./MinecraftButton";

// Voltar padrão do sistema (pedido do Ken em 11/10/2026): pílula branca,
// centralizada, no fim da tela. É o único lugar onde esse botão é definido —
// todas as telas usam este componente, pra nenhuma ficar diferente das outras.
export default function BotaoVoltar({ onClick, disabled = false, children = "Voltar" }) {
  return (
    <div style={{ width: "100%", marginTop: "20px", display: "flex", justifyContent: "center" }}>
      <MinecraftButton
        onClick={onClick}
        disabled={disabled}
        className="mc-button--claro"
        style={{ width: "100%", maxWidth: "360px" }}
      >
        {children}
      </MinecraftButton>
    </div>
  );
}
