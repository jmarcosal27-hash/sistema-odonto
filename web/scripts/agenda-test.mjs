// Teste das regras puras da agenda (conflito por profissional, bloqueio, encaixe, séries, faixas).
// Uso: node scripts/agenda-test.mjs   (não precisa de banco nem de .env.local)
import assert from "node:assert/strict";
import { blockDates, checkProcedures, findConflict, layoutLanes, matchesPatient, prepareAppointment, repeatDates } from "../lib/agenda.ts";

const ap = (id, professionalId, time, durationMinutes = 30, status = "confirmed") => ({ id, professionalId, date: "2026-12-01", time, durationMinutes, status, kind: "consultation" });
const db = {
  professionals: [{ id: "p1", name: "A", color: "#2563eb", active: true }, { id: "p2", name: "B", color: "#16a34a", active: true }],
  appointments: [ap("x1", "p1", "09:00", 60), ap("x2", undefined, "14:00")],
  timeBlocks: [{ id: "b1", professionalId: "p1", date: "2026-12-01", startTime: "12:00", endTime: "13:00", reason: "Almoço" }, { id: "b2", date: "2026-12-02", startTime: "08:00", endTime: "18:00", reason: "Feriado" }],
};
const cand = (professionalId, time, extra = {}) => ({ date: "2026-12-01", time, durationMinutes: 30, status: "to_confirm", professionalId, ...extra });

assert.equal(findConflict(db, cand("p1", "09:30"))?.kind, "appointment", "mesmo profissional sobrepõe");
assert.equal(findConflict(db, cand("p2", "09:30")), null, "outro profissional no mesmo horário não conflita");
assert.equal(findConflict(db, cand("p1", "10:00")), null, "encostar no fim não conflita");
assert.equal(findConflict(db, cand("p1", "12:30"))?.kind, "block", "bloqueio do profissional");
assert.equal(findConflict(db, cand("p2", "12:30")), null, "bloqueio de p1 não vale para p2");
assert.equal(findConflict(db, cand("p2", "09:00", { date: "2026-12-02" }))?.kind, "block", "bloqueio da clínica toda vale para todos");
assert.equal(findConflict(db, cand(undefined, "14:15"))?.kind, "appointment", "sem profissional conta como um recurso só");
assert.equal(findConflict(db, cand("p1", "09:30", { id: "x1" })), null, "editar o próprio agendamento não conflita consigo");
assert.equal(findConflict(db, cand("p1", "09:30", { status: "cancelled" })), null, "cancelado não conflita");
assert.equal(findConflict(db, cand("p1", undefined)), null, "sem horário (a definir) não conflita");

assert.throws(() => prepareAppointment(db, { ...cand("p1", "09:30"), kind: "consultation" }), /Forçar encaixe/, "conflito sem encaixe é recusado");
assert.equal(prepareAppointment(db, { ...cand("p1", "09:30"), kind: "consultation", forced: true }).forced, true, "encaixe passa");
assert.throws(() => prepareAppointment(db, { ...cand("fantasma", "10:00"), kind: "consultation" }), /Profissional não encontrado/);
const withProcs = prepareAppointment(db, { ...cand("p2", "10:00"), kind: "consultation", procedures: [{ name: " Limpeza ", priceCents: 100, durationMinutes: 30 }, { name: "Flúor", priceCents: 50, durationMinutes: 15 }] });
assert.equal(withProcs.durationMinutes, 45, "duração = soma dos procedimentos");
assert.equal(withProcs.procedures[0].name, "Limpeza");
assert.equal(prepareAppointment(db, { ...cand("p2", "10:00"), kind: "consultation", label: "  x".padEnd(50, "y") }).label.length, 30, "etiqueta cortada em 30");

assert.throws(() => checkProcedures([{ name: " ", priceCents: 1, durationMinutes: 10 }]));
assert.throws(() => checkProcedures([{ name: "x", priceCents: -1, durationMinutes: 10 }]));
assert.throws(() => checkProcedures([{ name: "x", priceCents: 1, durationMinutes: 0 }]));
assert.throws(() => checkProcedures(Array.from({ length: 21 }, () => ({ name: "x", priceCents: 1, durationMinutes: 5 }))));
assert.equal(checkProcedures([]), undefined);

assert.deepEqual(repeatDates("2026-12-28", 7, 3), ["2026-12-28", "2027-01-04", "2027-01-11"], "semanal atravessa o ano");
assert.equal(repeatDates("2026-12-01", 1, 99).length, 26, "série limitada a 26");
assert.deepEqual(blockDates("2026-12-04", "2026-12-08", true), ["2026-12-04", "2026-12-07", "2026-12-08"], "pula sábado e domingo");
assert.equal(blockDates("2026-12-04", "2026-12-08", false).length, 5);

const lanes = layoutLanes([{ start: 540, end: 600 }, { start: 560, end: 620 }, { start: 700, end: 730 }]);
assert.deepEqual(lanes.map((l) => [l.lane, l.lanes]), [[0, 2], [1, 2], [0, 1]], "sobrepostos dividem a coluna; o isolado ocupa tudo");

assert.ok(matchesPatient({ fullName: "José Açaí", phone: "(11) 98888-7777" }, "jose acai"));
assert.ok(matchesPatient({ fullName: "Maria", phone: "(11) 98888-7777" }, "88887777"));
assert.ok(!matchesPatient({ fullName: "Maria" }, "pedro"));
console.log("agenda-test: tudo certo.");
