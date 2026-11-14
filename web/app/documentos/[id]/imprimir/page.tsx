"use client";

import { use } from "react";
import { useDb } from "@/lib/store";
import { DocPrint } from "@/components/doc-print";

// Documento de texto livre, impresso como minuta com o título dado pelo profissional.
export default function PrintCustomDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  if (!db) return <p className="p-8">Carregando…</p>;
  const d = db.customDocuments.find((x) => x.id === id);
  if (!d) return <p className="p-8">Documento não encontrado.</p>;
  const patient = db.patients.find((p) => p.id === d.patientId);

  return (
    <DocPrint db={db} title={d.title} issuedOn={d.issuedOn} patient={patient} doc={d}>
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed">{d.body}</p>
    </DocPrint>
  );
}
