// Trocado (Parte 2): saiu o sistema de poses em gif (capy_dormindo.gif,
// capy_andando.gif etc.) e entrou o ícone estático do PWA. O componente
// continua aceitando as props `pose` e `alt` por compatibilidade com quem
// já chama <Capybara pose="..." /> em outro lugar do código — só que
// `pose` não faz mais nada, sempre renderiza o mesmo ícone.
const ICONE_CAPYOS = "/icons/icon-192.png";

export default function Capybara({ pose, alt = "Capivara CapyOS" }) {
  return <img src={ICONE_CAPYOS} alt={alt} className="capybara" />;
}
