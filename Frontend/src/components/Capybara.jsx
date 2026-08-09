import capyDormindo from "../assets/capy_dormindo.gif";

// Conforme mais poses forem chegando (referência de 9 reações que o Ken
// tem), é só importar o arquivo novo e adicionar uma entrada aqui.
const POSES = {
  dormindo: capyDormindo,
};

export default function Capybara({ pose = "dormindo", alt = "Capivara CapyOS" }) {
  const src = POSES[pose] || POSES.dormindo;
  return <img src={src} alt={alt} className="capybara" />;
}
