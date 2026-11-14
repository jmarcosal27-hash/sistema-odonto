"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, PencilLine } from "lucide-react";
import { useDb, recallBucket } from "@/lib/store";
import { dateBR, whatsappLink } from "@/lib/format";
import { Avatar, Badge, Button, Card, Empty, Input, PageSkeleton, Segmented } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { TemplateEditor, fill } from "@/components/template-editor";

export default function Page() {
  const db = useDb();
  const [bucket, setBucket] = useState<"30" | "365">("30");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  if (!db) return <PageSkeleton />;
  const tpl = db.templates.find((t) => t.kind === "recall")!;
  const list = db.patients
    .filter((p) => recallBucket(p) === bucket)
    .filter((p) => !q || p.fullName.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.lastVisitAt ?? "").localeCompare(b.lastVisitAt ?? ""));
  const days = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Tempo sem visita" value={bucket} onChange={setBucket} options={[{ value: "30", label: "1 a 12 meses" }, { value: "365", label: "Mais de 1 ano" }]} />
        <Button variant="soft" size="sm" onClick={() => setEditing(true)}><PencilLine className="size-4" />Editar mensagem</Button>
      </div>
      <div className="rounded-lg bg-surface-accent-subtle p-4">
        <p className="text-xs text-muted">Pacientes para chamar de volta</p>
        <p className="text-[22px] font-bold">{list.length}</p>
        <p className="text-xs text-muted">Contado a partir da última visita registrada — não é um prazo clínico.</p>
      </div>
      <Input aria-label="Buscar paciente" placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="p-0 overflow-hidden">
        {!list.length ? <Empty title="Ninguém nesta faixa" body="Pacientes com o lembrete ligado aparecem aqui depois de 30 dias sem visita." /> : (
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar name={p.fullName} />
                <div className="flex-1 min-w-40">
                  <Link href={`/pacientes/${p.id}`} className="font-semibold hover:underline">{p.fullName}</Link>
                  <p className="text-xs text-muted">Última visita {dateBR(p.lastVisitAt)} · há {days(p.lastVisitAt)} dias</p>
                </div>
                {p.phone
                  ? <a href={whatsappLink(p.phone, fill(tpl.body, { nome: p.fullName.split(" ")[0] }))} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface-success-subtle px-4 text-sm font-semibold"><MessageCircle className="size-4" />Chamar</a>
                  : <Badge tone="warning">Sem celular</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <TemplateEditor template={tpl} onClose={() => setEditing(false)} />}
    </div>
  );
}
