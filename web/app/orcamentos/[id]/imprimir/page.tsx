"use client";

import { use, useState } from "react";
import { useDb, itemTotal, regionLabel, PAYMENT_METHODS } from "@/lib/store";
import { PHASES } from "@/lib/catalog";
import { dateBR, money, addDays } from "@/lib/format";
import { APP_NAME } from "@/lib/brand";
import { FaceStage } from "@/components/hof-faceogram";
import { hofRegionLabel, productText } from "@/lib/hof";

// Documento de orçamento para imprimir / salvar como PDF pelo navegador.
// Layout próprio. A geração de PDF no servidor fica para o replica-backend.
export default function PrintBudget({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  const [showFace, setShowFace] = useState(true);
  if (!db) return <p className="p-8">Carregando…</p>;
  const b = db.budgets.find((x) => x.id === id);
  const plan = b && db.plans.find((p) => p.id === b.planId);
  const patient = b && db.patients.find((p) => p.id === b.patientId);
  if (!b || !plan) return <p className="p-8">Orçamento não encontrado.</p>;
  const color = db.profile.pdfColor ?? "var(--brand)";
  const installments = db.installments.filter((n) => n.budgetId === b.id).sort((x, y) => x.number - y.number);
  const hofItems = plan.items.filter((i) => i.hof);
  const validUntil = addDays(b.presentedAt.slice(0, 10), plan.validityDays);

  return (
    <div className="min-h-dvh bg-surface-200 text-ink" style={{ colorScheme: "light" }}>
      <div className="print:hidden sticky top-0 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-surface-300 p-3">
        {hofItems.length > 0 && (
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={showFace} onChange={(e) => setShowFace(e.target.checked)} />Mostrar faceograma na impressão
          </label>
        )}
        <button onClick={() => window.print()} className="rounded-pill bg-brand px-4 h-10 text-sm font-semibold text-on-brand">Imprimir ou salvar PDF</button>
      </div>
      <article className="mx-auto max-w-3xl p-8 print:p-0">
        <header className="flex items-start justify-between border-b-4 pb-4" style={{ borderColor: color }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color }}>{db.profile.professionalName || APP_NAME}</h1>
            {db.profile.cro && <p className="text-sm">CRO {db.profile.cro}</p>}
            {db.profile.contact && <p className="text-sm text-ink-muted">{db.profile.contact}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Orçamento</p>
            <p>Emitido em {dateBR(b.presentedAt)}</p>
            <p>Válido até {dateBR(validUntil)}</p>
          </div>
        </header>
        <section className="py-4 text-sm">
          <p><span className="font-semibold">Paciente:</span> {patient?.fullName}</p>
          {patient?.phone && <p><span className="font-semibold">Telefone:</span> {patient.phone}</p>}
        </section>
        {PHASES.map((ph) => {
          const items = plan.items.filter((i) => i.phase === ph.id);
          if (!items.length) return null;
          return (
            <section key={ph.id} className="mb-4 break-inside-avoid">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide" style={{ color }}>{ph.label}</h2>
              <table className="w-full text-sm">
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b border-border">
                      <td className="py-1.5">{i.procedureName}{(i.quantity ?? 1) > 1 ? ` ×${i.quantity}` : ""}</td>
                      <td className="py-1.5 w-28 text-ink-muted">{i.hof ? "HOF" : i.tooth ? `Dente ${i.tooth}` : i.region ? regionLabel(i.region) : "—"}</td>
                      <td className="py-1.5 w-32 text-right tabular-nums">{i.priceCents !== undefined ? money(itemTotal(i)) : "a combinar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        {hofItems.length > 0 && (
          <section className="mb-4 break-inside-avoid">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide" style={{ color }}>Harmonização orofacial</h2>
            <div className="flex flex-wrap items-start gap-4">
              {showFace && (
                <div className="w-48 shrink-0">
                  <FaceStage face={hofItems[0].hofFace ?? "female"} regions={hofItems.flatMap((i) => i.hofRegions ?? [])} shapes={hofItems.flatMap((i) => i.hofMarks ?? [])} />
                </div>
              )}
              <table className="min-w-0 flex-1 basis-60 text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-ink-muted"><th className="py-1 font-semibold">Região</th><th className="py-1 font-semibold">Procedimento</th><th className="py-1 text-right font-semibold">Produto</th></tr></thead>
                <tbody>
                  {hofItems.map((i) => (
                    <tr key={i.id} className="border-b border-border align-top">
                      <td className="py-1.5 pr-2">{(i.hofRegions ?? []).map(hofRegionLabel).join(", ")}</td>
                      <td className="py-1.5 pr-2">{i.procedureName}{i.dentistName && <span className="block text-xs text-ink-muted">{i.dentistName}</span>}</td>
                      <td className="py-1.5 text-right tabular-nums">{productText(i) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div className="text-sm space-y-2 max-w-sm">
            {!!plan.paymentMethods?.length && <p><span className="font-semibold">Formas de pagamento:</span> {PAYMENT_METHODS.filter((m) => plan.paymentMethods!.includes(m.id)).map((m) => m.label).join(", ")}</p>}
            {plan.notes && <p><span className="font-semibold">Observações:</span> {plan.notes}</p>}
            {installments.length > 1 && (
              <div><p className="font-semibold">Parcelas</p><ul>{installments.map((n) => <li key={n.id} className="tabular-nums">{n.number}/{n.of} · {dateBR(n.dueDate)} · {money(n.amountCents)}{n.paidAt ? " · pago" : ""}</li>)}</ul></div>
            )}
          </div>
          <div className="rounded-md px-6 py-3 text-right" style={{ background: "var(--surface-300)" }}>
            {!!b.discountCents && <p className="text-xs">Subtotal {money(b.subtotalCents ?? b.totalCents + b.discountCents)} · desconto {money(b.discountCents)}</p>}
            <p className="text-xs">Total</p>
            <p className="text-2xl font-bold tabular-nums">{money(b.totalCents)}</p>
          </div>
        </div>
        <footer className="mt-16 grid grid-cols-2 gap-12 text-center text-xs">
          <div className="border-t border-ink pt-2">{db.profile.professionalName || "Profissional"}</div>
          <div className="border-t border-ink pt-2">{patient?.fullName ?? "Paciente"}</div>
        </footer>
      </article>
    </div>
  );
}
