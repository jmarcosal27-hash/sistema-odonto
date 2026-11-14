"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, MessageCircle } from "lucide-react";
import { useDb, stalledTreatments } from "@/lib/store";
import { dateBR, money, whatsappLink } from "@/lib/format";
import { Avatar, Button, Card, Empty, PageSkeleton } from "@/components/ui";
import { AppointmentForm } from "@/components/appointment-form";

export default function Page() {
  const db = useDb();
  const [booking, setBooking] = useState<string | null>(null);
  if (!db) return <PageSkeleton />;
  const list = stalledTreatments(db);
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div className="space-y-4">
      <Link href="/atendimentos" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="size-4" />Atendimentos</Link>
      <div>
        <h2 className="text-lg font-bold">Tratamentos parados</h2>
        <p className="text-sm text-muted">Orçamentos aprovados há mais de 7 dias, ainda em andamento e sem nenhuma consulta marcada. É dinheiro aprovado que não está virando atendimento.</p>
      </div>
      <Card className="p-0 overflow-hidden">
        {!list.length ? <Empty title="Nada parado" body="Todo tratamento aprovado tem consulta marcada ou já foi concluído." /> : (
          <ul className="divide-y divide-border">
            {list.map((b) => {
              const p = db.patients.find((x) => x.id === b.patientId);
              const pending = db.treatments.filter((t) => t.budgetId === b.id && t.clinicalStatus === "in_progress");
              if (!p) return null;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={p.fullName} />
                  <div className="flex-1 min-w-48">
                    <Link href={`/pacientes/${p.id}`} className="font-semibold hover:underline">{p.fullName}</Link>
                    <p className="text-xs text-muted">Aprovado em {dateBR(b.authorizedAt)} · há {days(b.authorizedAt!)} dias · {pending.length} item(ns) pendente(s): {pending.map((t) => t.procedureName).join(", ")}</p>
                  </div>
                  <span className="font-bold tabular-nums">{money(b.totalCents)}</span>
                  {p.phone && <a href={whatsappLink(p.phone, `Olá, ${p.fullName.split(" ")[0]}! Vamos marcar a continuação do seu tratamento? Tenho horários nesta semana.`)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-success-subtle px-3 text-xs font-semibold"><MessageCircle className="size-4" />Chamar</a>}
                  <Button size="sm" onClick={() => setBooking(p.id)}><CalendarPlus className="size-4" />Agendar</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {booking && <AppointmentForm open onClose={() => setBooking(null)} preset={{ patientId: booking }} />}
    </div>
  );
}
