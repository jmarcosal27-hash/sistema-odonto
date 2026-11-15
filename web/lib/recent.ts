"use client";

/** Últimos pacientes abertos neste aparelho (só para atalhos na busca). */
const KEY = "smileos:recent-patients";

export function recentPatients(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}

export function rememberPatient(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([id, ...recentPatients().filter((x) => x !== id)].slice(0, 5))); }
  catch { /* sem armazenamento: só não lembra */ }
}
