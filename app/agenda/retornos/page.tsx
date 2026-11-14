"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, PencilLine, CalendarPlus, Check, X } from "lucide-react";
import { useDb, api, recallInfo, activePatients } from "@/lib/store";
import { dateBR, todayISO, whatsappLink } from "@/lib/format";
import type { RecallStatus } from "@/lib/types";
import { Avatar, Badge, Button, Card, Empty, Input, PageSkeleton, Segmented } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { TemplateEditor, fill } from "@/components/template-editor";
import { AppointmentForm } from "@/components/appointment-form";
import { useAction } from "@/components/toast";

const LABEL: Record<RecallStatus, string> = { pending: "Para chamar", contacted: "Contatados", scheduled: "Agendados", dismissed: "Dispensados" };

export default function Page() {
  const db = useDb();
  const run = useAction();
  const [tab, setTab] = useState<RecallStatus>("pending");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!db) return [];
    return activePatients(db).map((p) => ({ p, r: recallInfo(db, p) })).filter((x): x is { p: typeof x.p; r: NonNullable<typeof x.r> } => !!x.r);
  }, [db]);

  if (!db) return <PageSkeleton />;
  const tpl = db.templates.find((t) => t.kind === "recall")!;
  const counts = Object.fromEntries((Object.keys(LABEL) as RecallStatus[]).map((s) => [s, rows.filter((x) => x.r.status === s).length])) as Record<RecallStatus, number>;
  const list = rows.filter((x) => x.r.status === tab && (!q || x.p.fullName.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.r.dueAt.localeCompare(b.r.dueAt));
  const late = (due: string) => due < todayISO();

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <p className="text-sm text-muted text-center">Pacientes na hora de voltar. O prazo padrão é 6 meses depois da última visita; ajuste por procedimento em <Link href="/tabela" className="font-semibold text-accent">Tabela de preços</Link>.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Etapa" value={tab} onChange={setTab}
          options={(Object.keys(LABEL) as RecallStatus[]).map((s) => ({ value: s, label: `${LABEL[s]} · ${counts[s]}` }))} />
        <Button variant="soft" size="sm" onClick={() => setEditing(true)}><PencilLine className="size-4" />Editar mensagem</Button>
      </div>
      <Input aria-label="Buscar paciente" placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="p-0 overflow-hidden">
        {!list.length ? (
          <Empty title={tab === "pending" ? "Ninguém para chamar agora" : `Nenhum paciente em “${LABEL[tab]}”`}
            body={tab === "pending" ? "Quem tem atendimento concluído aparece aqui perto da data de voltar." : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map(({ p, r }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar name={p.fullName} />
                <div className="flex-1 min-w-48">
                  <Link href={`/pacientes/${p.id}`} className="font-semibold hover:underline">{p.fullName}</Link>
                  <p className="text-xs text-muted">Última visita {dateBR(r.lastVisit)} · voltar em {dateBR(r.dueAt)}</p>
                </div>
                {late(r.dueAt) && tab === "pending" && <Badge tone="warning">Atrasado</Badge>}
                <div className="flex flex-wrap gap-2">
                  {tab !== "scheduled" && (p.phone
                    ? <a href={whatsappLink(p.phone, fill(tpl.body, { nome: p.fullName.split(" ")[0] }))} target="_blank" rel="noreferrer"
                        onClick={() => tab === "pending" && api.recall.setStatus(p.id, "contacted", r.dueAt)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-success-subtle px-3 text-xs font-semibold"><MessageCircle className="size-4" />Chamar</a>
                    : <Badge tone="warning">Sem celular</Badge>)}
                  {tab === "pending" && <Button size="sm" variant="secondary" onClick={() => run(() => api.recall.setStatus(p.id, "contacted", r.dueAt), "Marcado como contatado.")}><Check className="size-4" />Contatado</Button>}
                  {tab !== "scheduled" && <Button size="sm" onClick={() => setBooking(p.id)}><CalendarPlus className="size-4" />Agendar</Button>}
                  {(tab === "pending" || tab === "contacted") && <Button size="sm" variant="ghost" onClick={() => run(() => api.recall.setStatus(p.id, "dismissed", r.dueAt), "Dispensado deste retorno.")}><X className="size-4" />Dispensar</Button>}
                  {tab === "dismissed" && <Button size="sm" variant="ghost" onClick={() => run(() => api.recall.setStatus(p.id, "pending", r.dueAt))}>Voltar para a lista</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <TemplateEditor template={tpl} onClose={() => setEditing(false)} />}
      {booking && <AppointmentForm open onClose={() => setBooking(null)} preset={{ patientId: booking, kind: "return" }} />}
    </div>
  );
}
