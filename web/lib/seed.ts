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
    { id: "p2", fullName: "Rafael Nogueira", birthDate: "1984-03-02", sex: "male", phone: "(11) 97766-3344", referralSource: "Indicação", recallEnabled: true, lastVisitAt: addDays(t, -200), createdAt: iso(addDays(t, -260)) },
    { id: "p3", fullName: "Helena Prado Castilho", birthDate: "2016-09-14", sex: "female", phone: "(11) 96655-7788", guardian: { name: "Juliana Prado", phone: "(11) 96655-7788", relationship: "Mãe" }, referralSource: "Google", recallEnabled: true, createdAt: iso(addDays(t, -3)) },
    { id: "p4", fullName: "Osvaldo Ribeiro de Assis Junqueira Filho", birthDate: "1958-12-30", sex: "male", phone: "(11) 95544-1122", referralSource: "Convênio", notes: "Prefere horários pela manhã.", recallEnabled: true, lastVisitAt: addDays(t, -400), createdAt: iso(addDays(t, -500)) },
    { id: "p5", fullName: "Beatriz Lemos", birthDate: "1999-07-08", sex: "female", phone: "(11) 94433-2211", recallEnabled: false, createdAt: iso(addDays(t, -1)) },
    { id: "p6", fullName: "Caio Martins", phone: "(11) 93322-5566", recallEnabled: true, createdAt: iso(addDays(t, -30)) },
  ];

  db.plans = [{
    id: "plan1", patientId: "p2", kind: "adult", validityDays: 30, status: "budgeted", createdAt: iso(addDays(t, -5)),
    discountCents: 25000, paymentMethods: ["pix", "credit"],
    items: [
      { id: "i1", tooth: 36, conditions: ["decayed"], procedureId: "endo-canal-2", procedureName: "Canal – multirradicular", phase: "urgency", priceCents: 120000 },
      { id: "i2", tooth: 36, conditions: ["decayed"], procedureId: "protese-fixa-0", procedureName: "Coroa em cerâmica", phase: "rehab", priceCents: 180000 },
      { id: "i3", conditions: [], region: "both", procedureId: "geral-prevenção-0", procedureName: "Profilaxia (limpeza)", phase: "oral_prep", priceCents: 25000 },
    ],
  }, {
    id: "plan2", patientId: "p1", kind: "adult", validityDays: 30, status: "authorized", createdAt: iso(addDays(t, -20)),
    paymentMethods: ["pix"],
    items: [
      { id: "i4", tooth: 11, conditions: ["failed_restoration"], procedureId: "dentistica-estética-0", procedureName: "Faceta direta em resina", phase: "esthetic", priceCents: 60000 },
      { id: "i5", tooth: 21, conditions: ["failed_restoration"], procedureId: "dentistica-estética-0", procedureName: "Faceta direta em resina", phase: "esthetic", priceCents: 60000 },
    ],
  }, {
    id: "plan3", patientId: "p6", kind: "adult", validityDays: 30, status: "authorized", createdAt: iso(addDays(t, -25)),
    items: [{ id: "i6", tooth: 46, conditions: ["missing"], procedureId: "implante-implantes-0", procedureName: "Implante unitário", phase: "rehab", priceCents: 350000 }],
  }];

  db.budgets = [
    { id: "b1", planId: "plan1", patientId: "p2", subtotalCents: 325000, discountCents: 25000, totalCents: 300000, status: "presented", authorizedItemIds: [], presentedAt: iso(addDays(t, -5)) },
    { id: "b2", planId: "plan2", patientId: "p1", subtotalCents: 120000, discountCents: 0, totalCents: 120000, status: "authorized", authorizedItemIds: ["i4", "i5"], presentedAt: iso(addDays(t, -20)), authorizedAt: iso(addDays(t, -18)) },
    { id: "b3", planId: "plan3", patientId: "p6", subtotalCents: 350000, discountCents: 0, totalCents: 350000, status: "authorized", authorizedItemIds: ["i6"], presentedAt: iso(addDays(t, -25)), authorizedAt: iso(addDays(t, -21)) },
  ];

  db.installments = [
    { id: "n1", budgetId: "b2", patientId: "p1", number: 1, of: 2, dueDate: addDays(t, -18), amountCents: 60000, method: "pix", paidAt: addDays(t, -18) },
    { id: "n2", budgetId: "b2", patientId: "p1", number: 2, of: 2, dueDate: addDays(t, 12), amountCents: 60000, method: "pix" },
    { id: "n3", budgetId: "b3", patientId: "p6", number: 1, of: 3, dueDate: addDays(t, -21), amountCents: 116666, method: "credit", paidAt: addDays(t, -21) },
    { id: "n4", budgetId: "b3", patientId: "p6", number: 2, of: 3, dueDate: addDays(t, -3), amountCents: 116666, method: "credit" },
    { id: "n5", budgetId: "b3", patientId: "p6", number: 3, of: 3, dueDate: addDays(t, 27), amountCents: 116668, method: "credit" },
  ];

  db.treatments = [
    { id: "t1", patientId: "p1", budgetId: "b2", planItemId: "i4", procedureId: "dentistica-estética-0", procedureName: "Faceta direta em resina · dente 11", performedAt: addDays(t, -6), priceCents: 60000, paymentStatus: "budget", clinicalStatus: "done", createdAt: iso(addDays(t, -6)) },
    { id: "t2", patientId: "p1", budgetId: "b2", planItemId: "i5", procedureId: "dentistica-estética-0", procedureName: "Faceta direta em resina · dente 21", performedAt: addDays(t, -6), priceCents: 60000, paymentStatus: "budget", clinicalStatus: "in_progress", createdAt: iso(addDays(t, -6)) },
    { id: "t3", patientId: "p2", procedureId: "geral-avaliação-0", procedureName: "Consulta inicial", performedAt: addDays(t, -200), priceCents: 15000, paymentStatus: "received", clinicalStatus: "done", createdAt: iso(addDays(t, -200)) },
    { id: "t4", patientId: "p6", budgetId: "b3", planItemId: "i6", procedureId: "implante-implantes-0", procedureName: "Implante unitário · dente 46", performedAt: addDays(t, -21), priceCents: 350000, paymentStatus: "budget", clinicalStatus: "in_progress", createdAt: iso(addDays(t, -21)) },
  ];

  db.expenses = [
    { id: "e1", category: "Aluguel", amountCents: 180000, spentAt: `${month}-05`, recurring: true, paid: true },
    { id: "e2", category: "Material", description: "Resinas e brocas", amountCents: 42000, spentAt: `${month}-03`, recurring: false, paid: true },
    { id: "e3", category: "Laboratório", description: "Coroa do Rafael", amountCents: 35000, spentAt: `${month}-28`, recurring: false, paid: false },
    { id: "e4", category: "Contas (luz, água, internet)", amountCents: 38000, spentAt: `${month}-20`, recurring: true, paid: false },
  ];

  db.appointments = [
    { id: "a1", patientId: "p1", kind: "return", date: t, time: "09:00", durationMinutes: 30, status: "confirmed" },
    { id: "a2", patientId: "p3", kind: "consultation", date: t, time: "14:00", durationMinutes: 45, status: "to_confirm" },
    { id: "a3", patientId: "p5", kind: "consultation", date: addDays(t, 2), time: "10:30", durationMinutes: 60, status: "to_confirm" },
    { id: "a4", kind: "personal", title: "Curso de atualização", date: addDays(t, 3), time: "08:00", durationMinutes: 120, status: "confirmed" },
    { id: "a5", patientId: "p1", kind: "consultation", date: addDays(t, -6), time: "10:00", durationMinutes: 60, status: "done" },
    { id: "a6", patientId: "p2", kind: "return", date: addDays(t, -4), time: "15:00", durationMinutes: 30, status: "no_show" },
    { id: "a7", patientId: "p4", kind: "consultation", date: addDays(t, 1), time: "16:00", durationMinutes: 30, status: "cancelled" },
  ];

  db.waitlist = [
    { id: "w1", patientId: "p3", period: "morning", notes: "Mãe só pode de manhã", status: "waiting", createdAt: iso(addDays(t, -2)) },
  ];

  db.events = [
    { id: "ev1", patientId: "p1", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -40)) },
    { id: "ev2", patientId: "p1", kind: "budget_authorized", label: "Orçamento aprovado em 2x", createdAt: iso(addDays(t, -18)) },
    { id: "ev3", patientId: "p1", kind: "treatment_done", label: "Faceta direta em resina · dente 11 realizado", createdAt: iso(addDays(t, -6)) },
    { id: "ev4", patientId: "p2", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -260)) },
    { id: "ev5", patientId: "p2", kind: "budget_presented", label: "Orçamento apresentado", createdAt: iso(addDays(t, -5)) },
    { id: "ev6", patientId: "p3", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -3)) },
    { id: "ev7", patientId: "p4", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -500)) },
    { id: "ev8", patientId: "p5", kind: "created", label: "Cadastro criado", createdAt: iso(addDays(t, -1)) },
    { id: "ev9", patientId: "p6", kind: "budget_authorized", label: "Orçamento aprovado em 3x", createdAt: iso(addDays(t, -21)) },
  ];

  db.prices = { "geral-avaliação-0": 15000, "geral-prevenção-0": 25000 };
  db.recallMonths = { "geral-prevenção-0": 6, "dentistica-estética-0": 12 };
  db.profile = { ...db.profile, professionalName: "Dra. Exemplo", onboardingDone: false };
  return db;
}
