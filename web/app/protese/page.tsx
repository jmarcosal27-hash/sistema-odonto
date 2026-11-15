"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { api, useDb, useRemoteState } from "@/lib/store";
import { todayISO } from "@/lib/format";
import { STAGES, isOverdue, kindName, stageName } from "@/lib/prosthesis";
import type { ProsthesisJob, ProsthesisStage } from "@/lib/types";
import { Button, Card, Empty, Input, Select, Skeleton } from "@/components/ui";
import { ProsthesisBoard } from "@/components/prosthesis-board";
import { CreateJobDialog, JobDialog, LabsDialog } from "@/components/prosthesis-dialogs";
import { useAction } from "@/components/toast";

export default function Page() {
  const db = useDb();
  const remote = useRemoteState();
  const run = useAction();
  const [q, setQ] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyReturn, setOnlyReturn] = useState(false);
  const [professional, setProfessional] = useState("");
  const [label, setLabel] = useState("");
  const [lab, setLab] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [labs, setLabs] = useState(false);
  const [announce, setAnnounce] = useState("");
  const today = todayISO();

  const professionals = useMemo(() => [...new Set((db?.prosthesisJobs ?? []).map((j) => j.professional))].sort(), [db]);
  const labels = useMemo(() => [...new Set((db?.prosthesisJobs ?? []).map((j) => j.label).filter((l): l is string => !!l))].sort(), [db]);

  const byStage = useMemo(() => {
    const map = new Map<ProsthesisStage, ProsthesisJob[]>();
    if (!db) return map;
    const n = q.trim().toLowerCase();
    const nameOf = (id: string) => db.patients.find((p) => p.id === id)?.fullName ?? "";
    const labOf = (id?: string) => db.laboratories.find((l) => l.id === id)?.name ?? "";
    for (const j of [...db.prosthesisJobs].sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.createdAt.localeCompare(a.createdAt))) {
      if (onlyLate && !isOverdue(j, today)) continue;
      if (onlyReturn && !j.isReturn) continue;
      if (professional && j.professional !== professional) continue;
      if (label && j.label !== label) continue;
      if (lab && j.laboratoryId !== lab) continue;
      if (n && ![nameOf(j.patientId), j.description, kindName(j.kind), labOf(j.laboratoryId)].some((t) => t.toLowerCase().includes(n))) continue;
      map.set(j.stage, [...(map.get(j.stage) ?? []), j]);
    }
    return map;
  }, [db, q, onlyLate, onlyReturn, professional, label, lab, today]);

  if (!db) return <Skeletons />;

  // Só o dono exclui (o banco também exige); na demonstração quem usa é o dono.
  const isOwner = !remote || (remote.status === "ready" && remote.session.role === "owner");
  const patientName = (id: string) => db.patients.find((p) => p.id === id)?.fullName ?? "Paciente removido";
  const labName = (id?: string) => db.laboratories.find((l) => l.id === id)?.name;
  const shown = [...byStage.values()].reduce((s, l) => s + l.length, 0);
  const lateTotal = db.prosthesisJobs.filter((j) => isOverdue(j, today)).length;
  const open = openId ? db.prosthesisJobs.find((j) => j.id === openId) : undefined;
  const filtered = !!(q || onlyLate || onlyReturn || professional || label || lab);

  const move = async (j: ProsthesisJob, stage: ProsthesisStage) => {
    if (j.stage === stage) return;
    const ok = await run(async () => { await api.prosthesis.moveJob(j.id, stage); return true; });
    // O sufixo invisível força o leitor de tela a reler uma frase igual.
    if (ok) setAnnounce(`Serviço de ${patientName(j.patientId)} movido para ${stageName(stage)}.${announce.endsWith("​") ? "" : "​"}`);
  };

  const check = "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border-2 border-border-strong px-3 text-sm font-semibold";
  return (
    <div className="min-w-0 space-y-4">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Buscar por paciente, tratamento ou laboratório" placeholder="Buscar paciente, tratamento ou laboratório" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-48 flex-1" />
        <Button variant="secondary" onClick={() => setLabs(true)}><FlaskConical aria-hidden className="size-4" />Laboratórios</Button>
        <Button onClick={() => setCreating(true)}><Plus aria-hidden className="size-4" />Criar serviço</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className={check}>
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
          Serviços atrasados{lateTotal > 0 && <span className="text-danger">({lateTotal})</span>}
        </label>
        <label className={check}>
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={onlyReturn} onChange={(e) => setOnlyReturn(e.target.checked)} />
          Serviços com retorno
        </label>
        <Select aria-label="Filtrar por profissional" value={professional} onChange={(e) => setProfessional(e.target.value)} className="w-auto">
          <option value="">Todos os profissionais</option>{professionals.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select aria-label="Filtrar por rótulo" value={label} onChange={(e) => setLabel(e.target.value)} className="w-auto">
          <option value="">Todos os rótulos</option>{labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        <Select aria-label="Filtrar por laboratório" value={lab} onChange={(e) => setLab(e.target.value)} className="w-auto">
          <option value="">Todos os laboratórios</option>{db.laboratories.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {shown === 0 && (
        <Card>
          <Empty title={filtered ? "Nada com esse filtro" : "Nenhum serviço de prótese ainda"}
            body={filtered ? "Tente outros filtros ou limpe a busca." : "Crie o primeiro serviço para acompanhar o trabalho do laboratório, da prova à instalação."}
            action={!filtered && <Button onClick={() => setCreating(true)}><Plus aria-hidden className="size-4" />Criar serviço</Button>} />
        </Card>
      )}
      <p className="text-xs text-ink-muted">Arraste os cartões entre as colunas, use o campo “Mover para” ou, com o cartão focado, Shift + seta para a esquerda ou direita. Atrasado: em Envio ou Laboratório com a previsão de retorno vencida.</p>
      <ProsthesisBoard byStage={byStage} today={today} patientName={patientName} labName={labName} onOpen={(j) => setOpenId(j.id)} onMove={(j, s) => void move(j, s)} />

      {open && <JobDialog db={db} job={open} canDelete={isOwner} onClose={() => setOpenId(null)} onMove={(j, s) => void move(j, s)} />}
      {creating && <CreateJobDialog db={db} onClose={() => setCreating(false)} onCreated={() => setAnnounce(`Serviço criado em ${STAGES[0].name}.`)} />}
      {labs && <LabsDialog db={db} canDelete={isOwner} onClose={() => setLabs(false)} />}
    </div>
  );
}

function Skeletons() {
  return (
    <div role="status" aria-label="Carregando o controle de prótese" className="space-y-4">
      <Skeleton className="h-11" />
      <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 w-72 shrink-0" />)}</div>
    </div>
  );
}
