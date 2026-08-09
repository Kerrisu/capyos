// CapyOS - Cliente base de API
//
// URL do backend vem de VITE_API_BASE_URL (arquivo .env, veja .env.example).
// Se não estiver definida, usa localhost:8000 como padrão de desenvolvimento.

const DEBUG_TAG = "🔧[CAPYOS-FRONTEND-DEBUG]";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

console.log(`${DEBUG_TAG} API_BASE_URL configurada: ${API_BASE_URL}`);

/**
 * Wrapper de fetch com log de debug e tratamento de erro consistente.
 * Lança um Error com mensagem legível em caso de falha, pra quem chamar
 * poder mostrar isso direto pro usuário sem precisar tratar cada caso.
 */
export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  console.log(`${DEBUG_TAG} Chamando: ${options.method || "GET"} ${url}`);

  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (erroDeRede) {
    console.error(`${DEBUG_TAG} Erro de rede ao chamar ${url}:`, erroDeRede);
    throw new Error(
      `Não foi possível conectar ao backend em ${API_BASE_URL}. Verifique se o servidor está rodando e se o CORS está liberado.`
    );
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    const detalhe = corpo?.detail || `Erro ${resposta.status} em ${path}`;
    console.error(`${DEBUG_TAG} Resposta com erro (${resposta.status}):`, detalhe);
    throw new Error(detalhe);
  }

  console.log(`${DEBUG_TAG} Sucesso: ${path}`, corpo);
  return corpo;
}
