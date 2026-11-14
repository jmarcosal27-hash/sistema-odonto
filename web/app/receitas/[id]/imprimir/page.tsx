"use client";

import { use } from "react";
import { useDb } from "@/lib/store";
import { DocPrint } from "@/components/doc-print";
import { CONTROLLED_NOTICE } from "@/components/documents";

// Receita simples para imprimir pelo navegador (sem PDF no servidor). É uma minuta:
// itens controlados só sinalizam; receita de controle especial exige talonário oficial.
export default function PrintPrescription({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  if (!db) return <p className="p-8">Carregando…</p>;
  const rx = db.prescriptions.find((x) => x.id === id);
  if (!rx) return <p className="p-8">Receita não encontrada.</p>;
  const patient = db.patients.find((p) => p.id === rx.patientId);
  const controlled = rx.items.some((i) => i.controlled);

  return (
    <DocPrint db={db} title="Receita" issuedOn={rx.issuedOn} patient={patient} doc={rx}>
      {controlled && <p className="mb-4 rounded-md border border-border-strong p-2 text-xs font-semibold">{CONTROLLED_NOTICE}</p>}
      <ol className="space-y-4 text-sm">
        {rx.items.map((i, n) => (
          <li key={i.id} className="break-inside-avoid">
            <p className="flex flex-wrap justify-between gap-2 font-semibold">
              <span>{n + 1}. {i.name}{i.controlled ? " (controlado)" : ""}</span>
              <span className="font-normal">{i.quantity !== undefined ? `${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : i.unit ?? ""}</span>
            </p>
            <p className="text-xs text-ink-muted">{i.route === "internal" ? "Uso interno" : "Uso externo"}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{i.posology}</p>
          </li>
        ))}
      </ol>
      {rx.notes && <p className="mt-6 whitespace-pre-wrap break-words text-sm"><span className="font-semibold">Observações:</span> {rx.notes}</p>}
    </DocPrint>
  );
}
