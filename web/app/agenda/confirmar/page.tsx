"use client";

import { useState } from "react";
import { MessageCircle, Check, PencilLine } from "lucide-react";
import { useDb, api } from "@/lib/store";
import { addDays, dateLong, dateShort, todayISO, whatsappLink } from "@/lib/format";
import { Button, Card, Empty, Kpi, PageSkeleton, Badge } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { TemplateEditor, fill } from "@/components/template-editor";
import { useAction } from "@/components/toast";

export default function Page() {
  const db = useDb();
  const run = useAction();
  const [editing, setEditing] = useState(false);
  if (!db) return <PageSkeleton />;
  const end = addDays(todayISO(), 7);
  const window7 = db.appointments.filter((a) => a.patientId && a.date >= todayISO() && a.date <= end && a.status !== "cancelled");
  const pending = window7.filter((a) => a.status === "to_confirm").sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const confirmed = window7.filter((a) => a.status === "confirmed").length;
  const noPhone = pending.filter((a) => !db.patients.find((p) => p.id === a.patientId)?.phone).length;
  const tpl = db.templates.find((t) => t.kind === "confirmation")!;
  const byDay = pending.reduce<Record<string, typeof pending>>((acc, a) => { (acc[a.date] ??= []).push(a); return acc; }, {});

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="grid grid-cols-3 gap-3">
        <Kpi tone="warning" label="Para confirmar" value={pending.length} sub="próximos 7 dias" />
        <Kpi tone="success" label="Já confirmados" value={confirmed} sub="próximos 7 dias" />
        <Kpi label="Sem WhatsApp" value={noPhone} sub="falta celular na ficha" />
      </div>
      <div className="flex justify-end"><Button variant="soft" size="sm" onClick={() => setEditing(true)}><PencilLine className="size-4" />Editar mensagem</Button></div>
      {!pending.length ? (
        <Card><Empty title="Tudo confirmado" body="Ninguém pendente para os próximos 7 dias." /></Card>
      ) : Object.entries(byDay).map(([d, list]) => (
        <section key={d} className="space-y-2">
          <h2 className="text-sm font-semibold first-letter:uppercase">{dateLong(d)}</h2>
          {list.map((a) => {
            const p = db.patients.find((x) => x.id === a.patientId)!;
            const msg = fill(tpl.body, { nome: p.fullName.split(" ")[0], data: dateShort(a.date), hora: a.time });
            return (
              <Card key={a.id} as="article" className="flex flex-wrap items-center gap-3 p-4">
                <span className="w-14 text-center font-bold tabular-nums">{a.time ?? "—"}</span>
                <div className="flex-1 min-w-40">
                  <p className="font-semibold truncate">{p.fullName}</p>
                  <p className="text-xs text-ink-muted">{a.kind === "return" ? "Retorno" : "Consulta"} · {a.durationMinutes} min</p>
                </div>
                {p.phone
                  ? <a href={whatsappLink(p.phone, msg)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-success-soft px-4 text-sm font-semibold"><MessageCircle className="size-4" />Enviar lembrete</a>
                  : <Badge tone="warning">Sem celular</Badge>}
                <Button size="sm" variant="secondary" onClick={() => run(() => api.appointments.setStatus(a.id, "confirmed"), "Confirmado.")}><Check className="size-4" />Confirmou</Button>
              </Card>
            );
          })}
        </section>
      ))}
      {editing && <TemplateEditor template={tpl} onClose={() => setEditing(false)} />}
    </div>
  );
}
