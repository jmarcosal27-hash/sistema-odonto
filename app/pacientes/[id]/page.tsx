"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Phone, CalendarPlus, Stethoscope, Pencil, Plus } from "lucide-react";
import { useDb, api, patientStatus } from "@/lib/store";
import { age, dateBR, dateShort, money, todayISO, whatsappLink } from "@/lib/format";
import { Avatar, Badge, Button, Card, Empty, Kpi, PageSkeleton, Toggle } from "@/components/ui";
import { PatientForm } from "@/components/patient-form";
import { AppointmentForm } from "@/components/appointment-form";
import { TreatmentForm } from "@/components/treatment-form";

const SEX = { female: "Feminino", male: "Masculino", other: "Outro" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  const [edit, setEdit] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [treat, setTreat] = useState(false);
  if (!db) return <PageSkeleton />;
  const p = db.patients.find((x) => x.id === id);
  if (!p) return <Card><Empty title="Paciente não encontrado" body="Ele pode ter sido removido ou o link está errado." action={<Link href="/pacientes" className="font-semibold text-accent">Voltar para pacientes</Link>} /></Card>;

  const budgets = db.budgets.filter((b) => b.patientId === id);
  const treatments = db.treatments.filter((t) => t.patientId === id).sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const upcoming = db.appointments.filter((a) => a.patientId === id && a.date >= todayISO() && a.status !== "cancelled").sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const events = db.events.filter((e) => e.patientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paid = treatments.filter((t) => t.paymentStatus === "received").reduce((s, t) => s + t.priceCents, 0);
  const due = treatments.filter((t) => t.paymentStatus === "pending").reduce((s, t) => s + t.priceCents, 0);
  const waiting = budgets.filter((b) => b.status === "presented").reduce((s, b) => s + b.totalCents, 0);
  const a = age(p.birthDate);
  const status = patientStatus(db, p);
  const addr = p.address && [p.address.street && `${p.address.street}${p.address.number ? ", " + p.address.number : ""}`, p.address.complement, p.address.neighborhood, p.address.city && `${p.address.city}${p.address.uf ? "/" + p.address.uf : ""}`, p.address.cep && `CEP ${p.address.cep}`].filter(Boolean).join(" · ");

  const actions = [
    p.phone && { label: "WhatsApp", icon: MessageCircle, href: whatsappLink(p.phone, `Olá, ${p.fullName.split(" ")[0]}!`) },
    p.phone && { label: "Ligar", icon: Phone, href: `tel:${p.phone.replace(/\D/g, "")}` },
  ].filter(Boolean) as { label: string; icon: typeof Phone; href: string }[];

  return (
    <div className="space-y-4">
      <Link href="/pacientes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="size-4" />Pacientes</Link>

      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={p.fullName} />
        <div className="flex-1 min-w-48">
          <h2 className="text-lg font-bold break-words">{p.fullName}</h2>
          <p className="text-sm text-muted">{[a !== undefined && `${a} anos`, p.sex && SEX[p.sex], p.phone].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
          <div className="mt-1">{{ in_treatment: <Badge tone="accent">Em tratamento</Badge>, open_budget: <Badge tone="warning">Orçamento em aberto</Badge>, seen: <Badge tone="success">Já atendido</Badge>, new: <Badge>Ainda não veio</Badge> }[status]}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map(({ label, icon: Icon, href }) => (
            <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-pill bg-surface-sidebar px-4 text-sm font-semibold"><Icon className="size-4" />{label}</a>
          ))}
          <Button variant="soft" onClick={() => setSchedule(true)}><CalendarPlus className="size-4" />Agendar</Button>
          <Link href={`/plano?paciente=${p.id}`} className="inline-flex h-10 items-center gap-2 rounded-pill bg-accent px-4 text-sm font-semibold text-on-accent"><Stethoscope className="size-4" />Novo plano</Link>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi tone="warning" label="Orçamento esperando" value={waiting ? money(waiting) : "—"} />
            <Kpi tone="success" label="Já pagou" value={money(paid)} />
            <Kpi label="Falta receber" value={due ? money(due) : "—"} />
            <Kpi label="Última visita" value={p.lastVisitAt ? dateShort(p.lastVisitAt.slice(0, 10)) : "—"} />
          </div>

          <Card>
            <div className="flex items-center justify-between"><h3 className="font-semibold">Próximos horários</h3><Button size="sm" variant="ghost" onClick={() => setSchedule(true)}><Plus className="size-4" />Agendar</Button></div>
            {!upcoming.length ? <p className="text-sm text-muted mt-2">Nada marcado.</p> : (
              <ul className="mt-3 space-y-2">
                {upcoming.map((ap) => (
                  <li key={ap.id} className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-md bg-accent text-on-accent text-center leading-tight">
                      <span className="text-[10px] uppercase">{new Date(ap.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                      <span className="text-lg font-bold">{ap.date.slice(8)}</span>
                    </span>
                    <span className="text-sm"><span className="font-semibold block">{dateShort(ap.date)} {ap.time ? `às ${ap.time}` : "· horário a definir"}</span>
                      <span className="text-muted">{{ consultation: "Consulta", return: "Retorno", personal: "Pessoal" }[ap.kind]} · {ap.durationMinutes} min · {{ to_confirm: "a confirmar", confirmed: "confirmado", done: "concluído", cancelled: "cancelado", no_show: "faltou" }[ap.status]}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between"><h3 className="font-semibold">Orçamentos</h3><Link href={`/plano?paciente=${p.id}`} className="text-sm font-semibold text-accent">+ Novo plano</Link></div>
            {!budgets.length ? <p className="text-sm text-muted mt-2">Nenhum orçamento ainda.</p> : (
              <ul className="mt-2 divide-y divide-border">
                {budgets.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{dateBR(b.presentedAt)} · <span className="font-semibold">{money(b.totalCents)}</span></span>
                    <span className="flex items-center gap-2">
                      {{ presented: <Badge tone="warning">Em aberto</Badge>, authorized: <Badge tone="success">Aprovado</Badge>, declined: <Badge>Recusado</Badge> }[b.status]}
                      <Link href={`/orcamentos/${b.id}/imprimir`} target="_blank" className="text-xs font-semibold text-accent">PDF</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between"><h3 className="font-semibold">Atendimentos</h3><Button size="sm" variant="ghost" onClick={() => setTreat(true)}><Plus className="size-4" />Registrar</Button></div>
            {!treatments.length ? <p className="text-sm text-muted mt-2">Nada aprovado ou registrado ainda.</p> : (
              <ul className="mt-2 divide-y divide-border">
                {treatments.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0"><span className="font-medium">{t.procedureName}</span><span className="text-muted"> · {dateBR(t.performedAt)}</span></span>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{money(t.priceCents)}</span>
                      {t.paymentStatus === "received" ? <Badge tone="success">Recebido</Badge> : <button type="button" onClick={() => api.treatments.update(t.id, { paymentStatus: "received" })} className="text-xs font-semibold text-accent">Marcar recebido</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold">Linha do tempo</h3>
            <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-accent" />
                  <p>{e.label}</p><p className="text-xs text-muted">{dateBR(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <div className="flex items-center justify-between"><h3 className="font-semibold">Dados</h3><Button size="sm" variant="soft" onClick={() => setEdit(true)}><Pencil className="size-3.5" />Editar</Button></div>
            <dl className="mt-3 space-y-2 text-sm">
              {([["Nascimento", p.birthDate ? `${dateBR(p.birthDate)}${a !== undefined ? ` · ${a} anos` : ""}` : null], ["CPF", p.cpf], ["Celular", p.phone], ["E-mail", p.email], ["Endereço", addr], ["Responsável", p.guardian?.name && `${p.guardian.name}${p.guardian.relationship ? ` (${p.guardian.relationship})` : ""}${p.guardian.phone ? ` · ${p.guardian.phone}` : ""}`], ["Como conheceu", p.referralSource], ["Observações", p.notes]] as [string, string | null | undefined][])
                .map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words">{v || "—"}</dd></div>)}
            </dl>
          </Card>
          <Card>
            <Toggle checked={p.recallEnabled} onChange={(v) => api.patients.update(p.id, { recallEnabled: v })} label="Lembrar de chamar de volta" hint="Aparece em Agenda › Reativar após 30 dias sem visita." />
          </Card>
        </aside>
      </div>

      {edit && <PatientForm open initial={p} onClose={() => setEdit(false)} />}
      {schedule && <AppointmentForm open onClose={() => setSchedule(false)} preset={{ patientId: p.id }} />}
      {treat && <TreatmentForm open onClose={() => setTreat(false)} patientId={p.id} />}
    </div>
  );
}
