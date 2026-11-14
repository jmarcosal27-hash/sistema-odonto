import type { Db } from "./types";
import { addDays, todayISO } from "./format";

// Dados de exemplo inventados (nomes e números fictícios) para as telas terem
// algo real a mostrar. Ajustes > Seus dados permite começar do zero.
export function buildSeed(db: Db): Db {
  const t = todayISO();
  const iso = (d: string) => new Date(d + "T12:00:00").toISOString();
  const month = t.slice(0, 7);

  db.patients = [
    { id: "p1", fullName: "Marina Albuquerque Teixeira", birthDate: "1991-" + t.slice(5, 7) + "-22", sex: "female", phone: "(11) 98877-1020", email: "marina@exemplo.com", cpf: "529.982.247-25", referralSource: "Instagram", recallEnabled: true, lastVisitAt: addDays(t, -6), createdAt: iso(addDays(t, -40)) },
    { id: "p2", fullName: "Rafael Nogueira", birthDate: "1984-03-02", sex: "male", phone: "(11) 97766-3344", referralSource: "Indicação", recallEnabled: true, lastVisitAt: addDays(t, -48), createdAt: iso(addDays(t, -120)) },
    { id: "p3", fullName: "Helena Prado Castilho", birthDate: "2016-09-14", sex: "female", phone: "(11) 96655-7788", guardian: { name: "Juliana Prado", phone: "(11) 96655-7788", relationship: "Mãe" }, referralSource: "Google", recallEnabled: true, createdAt: iso(addDays(t, -3)) },
    { id: "p4", fullName: "Osvaldo Ribeiro de Assis Junqueira Filho", birthDate: "1958-12-30", sex: "male", phone: "(11) 95544-1122", referralSource: "Convênio", notes: "Prefere horários pela manhã.", recallEnabled: true, lastVisitAt: addDays(t, -400), createdAt: iso(addDays(t, -500)) },
    { id: "p5", fullName: "Beatriz Lemos", birthDate: "1999-07-08", sex: "female", recallEnabled: false, createdAt: iso(addDays(t, -1)) },
  ];

  db.plans = [{
    id: "plan1", patientId: "p2", kind: "adult", validityDays: 30, status: "budgeted", createdAt: iso(addDays(t, -5)),
    items: [
      { id: "i1", tooth: 36, conditions: ["decayed"], procedureName: "Canal – multirradicular", phase: "urgency", priceCents: 120000 },
      { id: "i2", tooth: 36, conditions: ["decayed"], procedureName: "Coroa em cerâmica", phase: "rehab", priceCents: 180000 },
      { id: "i3", conditions: [], procedureName: "Profilaxia (limpeza)", phase: "oral_prep", priceCents: 25000 },
    ],
  }, {
    id: "plan2", patientId: "p1", kind: "adult", validityDays: 30, status: "authorized", createdAt: iso(addDays(t, -20)),
    items: [
      { id: "i4", tooth: 11, conditions: ["failed_restoration"], procedureName: "Faceta direta em resina", phase: "esthetic", priceCents: 60000 },
      { id: "i5", tooth: 21, conditions: ["failed_restoration"], procedureName: "Faceta direta em resina", phase: "esthetic", priceCents: 60000 },
    ],
  }];

  db.budgets = [
    { id: "b1", planId: "plan1", patientId: "p2", totalCents: 325000, status: "presented", authorizedItemIds: [], presentedAt: iso(addDays(t, -5)) },
    { id: "b2", planId: "plan2", patientId: "p1", totalCents: 120000, status: "authorized", authorizedItemIds: ["i4", "i5"], presentedAt: iso(addDays(t, -20)), authorizedAt: iso(addDays(t, -18)) },
  ];

  db.treatments = [
    { id: "t1", patientId: "p1", budgetId: "b2", planItemId: "i4", procedureName: "Faceta direta em resina · dente 11", performedAt: addDays(t, -6), priceCents: 60000, paymentStatus: "received", clinicalStatus: "done", createdAt: iso(addDays(t, -6)) },
    { id: "t2", patientId: "p1", budgetId: "b2", planItemId: "i5", procedureName: "Faceta direta em resina · dente 21", performedAt: addDays(t, -6), priceCents: 60000, paymentStatus: "pending", clinicalStatus: "in_progress", createdAt: iso(addDays(t, -6)) },
    { id: "t3", patientId: "p2", procedureName: "Consulta inicial", performedAt: addDays(t, -48), priceCents: 15000, paymentStatus: "received", clinicalStatus: "done", createdAt: iso(addDays(t, -48)) },
  ];

  db.expenses = [
    { id: "e1", category: "Aluguel", amountCents: 180000, spentAt: `${month}-05`, recurring: true },
    { id: "e2", category: "Material", description: "Resinas e brocas", amountCents: 42000, spentAt: `${month}-03`, recurring: false },
    { id: "e3", category: "Laboratório", amountCents: 35000, spentAt: addDays(t, -40), recurring: false },
  ];

  db.appointments = [
    { id: "a1", patientId: "p1", kind: "return", date: t, time: "09:00", durationMinutes: 30, status: "confirmed" },
    { id: "a2", patientId: "p3", kind: "consultation", date: t, time: "14:00", durationMinutes: 45, status: "to_confirm" },
    { id: "a3", patientId: "p2", kind: "consultation", date: addDays(t, 2), time: "10:30", durationMinutes: 60, status: "to_confirm" },
    { id: "a4", kind: "personal", title: "Curso de atualização", date: addDays(t, 3), time: "08:00", durationMinutes: 120, status: "confirmed" },
  ];

  db.events = [
    { id: "ev1", patientId: "p1", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -40)) },
    { id: "ev2", patientId: "p1", kind: "budget_authorized", label: "Orçamento aprovado", createdAt: iso(addDays(t, -18)) },
    { id: "ev3", patientId: "p1", kind: "treatment_done", label: "Faceta direta em resina · dente 11 realizado", createdAt: iso(addDays(t, -6)) },
    { id: "ev4", patientId: "p2", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -120)) },
    { id: "ev5", patientId: "p2", kind: "budget_presented", label: "Orçamento apresentado", createdAt: iso(addDays(t, -5)) },
    { id: "ev6", patientId: "p3", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -3)) },
    { id: "ev7", patientId: "p4", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -500)) },
    { id: "ev8", patientId: "p5", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -1)) },
  ];

  db.prices = { "geral-avaliação-0": 15000, "geral-prevenção-0": 25000 };
  db.profile = { ...db.profile, professionalName: "Dra. Exemplo", onboardingDone: false };
  return db;
}
