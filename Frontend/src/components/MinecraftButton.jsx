export default function MinecraftButton({ children, onClick, disabled, type = "button" }) {
  const cls = disabled ? "mc-button mc-button--disabled" : "mc-button";
  return (
    <button type={type} className={cls} onClick={disabled ? undefined : onClick} disabled={disabled}>
      {children}
    </button>
  );
}
