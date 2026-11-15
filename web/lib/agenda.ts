// Regras puras da agenda (sem React nem acesso a dados). Usadas pela tela, pelo formulário
// e pelas duas camadas de dados (store local e remote), para as regras serem uma só.
// Sem imports de execução de propósito: o scripts/agenda-test.mjs roda este arquivo direto no Node.

import type { Appointment, AppointmentProcedure, AppointmentStatus, Db, Professional } from "./types";

export const STATUS_ORDER: AppointmentStatus[] = ["to_confirm", "confirmed", "waiting", "in_service", "done", "no_show", "cancelled"];

/** Nome do status para leitura em tela e por leitor de tela. */
export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  to_confirm: "A confirmar", confirmed: "Confirmado", waiting: "Aguardando", in_service: "Em atendimento",
  done: "Atendido", no_show: "Faltou", cancelled: "Cancelado",
};

/** Texto de apoio: o que o status quer dizer na rotina da clínica. */
export const STATUS_HINT: Record<AppointmentStatus, string> = {
  to_confirm: "ainda sem resposta do paciente", confirmed: "paciente confirmou", waiting: "paciente na recepção",
  in_service: "paciente na cadeira", done: "atendimento concluído", no_show: "paciente não veio", cancelled: "horário liberado",
};

export const PROFESSIONAL_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#db2777", "#4b5563"];
export const NO_PROFESSIONAL = "none";

export const MAX_PROCEDURES = 20;
export const MAX_LABEL = 30;
export const MAX_REPEAT = 26;
export const MAX_BLOCK_DAYS = 60;

export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Datas de uma série: a primeira e mais `times - 1`, a cada `everyDays` dias (semanal = 7). */
export function repeatDates(start: string, everyDays: number, times: number): string[] {
  const n = Math.max(1, Math.min(MAX_REPEAT, Math.floor(times)));
  const step = Math.max(1, Math.floor(everyDays));
  return Array.from({ length: n }, (_, i) => shiftDate(start, i * step));
}

/** Dias de um bloqueio de vários dias, de `from` a `until` (inclusive). */
export function blockDates(from: string, until: string, skipWeekend: boolean): string[] {
  const out: string[] = [];
  for (let d = from; d <= until && out.length < MAX_BLOCK_DAYS + 1; d = shiftDate(d, 1)) {
    const [y, m, day] = d.split("-").map(Number);
    const dow = new Date(y, m - 1, day).getDay();
    if (!skipWeekend || (dow !== 0 && dow !== 6)) out.push(d);
  }
  return out;
}

export function procedureTotals(list?: AppointmentProcedure[]) {
  return { minutes: (list ?? []).reduce((s, p) => s + p.durationMinutes, 0), cents: (list ?? []).reduce((s, p) => s + p.priceCents, 0) };
}

/** Confere e limpa a lista de procedimentos (mesmas regras do CHECK do banco). */
export function checkProcedures(list: AppointmentProcedure[] | undefined): AppointmentProcedure[] | undefined {
  if (!list?.length) return undefined;
  if (list.length > MAX_PROCEDURES) throw new Error(`No máximo ${MAX_PROCEDURES} procedimentos por agendamento.`);
  return list.map((p) => {
    const name = p.name.trim();
    if (!name || name.length > 120) throw new Error("Todo procedimento precisa de nome (até 120 caracteres).");
    if (!Number.isInteger(p.priceCents) || p.priceCents < 0) throw new Error(`Valor inválido em ${name}.`);
    if (!Number.isInteger(p.durationMinutes) || p.durationMinutes < 1 || p.durationMinutes > 600) throw new Error(`A duração de ${name} precisa ficar entre 1 e 600 minutos.`);
    return { name, priceCents: p.priceCents, durationMinutes: p.durationMinutes, ...(p.procedureId ? { procedureId: p.procedureId } : {}) };
  });
}

export type Conflict = { kind: "appointment" | "block"; time: string; text: string };

type Candidate = Pick<Appointment, "date" | "time" | "durationMinutes" | "status" | "professionalId"> & { id?: string };

/**
 * Compromisso ou bloqueio que bate com o horário. A comparação é por profissional:
 * dois dentistas podem atender no mesmo horário; sem profissional conta como um só recurso.
 * Bloqueio sem profissional vale para a clínica toda.
 */
export function findConflict(db: Pick<Db, "appointments" | "timeBlocks">, a: Candidate): Conflict | null {
  if (!a.time || a.status === "cancelled") return null;
  const start = toMin(a.time), end = start + a.durationMinutes;
  const clash = db.appointments.find((x) => x.id !== a.id && x.date === a.date && x.time && x.status !== "cancelled"
    && (x.professionalId ?? "") === (a.professionalId ?? "") && toMin(x.time) < end && start < toMin(x.time) + x.durationMinutes);
  if (clash) return { kind: "appointment", time: clash.time!, text: `Esse horário bate com outro compromisso às ${clash.time}.` };
  const block = db.timeBlocks.find((b) => b.date === a.date && (!b.professionalId || b.professionalId === a.professionalId)
    && toMin(b.startTime) < end && start < toMin(b.endTime));
  if (block) return { kind: "block", time: block.startTime, text: `Esse horário está bloqueado (${block.reason}, ${block.startTime} às ${block.endTime}).` };
  return null;
}

/**
 * Valida e limpa um agendamento antes de gravar. Compartilhado pelas duas camadas de dados.
 * Encaixe (`forced`) ignora conflito de horário, mas nunca profissional inexistente.
 */
export function prepareAppointment<T extends Omit<Appointment, "id"> & { id?: string }>(db: Pick<Db, "appointments" | "timeBlocks" | "professionals">, a: T): T {
  if (a.professionalId && !db.professionals.some((p) => p.id === a.professionalId)) throw new Error("Profissional não encontrado.");
  const procedures = checkProcedures(a.procedures);
  const label = a.label?.trim().slice(0, MAX_LABEL) || undefined;
  const out = { ...a, procedures, label, forced: a.forced || undefined } as T;
  if (procedures) out.durationMinutes = Math.min(600, Math.max(5, procedureTotals(procedures).minutes));
  if (!out.forced) {
    const clash = findConflict(db, out);
    if (clash) throw new Error(`${clash.text} Marque "Forçar encaixe" para marcar mesmo assim.`);
  }
  return out;
}

/** Cartões que se sobrepõem dividem a largura da coluna, lado a lado (encaixes ficam visíveis). */
export function layoutLanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((x, y) => x.start - y.start || y.end - x.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => { cluster.forEach((c) => out.push({ ...c.item, lane: c.lane, lanes: laneEnds.length })); cluster = []; laneEnds = []; clusterEnd = -1; };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    cluster.push({ item: it, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Busca por nome do paciente (sem acento nem caixa) ou telefone (só dígitos). */
export function matchesPatient(patient: { fullName: string; phone?: string } | undefined, query: string) {
  const q = query.trim();
  if (!q || !patient) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && (patient.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
  return plain(patient.fullName).includes(plain(q));
}

export const activeProfessionals = (list: Professional[]) => list.filter((p) => p.active);
