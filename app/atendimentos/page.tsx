"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useDb, api, stalledTreatments } from "@/lib/store";
import { dateBR, money } from "@/lib/format";
import { Badge, Button, Card, Empty, Input, Kpi, PageSkeleton, Select } from "@/components/ui";
import { TreatmentForm } from "@/components/treatment-form";
import { useAction } from "@/components/toast";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Page() {
  const db = useDb();
  const run = useAction();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [allTime, setAllTime] = useState(false);
  const [clinical, setClinical] = useState<"" | "in_progress" | "done">("");
  const [pay, setPay] = useState<"" | "pending" | "received">("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(false);

  const rows = useMemo(() => {
    if (!db) return [];
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const n = q.trim().toLowerCase();
    return db.treatments
      .filter((t) => allTime || t.performedAt.startsWith(prefix) || t.clinicalStatus === "in_progress")
      .filter((t) => !clinical || t.clinicalStatus === clinical)
      .filter((t) => !pay || t.paymentStatus === pay)
      .map((t) => ({ t, p: db.patients.find((x) => x.id === t.patientId) }))
      .filter(({ t, p }) => !n || t.procedureName.toLowerCase().includes(n) || p?.fullName.toLowerCase().includes(n))
      .sort((a, z) => z.t.performedAt.localeCompare(a.t.performedAt));
  }, [db, year, month, allTime, clinical, pay, q]);

  if (!db) return <PageSkeleton />;
  const received = rows.filter((r) => r.t.paymentStatus === "received").reduce((s, r) => s + r.t.priceCents, 0);
  const pending = rows.filter((r) => r.t.paymentStatus === "pending").reduce((s, r) => s + r.t.priceCents, 0);
  const stalled = stalledTreatments(db).length;
  const inProgress = db.treatments.filter((t) => t.clinicalStatus === "in_progress").length;
  const years = Array.from(new Set([now.getFullYear(), ...db.treatments.map((t) => Number(t.performedAt.slice(0, 4)))])).sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={allTime} className="w-28">{years.map((y) => <option key={y}>{y}</option>)}</Select>
        <Select aria-label="Mês" value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={allTime} className="w-40">{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} className="size-4" />Todo o período</label>
        <div className="flex-1" />
        <Button onClick={() => setForm(true)}><Plus className="size-4" />Registrar atendimento</Button>
      </div>

      {stalled > 0 && (
        <Link href="/atendimentos/parados" className="flex items-center justify-between gap-3 rounded-lg bg-surface-warning-subtle px-4 py-3 text-sm font-medium">
          {stalled} tratamento(s) aprovado(s) parado(s) há mais de 7 dias, sem consulta marcada<span className="font-semibold">Ver →</span>
        </Link>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi tone="success" label="Recebido" value={money(received)} sub="nos atendimentos filtrados" />
        <Kpi tone="warning" label="A receber (avulsos)" value={money(pending)} sub={<>parcelas de orçamento em <Link href="/financeiro?aba=receivable" className="font-semibold text-accent">Financeiro</Link></>} />
        <Kpi label="Em andamento" value={inProgress} sub="tratamentos não concluídos" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input aria-label="Buscar" placeholder="Paciente ou procedimento" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-48" />
        <Select aria-label="Situação clínica" value={clinical} onChange={(e) => setClinical(e.target.value as typeof clinical)} className="w-48">
          <option value="">Toda situação clínica</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option>
        </Select>
        <Select aria-label="Pagamento" value={pay} onChange={(e) => setPay(e.target.value as typeof pay)} className="w-44">
          <option value="">Todo pagamento</option><option value="pending">A receber</option><option value="received">Recebido</option>
        </Select>
      </div>

      <Card className="p-0 overflow-hidden">
        {!rows.length ? (
          <Empty title="Nenhum atendimento aqui" body="Mude os filtros, registre um atendimento ou aprove um orçamento — os itens aprovados aparecem nesta lista."
            action={<Button onClick={() => setForm(true)}>Registrar atendimento</Button>} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ t, p }) => (
              <li key={t.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.procedureName}</p>
                  <p className="text-xs text-muted truncate"><Link href={`/pacientes/${t.patientId}`} className="hover:underline">{p?.fullName ?? "—"}</Link> · {dateBR(t.performedAt)}{t.budgetId ? " · do orçamento" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{money(t.priceCents)}</span>
                  {t.clinicalStatus === "done" ? <Badge tone="info">Concluído</Badge> : <Badge tone="accent">Em andamento</Badge>}
                  {t.paymentStatus === "received" ? <Badge tone="success">Recebido</Badge> : t.paymentStatus === "budget" ? <Badge tone="neutral">No orçamento</Badge> : <Badge tone="warning">A receber</Badge>}
                </div>
                <div className="flex gap-2 md:justify-end">
                  {t.clinicalStatus === "in_progress" && <Button size="sm" variant="soft" onClick={() => run(() => api.treatments.update(t.id, { clinicalStatus: "done", performedAt: new Date().toISOString().slice(0, 10) }), "Marcado como concluído.")}>Concluir</Button>}
                  {t.paymentStatus === "pending" && <Button size="sm" onClick={() => run(() => api.treatments.update(t.id, { paymentStatus: "received" }), "Pagamento registrado.")}>Recebi</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {form && <TreatmentForm open onClose={() => setForm(false)} />}
    </div>
  );
}
