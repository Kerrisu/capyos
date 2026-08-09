export default function MinecraftPanel({ title, children }) {
  return (
    <div className="mc-panel">
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}
