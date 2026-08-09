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
