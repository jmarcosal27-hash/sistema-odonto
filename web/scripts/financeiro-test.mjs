// Teste das regras puras de caixa, comissão e estorno (correções de 2026-11-15).
// Uso: node scripts/financeiro-test.mjs   (não precisa de banco nem de .env.local)
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// lib/ usa imports sem extensão ("./format"), como o Next resolve; aqui tenta ".ts" quando falta.
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (spec.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const { cashLedger, commissionLines, splitProportional } = await import("../lib/cash.ts");
const { paidInstallments, received, receivedTreatments } = await import("../lib/finance.ts");
const { batchCashed } = await import("../lib/convenios.ts");

// Divisão proporcional sem perder centavo
assert.deepEqual(splitProportional(1000, [1, 1, 1]), [334, 333, 333], "1000 em 3 partes iguais");
assert.deepEqual(splitProportional(1000, [3000, 1000]), [750, 250], "proporcional ao preço");
assert.deepEqual(splitProportional(1, [1, 1]), [1, 0], "1 centavo vai para a primeira parte");
assert.deepEqual(splitProportional(500, [0, 0]), [250, 250], "pesos zero: por igual");
assert.deepEqual(splitProportional(0, [5, 5]), [0, 0], "total zero");
for (const [t, w] of [[99999, [7, 13, 29]], [12345, [1, 2, 3, 4]], [7, [100, 1]]]) {
  assert.equal(splitProportional(t, w).reduce((s, x) => s + x, 0), t, `soma exata ${t}`);
}

// Base: orçamento com Implante (R$ 3.000) e Limpeza (R$ 1.000), parcela de R$ 1.000 paga; dentista p1
const base = () => ({
  installments: [{ id: "i1", budgetId: "b1", patientId: "pt1", number: 1, of: 4, amountCents: 100000, dueDate: "2026-12-01", paidAt: "2026-12-01", method: "pix" }],
  treatments: [
    { id: "t1", budgetId: "b1", patientId: "pt1", procedureName: "Implante", priceCents: 300000, performedAt: "2026-12-01", paymentStatus: "budget", clinicalStatus: "done" },
    { id: "t2", budgetId: "b1", patientId: "pt1", procedureName: "Limpeza", priceCents: 100000, performedAt: "2026-12-01", paymentStatus: "budget", clinicalStatus: "done" },
    { id: "t3", patientId: "pt1", procedureName: "Avulso", priceCents: 20000, performedAt: "2026-12-02", paymentStatus: "received", clinicalStatus: "done" },
  ],
  expenses: [], cashMovements: [], billingBatches: [],
  cashReceipts: [{ id: "r1", sourceType: "installment", sourceId: "i1", professionalId: "p1" }, { id: "r2", sourceType: "treatment", sourceId: "t3", professionalId: "p1" }],
  appointments: [], commissionPayouts: [],
  commissionRules: [{ id: "c1", professionalId: "p1", procedureKey: "", percent: 10, labCostPercent: 0 }, { id: "c2", professionalId: "p1", procedureKey: "Implante", percent: 40, labCostPercent: 0 }],
});

// Comissão proporcional: 750 de Implante × 40% + 250 de Limpeza × 10% = 300 + 25 = R$ 325
{
  const db = base();
  const entry = cashLedger(db).find((e) => e.key === "installment:i1");
  assert.deepEqual(entry.parts, [{ procedure: "Implante", amountCents: 75000 }, { procedure: "Limpeza", amountCents: 25000 }], "parcela dividida pelos procedimentos");
  const line = commissionLines(db, "2026-12-01", "2026-12-31").find((l) => l.entry.key === "installment:i1");
  assert.equal(line.cents, 32500, "comissão soma as partes com a regra de cada procedimento");
  assert.equal(line.parts.length, 2, "linha mostra as duas partes");
}
// Mesma regra para tudo: conta sobre o valor inteiro, sem partes
{
  const db = base();
  db.commissionRules = [{ id: "c1", professionalId: "p1", procedureKey: "", percent: 30, labCostPercent: 10 }];
  const line = commissionLines(db, "2026-12-01", "2026-12-31").find((l) => l.entry.key === "installment:i1");
  assert.equal(line.cents, Math.round(100000 * 0.9 * 0.3), "regra única: 1000 × 90% × 30%");
  assert.equal(line.parts, undefined, "regra única não detalha partes");
}
// Procedimento sem regra (sem padrão): só a parte com regra conta
{
  const db = base();
  db.commissionRules = [{ id: "c2", professionalId: "p1", procedureKey: "Implante", percent: 40, labCostPercent: 0 }];
  const line = commissionLines(db, "2026-12-01", "2026-12-31").find((l) => l.entry.key === "installment:i1");
  assert.equal(line.cents, 30000, "só o Implante tem regra: 750 × 40%");
}

// Estorno vale em Financeiro/Indicadores, não só no Caixa
{
  const db = base();
  assert.equal(received(db, "2026-12-01", "2026-12-31"), 120000, "antes do estorno: parcela + avulso");
  db.cashReceipts[0].reversedAt = "2026-12-03T10:00:00Z"; db.cashReceipts[0].reversalReason = "Devolvido";
  db.cashReceipts[1].reversedAt = "2026-12-03T10:00:00Z"; db.cashReceipts[1].reversalReason = "Devolvido";
  assert.equal(received(db, "2026-12-01", "2026-12-31"), 0, "estornados saem do recebido");
  assert.equal(paidInstallments(db).length, 0, "parcela estornada não conta como paga");
  assert.equal(receivedTreatments(db).length, 0, "avulso estornado não conta como recebido");
  assert.equal(commissionLines(db, "2026-12-01", "2026-12-31").length, 0, "estornado não gera comissão");
}

// Quanto do lote já entrou no caixa
{
  const db = { billingBatches: [{ id: "bb1", cashedCents: 5000 }, { id: "bb2", cashedCents: 0 }], cashMovements: [] };
  assert.equal(batchCashed(db, "bb1"), 5000, "lote antigo sem entrada ligada: vale o gravado");
  db.cashMovements.push({ id: "m1", kind: "in", amountCents: 3000, billingBatchId: "bb2" }, { id: "m2", kind: "in", amountCents: 2000, billingBatchId: "bb2", reversedAt: "x" });
  assert.equal(batchCashed(db, "bb2"), 3000, "soma só as entradas não estornadas");
}

console.log("financeiro-test: tudo certo.");
