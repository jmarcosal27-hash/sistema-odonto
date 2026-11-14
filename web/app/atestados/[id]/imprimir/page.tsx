"use client";

import { use } from "react";
import { useDb } from "@/lib/store";
import { DocPrint } from "@/components/doc-print";
import { certificateLabel } from "@/components/documents";
import { dateBR } from "@/lib/format";

// Atestado simples para imprimir pelo navegador. O CID só aparece se o paciente
// consentiu (registrado no próprio atestado). Texto-base próprio; é uma minuta.
export default function PrintCertificate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  if (!db) return <p className="p-8">Carregando…</p>;
  const c = db.certificates.find((x) => x.id === id);
  if (!c) return <p className="p-8">Atestado não encontrado.</p>;
  const patient = db.patients.find((p) => p.id === c.patientId);

  return (
    <DocPrint db={db} title="Atestado" issuedOn={c.issuedOn} patient={patient} doc={c}>
      <p className="text-base leading-relaxed">
        Atesto que <strong>{patient?.fullName ?? "o(a) paciente"}</strong> esteve em atendimento odontológico
        e deve ficar afastado(a) de suas atividades por <strong>{certificateLabel(c)}</strong>
        {c.kind === "days" ? `, a partir de ${dateBR(c.startsOn)}` : `, em ${dateBR(c.startsOn)}`}.
      </p>
      {c.cid && c.cidConsent && <p className="mt-4 text-sm"><span className="font-semibold">CID:</span> {c.cid} <span className="text-ink-muted">(informado com o consentimento do paciente)</span></p>}
      {c.purpose && <p className="mt-4 whitespace-pre-wrap break-words text-sm"><span className="font-semibold">Observação:</span> {c.purpose}</p>}
    </DocPrint>
  );
}
