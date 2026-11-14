"use client";

import { use } from "react";
import { useDb } from "@/lib/store";
import { PHASES } from "@/lib/catalog";
import { dateBR, money, addDays } from "@/lib/format";
import { APP_NAME } from "@/lib/brand";

// Documento de orçamento para imprimir / salvar como PDF pelo navegador.
// Layout próprio. A geração de PDF no servidor fica para o replica-backend.
export default function PrintBudget({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  if (!db) return <p className="p-8">Carregando…</p>;
  const b = db.budgets.find((x) => x.id === id);
  const plan = b && db.plans.find((p) => p.id === b.planId);
  const patient = b && db.patients.find((p) => p.id === b.patientId);
  if (!b || !plan) return <p className="p-8">Orçamento não encontrado.</p>;
  const color = db.profile.pdfColor ?? "var(--color-accent)";
  const validUntil = addDays(b.presentedAt.slice(0, 10), plan.validityDays);

  return (
    <div className="min-h-dvh bg-surface text-text" style={{ colorScheme: "light" }}>
      <div className="print:hidden sticky top-0 flex justify-end gap-2 bg-surface-sidebar p-3">
        <button onClick={() => window.print()} className="rounded-pill bg-accent px-4 h-10 text-sm font-semibold text-on-accent">Imprimir ou salvar PDF</button>
      </div>
      <article className="mx-auto max-w-3xl p-8 print:p-0">
        <header className="flex items-start justify-between border-b-4 pb-4" style={{ borderColor: color }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color }}>{db.profile.professionalName || APP_NAME}</h1>
            {db.profile.cro && <p className="text-sm">CRO {db.profile.cro}</p>}
            {db.profile.contact && <p className="text-sm text-muted">{db.profile.contact}</p>}
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
                      <td className="py-1.5">{i.procedureName}</td>
                      <td className="py-1.5 w-28 text-muted">{i.tooth ? `Dente ${i.tooth}` : "—"}</td>
                      <td className="py-1.5 w-32 text-right tabular-nums">{i.priceCents !== undefined ? money(i.priceCents) : "a combinar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        <div className="mt-6 flex justify-end">
          <div className="rounded-md px-6 py-3 text-right" style={{ background: "var(--color-surface-sidebar)" }}>
            <p className="text-xs">Total</p>
            <p className="text-2xl font-bold tabular-nums">{money(b.totalCents)}</p>
          </div>
        </div>
        <footer className="mt-16 grid grid-cols-2 gap-12 text-center text-xs">
          <div className="border-t border-text pt-2">{db.profile.professionalName || "Profissional"}</div>
          <div className="border-t border-text pt-2">{patient?.fullName ?? "Paciente"}</div>
        </footer>
      </article>
    </div>
  );
}
