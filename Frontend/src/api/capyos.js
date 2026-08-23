import { apiFetch } from "./client";

export function getHealth() {
  return apiFetch("/health");
}

export function getAbas(url) {
  const query = url ? `?url=${encodeURIComponent(url)}` : "";
  return apiFetch(`/abas${query}`);
}

export function gerarEscala({ nomeAba, urlPlanilha }) {
  return apiFetch("/gerar-escala", {
    method: "POST",
    body: JSON.stringify({
      nome_aba: nomeAba,
      url_planilha: urlPlanilha || null,
    }),
  });
}

// Reformata um mapa de salas (ex: já editado manualmente na tela de
// alocação de pacientes sem sala) em texto pronto pra WhatsApp. Usa a
// mesma função de formatação do backend, pra nunca ter a lógica de
// formatação duplicada em dois lugares (Python + JS) que possam divergir.
export function formatarEscala({ mapa, naoAlocados }) {
  return apiFetch("/formatar-escala", {
    method: "POST",
    body: JSON.stringify({
      mapa,
      nao_alocados: naoAlocados,
    }),
  });
}

// URL da planilha de Vacância — hardcoded aqui até o Ponto 4.4 (tela de
// configurações gerais, com endpoint GET/PUT pra configuracoes_gerais)
// existir e permitir persistir isso no banco, igual url_planilha vai
// passar a ter fallback. Ver Handoff #10, "Achado extra".
const URL_VACANCIA_TEMP =
  "https://docs.google.com/spreadsheets/d/1hbIx7aMYFWP7_PNaCXJFYVrupzQnQdXp";

// Escreve o mapa de alocação direto na aba do dia correspondente da
// planilha de Vacância (Ponto 3). Substitui o fluxo antigo de "copiar
// texto pro WhatsApp" como ação principal da tela de resultado.
export function escreverVacancia({ mapa, nomeAba, urlVacancia }) {
  return apiFetch("/escrever-vacancia", {
    method: "POST",
    body: JSON.stringify({
      mapa,
      nome_aba: nomeAba,
      url_vacancia: urlVacancia || URL_VACANCIA_TEMP,
    }),
  });
}

export function listarPacientes() {
  return apiFetch("/pacientes");
}

export function buscarPaciente(nome) {
  return apiFetch(`/pacientes/${encodeURIComponent(nome)}`);
}

export function salvarPaciente(nome, config) {
  return apiFetch("/pacientes", {
    method: "POST",
    body: JSON.stringify({ nome, config }),
  });
}

export function removerPaciente(nome) {
  return apiFetch(`/pacientes/${encodeURIComponent(nome)}`, {
    method: "DELETE",
  });
}
