"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer, MessageCircle, Check, X as XIcon, Download } from "lucide-react";
import { useDb, api } from "@/lib/store";
import { dateBR, plural, money, whatsappLink } from "@/lib/format";
import type { Budget } from "@/lib/types";
import { Badge, Button, Card, Empty, Input, Kpi, PageSkeleton, Segmented } from "@/components/ui";
import { AuthorizeDialog } from "@/components/authorize-dialog";
import { useToast } from "@/components/toast";
import { removeWithUndo, usePendingRemoval } from "@/lib/undo";

type Filter = "all" | "presented" | "authorized" | "declined";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><Budgets /></Suspense>;
}

function Budgets() {
  const db = useDb();
  const params = useSearchParams();
  const toast = useToast();
  const pending = usePendingRemoval();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [authorizing, setAuthorizing] = useState<Budget | null>(null);
  const highlight = params.get("abrir");
  const onlyPatient = params.get("paciente"); // vem do funil de vendas: orçamentos de um paciente

  useEffect(() => {
    if (highlight) document.getElementById(`b-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight, db]);

  const rows = useMemo(() => {
    if (!db) return [];
    const n = q.trim().toLowerCase();
    return db.budgets
      .filter((b) => !pending.has(b.id))
      .filter((b) => filter === "all" || b.status === filter)
      .filter((b) => !onlyPatient || b.patientId === onlyPatient)
      .map((b) => ({ b, p: db.patients.find((x) => x.id === b.patientId) }))
      .filter(({ p }) => !n || p?.fullName.toLowerCase().includes(n))
      .sort((a, z) => z.b.presentedAt.localeCompare(a.b.presentedAt));
  }, [db, filter, q, onlyPatient, pending]);

  if (!db) return <PageSkeleton />;
  const open = db.budgets.filter((b) => b.status === "presented");
  const authorized = db.budgets.filter((b) => b.status === "authorized");
  const conversion = db.budgets.length ? Math.round((authorized.length / db.budgets.length) * 100) : 0;

  const exportCsv = () => {
    const lines = [["Paciente", "Total", "Situação", "Apresentado em"], ...rows.map(({ b, p }) => [p?.fullName ?? "", (b.totalCents / 100).toFixed(2), b.status, dateBR(b.presentedAt)])];
    const blob = new Blob(["﻿" + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "orcamentos.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi tone="warning" label="Esperando resposta" value={money(open.reduce((s, b) => s + b.totalCents, 0))} sub={plural(open.length, "orçamento", "orçamentos")} />
        <Kpi tone="success" label="Aprovados" value={authorized.length} sub="viraram atendimento" />
        <Kpi label="Taxa de aprovação" value={`${conversion}%`} sub="de todos os orçamentos" />
      </div>

      {onlyPatient && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-brand-soft px-4 py-2 text-sm">
          Mostrando só os orçamentos de <strong>{db.patients.find((x) => x.id === onlyPatient)?.fullName ?? "um paciente"}</strong>.
          <Link href="/orcamentos" className="font-semibold text-brand underline">Ver todos</Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Situação" value={filter} onChange={setFilter}
          options={[{ value: "all", label: "Todos" }, { value: "presented", label: "Em aberto" }, { value: "authorized", label: "Aprovados" }, { value: "declined", label: "Recusados" }]} />
        <Input aria-label="Buscar paciente" placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-48" />
        <Button variant="secondary" size="md" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" />Planilha</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {!rows.length ? (
          <Empty title={db.budgets.length ? "Nada com esse filtro" : "Nenhum orçamento ainda"}
            body={db.budgets.length ? "Tente outra situação ou limpe a busca." : "Todo orçamento nasce de um plano de tratamento. Monte o primeiro e ele aparece aqui."}
            action={!db.budgets.length && <Link href="/plano" className="inline-flex h-11 items-center rounded-md bg-brand px-5 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover">Montar um plano</Link>} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ b, p }) => {
              const plan = db.plans.find((x) => x.id === b.planId);
              const expired = b.status === "presented" && Date.now() - new Date(b.presentedAt).getTime() > (plan?.validityDays ?? 30) * 86400000;
              const msg = `Olá, ${p?.fullName.split(" ")[0]}! Segue o seu orçamento: ${money(b.totalCents)} (${plural(plan?.items.length ?? 0, "item", "itens")}). Qualquer dúvida, é só chamar.`;
              return (
                <li key={b.id} id={`b-${b.id}`} className={`grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center ${highlight === b.id ? "bg-brand-soft" : ""}`}>
                  <div className="min-w-0">
                    <Link href={`/pacientes/${b.patientId}`} className="font-semibold hover:underline truncate block">{p?.fullName ?? "Paciente removido"}</Link>
                    <p className="text-xs text-ink-muted">{plural(plan?.items.length ?? 0, "item", "itens")} · apresentado em {dateBR(b.presentedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 md:justify-end">
                    <span className="font-bold tabular-nums">{money(b.totalCents)}</span>
                    {b.status === "authorized" && <Badge tone="success"><Check className="size-3" />Aprovado {b.authorizedItemIds.length < (plan?.items.length ?? 0) ? "em parte" : ""}</Badge>}
                    {b.status === "presented" && (expired ? <Badge tone="danger">Vencido</Badge> : <Badge tone="warning">Em aberto</Badge>)}
                    {b.status === "declined" && <Badge tone="neutral">Recusado</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link href={`/orcamentos/${b.id}/imprimir`} target="_blank" aria-label={`Imprimir orçamento de ${p?.fullName}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong/70 bg-surface-100 px-3 text-[13px] font-semibold transition-colors duration-150 hover:bg-surface-300"><Printer className="size-4" />PDF</Link>
                    {p?.phone && <a href={whatsappLink(p.phone, msg)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong/70 bg-surface-100 px-3 text-[13px] font-semibold transition-colors duration-150 hover:bg-surface-300"><MessageCircle className="size-4" />Enviar</a>}
                    {b.status === "presented" && <>
                      <Button size="sm" onClick={() => setAuthorizing(b)}>Aprovar</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeWithUndo(b.id, `Orçamento de ${p?.fullName ?? "paciente"} marcado como recusado.`, () => api.budgets.decline(b.id), toast)}><XIcon className="size-4" />Recusou</Button>
                    </>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {authorizing && <AuthorizeDialog db={db} budget={authorizing} onClose={() => setAuthorizing(null)} />}
    </div>
  );
}
