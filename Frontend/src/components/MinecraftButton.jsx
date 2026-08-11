export default function MinecraftButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  style,
}) {
  const cls = [
    "mc-button",
    disabled ? "mc-button--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={cls}
      style={style}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
