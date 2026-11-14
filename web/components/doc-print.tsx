"use client";

import type { ReactNode } from "react";
import { dateBR } from "@/lib/format";
import { APP_NAME } from "@/lib/brand";
import type { Db, Patient } from "@/lib/types";
import { DOCUMENT_NOTICE } from "./documents";

interface Professional { professionalName?: string; professionalCro?: string; professionalCroUf?: string }

/** Moldura A4 comum de receita e atestado: cabeçalho da clínica, paciente, assinatura à mão e aviso de minuta. */
export function DocPrint({ db, title, issuedOn, patient, doc, children }: {
  db: Db; title: string; issuedOn: string; patient?: Patient; doc: Professional; children: ReactNode;
}) {
  const color = db.profile.pdfColor ?? "var(--brand)";
  const croLine = doc.professionalCro ? `CRO ${doc.professionalCro}${doc.professionalCroUf ? `/${doc.professionalCroUf}` : ""}` : "";
  const missing = !doc.professionalName || !doc.professionalCro || !doc.professionalCroUf;
  return (
    <div className="min-h-dvh bg-surface-200 text-ink" style={{ colorScheme: "light" }}>
      <div className="print:hidden sticky top-0 flex flex-wrap items-center justify-end gap-3 bg-surface-300 p-3">
        {missing && <p className="mr-auto text-sm">Faltam nome, CRO ou UF do profissional neste documento. Preencha em Ajustes e emita de novo.</p>}
        <button onClick={() => window.print()} className="rounded-pill bg-brand px-4 h-11 text-sm font-semibold text-on-brand">Imprimir ou salvar PDF</button>
      </div>
      <article className="mx-auto flex min-h-[27cm] max-w-3xl flex-col p-8 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b-4 pb-4" style={{ borderColor: color }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color }}>{db.profile.clinicName || APP_NAME}</h1>
            {db.profile.contact && <p className="text-sm text-ink-muted">{db.profile.contact}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{title}</p>
            <p>{dateBR(issuedOn)}</p>
          </div>
        </header>
        <section className="py-4 text-sm">
          <p><span className="font-semibold">Profissional:</span> {doc.professionalName || "—"}{croLine && ` · ${croLine}`}</p>
          <p><span className="font-semibold">Paciente:</span> {patient?.fullName ?? "—"}</p>
        </section>
        <div className="flex-1">{children}</div>
        <div className="mt-16 mx-auto w-80 text-center text-xs">
          <div className="border-t border-ink pt-2">{doc.professionalName || "Profissional"}{croLine && <><br />{croLine}</>}</div>
          <p className="mt-1 text-ink-muted">Assinatura (à mão)</p>
        </div>
        <footer className="mt-8 border-t border-border pt-2 text-center text-[11px] text-ink-muted">{DOCUMENT_NOTICE}</footer>
      </article>
    </div>
  );
}
