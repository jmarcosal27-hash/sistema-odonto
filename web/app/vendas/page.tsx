"use client";

import { useMemo, useState } from "react";
import { Plus, Settings2, Target } from "lucide-react";
import { api, useDb, useRemoteState } from "@/lib/store";
import { addDays, money, todayISO } from "@/lib/format";
import { goalProgress, sortedStages } from "@/lib/sales";
import type { Opportunity } from "@/lib/types";
import { Button, Card, Empty, Input, Select, Skeleton } from "@/components/ui";
import { SalesBoard } from "@/components/sales-board";
import { CreateOpportunityDialog, GoalDialog, OpportunityDialog, StagesDialog } from "@/components/sales-dialogs";
import { useAction } from "@/components/toast";

type Period = "all" | "month" | "30" | "90";

export default function Page() {
  const db = useDb();
  const remote = useRemoteState();
  const run = useAction();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [announce, setAnnounce] = useState("");

  const stages = useMemo(() => (db ? sortedStages(db) : []), [db]);
  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    if (!db) return map;
    const n = q.trim().toLowerCase();
    const since = period === "all" ? "" : period === "month" ? todayISO().slice(0, 8) + "01" : addDays(todayISO(), period === "30" ? -30 : -90);
    for (const o of [...db.opportunities].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (since && o.createdAt.slice(0, 10) < since) continue;
      if (n && !(db.patients.find((p) => p.id === o.patientId)?.fullName.toLowerCase().includes(n))) continue;
      map.set(o.stageId, [...(map.get(o.stageId) ?? []), o]);
    }
    return map;
  }, [db, q, period]);

  if (!db) return <VendasSkeleton />;

  // Só o dono muda etapas e meta (o banco também exige); na demonstração quem usa é o dono.
  const canManage = !remote || (remote.status === "ready" && remote.session.role === "owner");
  const patientName = (id: string) => db.patients.find((p) => p.id === id)?.fullName ?? "Paciente removido";
  const goal = goalProgress(db);
  const pct = goal.goalCents ? Math.min(100, Math.round((goal.soldCents / goal.goalCents) * 100)) : 0;
  const shown = [...byStage.values()].reduce((s, l) => s + l.length, 0);
  const open = openId ? db.opportunities.find((o) => o.id === openId) : undefined;
  const noStages = stages.length === 0;

  const move = async (o: Opportunity, stageId: string) => {
    const to = stages.find((s) => s.id === stageId);
    if (!to || o.stageId === stageId) return;
    const ok = await run(async () => { await api.sales.moveOpportunity(o.id, stageId); return true; });
    // Texto muda a cada movimento (o sufixo invisível força o leitor de tela a reler uma frase igual).
    if (ok) setAnnounce(`${o.title}, ${patientName(o.patientId)}, movida para ${to.name}.${announce.endsWith("​") ? "" : "​"}`);
  };

  return (
    <div className="min-w-0 space-y-4">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <Card as="section" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Target aria-hidden className="size-5 text-brand" />Meta de vendas do mês</h2>
          {canManage && <Button variant="secondary" size="md" onClick={() => setGoalOpen(true)}>{goal.goalCents ? "Editar meta" : "Definir meta"}</Button>}
        </div>
        {goal.goalCents ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Objetivo" value={money(goal.goalCents)} />
              <Stat label="Vendido" value={money(goal.soldCents)} sub={`${pct}% da meta`} />
              <Stat label="Falta vender" value={money(goal.missingCents)} sub={goal.missingCents ? undefined : "Meta batida"} />
              <Stat label="Por dia útil" value={money(goal.perBusinessDayCents)} sub={`${goal.businessDaysLeft} dias úteis`} />
              <Stat label="Dias restantes" value={String(goal.daysLeft)} sub="contando hoje" />
            </div>
            <div role="progressbar" aria-label="Progresso da meta do mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-pill bg-surface-300">
              <div className="h-full rounded-pill bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            {canManage ? "Defina quanto a clínica quer vender neste mês para ver quanto falta por dia útil." : "A meta do mês ainda não foi definida pelo dono da clínica."}
          </p>
        )}
        <p className="text-xs text-ink-muted">Vendido = orçamentos aprovados no mês (valor aprovado, já com desconto) + oportunidades ganhas sem orçamento. Dias úteis: segunda a sexta, sem feriados.</p>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Buscar paciente" placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-48 flex-1" />
        <Select aria-label="Período de criação" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="w-auto">
          <option value="all">Todo o período</option>
          <option value="month">Criadas neste mês</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </Select>
        {canManage && <Button variant="secondary" onClick={() => setManaging(true)}><Settings2 aria-hidden className="size-4" />Etapas</Button>}
        <Button onClick={() => setCreating(true)}><Plus aria-hidden className="size-4" />Criar oportunidade</Button>
      </div>

      {noStages ? (
        <Card><Empty title="O funil de vendas ainda não está ativo" body="As etapas do funil não foram encontradas. Se a atualização do banco de dados (vendas) acabou de ser aplicada, recarregue a página." /></Card>
      ) : (
        <>
          {shown === 0 && (
            <Card>
              <Empty title={db.opportunities.length ? "Nada com esse filtro" : "Nenhuma oportunidade ainda"}
                body={db.opportunities.length ? "Tente outro período ou limpe a busca." : "Cada orçamento criado vira uma oportunidade em Em aberto. Você também pode criar uma manualmente."}
                action={!db.opportunities.length && <Button onClick={() => setCreating(true)}><Plus aria-hidden className="size-4" />Criar oportunidade</Button>} />
            </Card>
          )}
          <p className="text-xs text-ink-muted">Arraste os cartões entre as colunas, use o campo “Mover para” ou, com o cartão focado, Shift + seta para a esquerda ou direita.</p>
          <SalesBoard stages={stages} byStage={byStage} patientName={patientName} onOpen={(o) => setOpenId(o.id)} onMove={(o, id) => void move(o, id)} onManageStages={canManage ? () => setManaging(true) : undefined} />
        </>
      )}

      {open && <OpportunityDialog db={db} opp={open} onClose={() => setOpenId(null)} onMove={(o, id) => void move(o, id)} />}
      {creating && <CreateOpportunityDialog db={db} onClose={() => setCreating(false)} onCreated={() => setAnnounce("Oportunidade criada em Em aberto.")} />}
      {managing && <StagesDialog db={db} onClose={() => setManaging(false)} />}
      {goalOpen && <GoalDialog month={goal.month} current={goal.goalCents} onClose={() => setGoalOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-100 p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="truncate text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

function VendasSkeleton() {
  return (
    <div role="status" aria-label="Carregando o funil de vendas" className="space-y-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-11" />
      <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-72 shrink-0" />)}</div>
    </div>
  );
}
