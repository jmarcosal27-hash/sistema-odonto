"use client";

import { useState } from "react";
import { ask } from "@/components/confirm";
import { MessageCircle, Check, CheckCheck, PencilLine, Send } from "lucide-react";
import { useDb, api } from "@/lib/store";
import { addDays, dateLong, dateShort, notStarted, todayISO, whatsappLink } from "@/lib/format";
import { Button, Card, Empty, Kpi, PageSkeleton, Badge } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { TemplateEditor, fill } from "@/components/template-editor";
import { useAction } from "@/components/toast";

export default function Page() {
  const db = useDb();
  const run = useAction();
  const [editing, setEditing] = useState(false);
  // Quem já recebeu o lembrete nesta sessão: permite ir enviando um a um, em sequência.
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const markSent = (id: string) => setSent((x) => new Set(x).add(id));
  if (!db) return <PageSkeleton />;
  const end = addDays(todayISO(), 7);
  const window7 = db.appointments.filter((a) => a.patientId && notStarted(a) && a.date <= end && a.status !== "cancelled");
  const pending = window7.filter((a) => a.status === "to_confirm").sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const confirmed = window7.filter((a) => a.status === "confirmed").length;
  const noPhone = pending.filter((a) => !db.patients.find((p) => p.id === a.patientId)?.phone).length;
  const tpl = db.templates.find((t) => t.kind === "confirmation")!;
  const msgOf = (a: (typeof pending)[number]) => { const p = db.patients.find((x) => x.id === a.patientId)!; return fill(tpl.body, { nome: p.fullName.split(" ")[0], data: dateShort(a.date), hora: a.time }); };
  const queue = pending.filter((a) => !sent.has(a.id) && db.patients.find((p) => p.id === a.patientId)?.phone);
  const sendNext = () => { const a = queue[0]; if (!a) return; const p = db.patients.find((x) => x.id === a.patientId)!; window.open(whatsappLink(p.phone!, msgOf(a)), "_blank", "noreferrer"); markSent(a.id); };
  const confirmAll = async (list: typeof pending, when: string) => {
    if (!(await ask({ title: `Marcar ${list.length === 1 ? "1 consulta" : `${list.length} consultas`} como confirmadas?`, body: `Todas as pendentes de ${when}. Use quando os pacientes já responderam.`, confirmLabel: "Confirmar todas" }))) return;
    void run(async () => { for (const a of list) await api.appointments.setStatus(a.id, "confirmed"); }, "Consultas confirmadas.");
  };
  const byDay = pending.reduce<Record<string, typeof pending>>((acc, a) => { (acc[a.date] ??= []).push(a); return acc; }, {});

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="grid grid-cols-3 gap-3">
        <Kpi tone="warning" label="Para confirmar" value={pending.length} sub="próximos 7 dias" />
        <Kpi tone="success" label="Já confirmados" value={confirmed} sub="próximos 7 dias" />
        <Kpi label="Sem WhatsApp" value={noPhone} sub="falta celular na ficha" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="soft" size="sm" onClick={() => setEditing(true)}><PencilLine className="size-4" />Editar mensagem</Button>
        {pending.length > 0 && <Button size="sm" disabled={!queue.length} onClick={sendNext}><Send aria-hidden className="size-4" />{queue.length ? `Enviar ao próximo (${queue.length} na fila)` : "Lembretes enviados"}</Button>}
      </div>
      {!pending.length ? (
        <Card><Empty title="Tudo confirmado" body="Ninguém pendente para os próximos 7 dias." /></Card>
      ) : Object.entries(byDay).map(([d, list]) => (
        <section key={d} className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold first-letter:uppercase">{dateLong(d)}</h2>{list.length > 1 && <Button size="sm" variant="ghost" onClick={() => void confirmAll(list, dateLong(d))}><CheckCheck aria-hidden className="size-4" />Confirmar todas</Button>}</div>
          {list.map((a) => {
            const p = db.patients.find((x) => x.id === a.patientId)!;
            const msg = msgOf(a);
            return (
              <Card key={a.id} as="article" className="flex flex-wrap items-center gap-3 p-4">
                <span className="w-14 text-center font-bold tabular-nums">{a.time ?? "—"}</span>
                <div className="flex-1 min-w-40">
                  <p className="font-semibold truncate">{p.fullName}</p>
                  <p className="text-xs text-ink-muted">{a.kind === "return" ? "Retorno" : "Consulta"} · {a.durationMinutes} min{sent.has(a.id) && <span className="font-semibold text-success"> · lembrete enviado</span>}</p>
                </div>
                {p.phone
                  ? <a href={whatsappLink(p.phone, msg)} onClick={() => markSent(a.id)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-success-soft px-4 text-sm font-semibold"><MessageCircle className="size-4" />Enviar lembrete</a>
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
