import { useEffect, useRef, useState } from "react";
import { getHealth } from "../api/capyos";

// Trocado (Parte 2): saiu o capy_andando.gif, entrou o ícone estático do
// PWA — mesma troca feita no componente Capybara.jsx.
const ICONE_CAPYOS = "/icons/icon-192.png";

// Render (free tier) dorme depois de ~15min parado e leva uns 50-60s pra
// acordar de novo. Enquanto isso, ficamos pingando /health nesse intervalo
// até o backend responder — sem tentar adivinhar porcentagem de progresso,
// já que o tempo real de cold start varia.
const INTERVALO_PING_MS = 3000;

export default function TelaLoading({ onPronto }) {
  const [segundos, setSegundos] = useState(0);
  const jaResolvidoRef = useRef(false);

  useEffect(() => {
    let intervaloPing;
    let intervaloRelogio;

    async function tentarPing() {
      if (jaResolvidoRef.current) return;
      try {
        await getHealth();
        if (!jaResolvidoRef.current) {
          jaResolvidoRef.current = true;
          clearInterval(intervaloPing);
          clearInterval(intervaloRelogio);
          onPronto();
        }
      } catch {
        // Servidor ainda dormindo (ou rede instável) — só espera o próximo
        // intervalo tentar de novo, sem mostrar erro pro Ken aqui.
      }
    }

    tentarPing(); // primeira tentativa já na entrada da tela, sem esperar o intervalo
    intervaloPing = setInterval(tentarPing, INTERVALO_PING_MS);
    intervaloRelogio = setInterval(() => setSegundos((s) => s + 1), 1000);

    return () => {
      clearInterval(intervaloPing);
      clearInterval(intervaloRelogio);
    };
  }, [onPronto]);

  return (
    <div className="tela-loading">
      <img src={ICONE_CAPYOS} alt="Capivara CapyOS" className="capybara" />
      <p className="loading-texto">ACORDANDO O SERVIDOR...</p>
      <p className="loading-subtexto">
        Isso pode levar cerca de 1 minuto ({segundos}s)
      </p>
      <div className="loading-barra-container">
        <div className="loading-barra-preenchimento" />
      </div>
    </div>
  );
}
