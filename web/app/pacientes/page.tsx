"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Upload, Download, Cake } from "lucide-react";
import { useDb, api, patientStatus, isBirthdayMonth } from "@/lib/store";
import { age, dateShort, todayISO } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { Avatar, Badge, Button, Card, Empty, Input, PageSkeleton, Segmented, Select, cx } from "@/components/ui";
import { PatientForm } from "@/components/patient-form";
import { useToast } from "@/components/toast";

type Bucket = "all" | "in_treatment" | "open_budget" | "seen" | "new" | "birthday";
const STATUS_BADGE = {
  in_treatment: <Badge tone="accent">Em tratamento</Badge>,
  open_budget: <Badge tone="warning">Orçamento em aberto</Badge>,
  seen: <Badge tone="success">Já atendido</Badge>,
  new: <Badge tone="neutral">Ainda não veio</Badge>,
};

export default function Page() {
  const db = useDb();
  const toast = useToast();
  const [bucket, setBucket] = useState<Bucket>("all");
  const [q, setQ] = useState("");
  const [sex, setSex] = useState("");
  const [sort, setSort] = useState<"recent" | "az">("recent");
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState(false);
  // "/pacientes?novo=1" (atalho do Início) já abre o cadastro.
  useEffect(() => { if (new URLSearchParams(window.location.search).has("novo")) setForm(true); }, []);
  const file = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    if (!db) return [];
    const n = q.trim().toLowerCase(), digits = q.replace(/\D/g, "");
    return db.patients
      .filter((p) => !!p.archived === archived)
      .filter((p) => bucket === "all" || (bucket === "birthday" ? isBirthdayMonth(p) : patientStatus(db, p) === bucket))
      .filter((p) => !sex || p.sex === sex)
      .filter((p) => !n || p.fullName.toLowerCase().includes(n) || (digits.length > 2 && ((p.phone ?? "").replace(/\D/g, "").includes(digits) || (p.cpf ?? "").replace(/\D/g, "").includes(digits))))
      .sort((a, b) => (sort === "az" ? a.fullName.localeCompare(b.fullName, "pt-BR") : b.createdAt.localeCompare(a.createdAt)));
  }, [db, bucket, q, sex, sort, archived]);

  if (!db) return <PageSkeleton />;
  const count = (b: Bucket) => db.patients.filter((p) => !p.archived).filter((p) => (b === "all" ? true : b === "birthday" ? isBirthdayMonth(p) : patientStatus(db, p) === b)).length;
  const thisMonth = db.patients.filter((p) => p.createdAt.slice(0, 7) === todayISO().slice(0, 7)).length;
  const buckets: [Bucket, string, string][] = [
    ["all", "Todos", `+${thisMonth} este mês`], ["in_treatment", "Em tratamento", ""], ["open_budget", "Com orçamento aberto", ""],
    ["seen", "Já atendidos", ""], ["new", "Ainda não vieram", ""], ["birthday", "Aniversário no mês", ""],
  ];

  const nextVisit = (p: Patient) => db.appointments.filter((a) => a.patientId === p.id && a.date >= todayISO() && a.status !== "cancelled").sort((a, b) => a.date.localeCompare(b.date))[0];

  const exportCsv = () => {
    const head = ["Nome", "Nascimento", "Sexo", "CPF", "Celular", "E-mail", "Cidade", "UF", "Origem"];
    const rows = db.patients.map((p) => [p.fullName, p.birthDate ?? "", p.sex ?? "", p.cpf ?? "", p.phone ?? "", p.email ?? "", p.address?.city ?? "", p.address?.uf ?? "", p.referralSource ?? ""]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "pacientes.csv"; a.click();
  };

  const importCsv = async (f: File) => {
    const text = await f.text();
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { toast("A planilha está vazia.", "error"); return; }
    const sep = lines[0].includes(";") ? ";" : ",";
    const cols = lines[0].split(sep).map((c) => c.replace(/"/g, "").trim().toLowerCase());
    const find = (...names: string[]) => cols.findIndex((c) => names.some((n) => c.includes(n)));
    const iName = find("nome"), iPhone = find("cel", "telefone", "fone", "whats"), iCpf = find("cpf"), iMail = find("mail"), iBirth = find("nasc");
    if (iName < 0) { toast("Não achei a coluna de nome. A primeira linha precisa ter um título “Nome”.", "error"); return; }
    const rows = lines.slice(1).map((l) => {
      const c = l.split(sep).map((x) => x.replace(/^"|"$/g, "").trim());
      const birth = iBirth >= 0 ? c[iBirth] : "";
      const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(birth) ? birth.split("/").reverse().join("-") : /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : undefined;
      return { fullName: c[iName], phone: iPhone >= 0 ? c[iPhone] || undefined : undefined, cpf: iCpf >= 0 ? c[iCpf] || undefined : undefined, email: iMail >= 0 ? c[iMail] || undefined : undefined, birthDate: iso };
    });
    try {
      const r = await api.patients.importRows(rows);
      toast(`${r.created} paciente(s) importado(s).${r.errors.length ? ` ${r.errors.length} linha(s) puladas: ${r.errors.slice(0, 3).join("; ")}` : ""}`, r.errors.length && !r.created ? "error" : "ok");
    } catch (e) { toast(e instanceof Error ? e.message : "Falha ao importar.", "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => file.current?.click()}><Upload className="size-4" />Importar planilha (CSV)</Button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        <Button variant={archived ? "soft" : "ghost"} size="sm" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? "Ver ativos" : `Arquivados (${db.patients.filter((p) => p.archived).length})`}</Button>
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!db.patients.length}><Download className="size-4" />Exportar</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="group" aria-label="Filtrar por situação">
        {buckets.map(([b, label, sub]) => (
          <button key={b} type="button" aria-pressed={bucket === b} onClick={() => setBucket(b)}
            className={cx("rounded-lg bg-surface-200 p-3 text-left shadow-sm transition border-2", bucket === b ? "border-brand" : "border-transparent hover:border-border")}>
            <span className="block text-[22px] font-bold leading-7">{count(b)}</span>
            <span className="block text-xs text-ink-muted">{label}</span>
            {sub && <span className="block text-xs font-semibold">{sub}</span>}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Buscar paciente" placeholder="Nome, telefone ou CPF" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-48" />
          <Select aria-label="Sexo" value={sex} onChange={(e) => setSex(e.target.value)} className="w-44"><option value="">Todos os sexos</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option></Select>
          <Segmented label="Ordem" value={sort} onChange={setSort} options={[{ value: "recent", label: "Recentes" }, { value: "az", label: "A–Z" }]} />
          <Button onClick={() => setForm(true)}><Plus className="size-4" />Novo paciente</Button>
        </div>
        {!list.length ? (
          <Empty title={archived ? "Nenhum paciente arquivado" : db.patients.length ? "Ninguém com esse filtro" : "Sua lista de pacientes está vazia"}
            body={db.patients.length ? "Mude a busca ou o filtro." : "Cadastre o primeiro paciente ou importe uma planilha que você já usa."}
            action={!db.patients.length && <Button onClick={() => setForm(true)}>Cadastrar paciente</Button>} />
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {list.map((p) => {
              const nv = nextVisit(p);
              const a = age(p.birthDate);
              return (
                <li key={p.id}>
                  <Link href={`/pacientes/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-300/50">
                    <Avatar name={p.fullName} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{p.fullName}</span>{isBirthdayMonth(p) && <Cake aria-label="Aniversário neste mês" className="size-4 shrink-0 text-warning" />}</span>
                      <span className="block text-xs text-ink-muted truncate">{[a !== undefined ? `${a} anos` : null, p.phone].filter(Boolean).join(" · ") || "Sem contato"}</span>
                      {nv && <span className="block text-xs text-brand font-medium">Próxima visita: {dateShort(nv.date)}{nv.time ? ` às ${nv.time}` : ""}</span>}
                    </span>
                    <span className="hidden sm:block">{STATUS_BADGE[patientStatus(db, p)]}</span>
                    <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {form && <PatientForm open onClose={() => setForm(false)} />}
    </div>
  );
}
