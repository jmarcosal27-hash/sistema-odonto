"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { api, isReadOnly } from "@/lib/store";
import { DEFAULT_ANAMNESIS } from "@/lib/catalog";
import { dateBR, todayISO, uid } from "@/lib/format";
import type { AnamnesisAnswer, AnamnesisQuestion, AnamnesisRecord, AnamnesisTemplate, Db } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Textarea } from "./ui";
import { useAction } from "./toast";

const alertsOf = (r: AnamnesisRecord) => r.answers.filter((a) => a.alert && a.yes);

/** Anamnese na ficha do paciente: fichas preenchidas + gestão dos modelos da clínica. */
export function Anamnesis({ db, patientId }: { db: Db; patientId: string }) {
  const run = useAction();
  const [fill, setFill] = useState(false);
  const [manage, setManage] = useState(false);
  const records = db.anamnesisRecords
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => b.filledOn.localeCompare(a.filledOn) || b.createdAt.localeCompare(a.createdAt));
  const templates = db.anamnesisTemplates;
  const readOnly = isReadOnly(db);
  const alerts = records[0] ? alertsOf(records[0]) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Anamnese</h3>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setManage(true)}><ClipboardList className="size-4" />Modelos</Button>
          <Button size="sm" variant="ghost" disabled={readOnly || !templates.length} onClick={() => setFill(true)}><Plus className="size-4" />Preencher</Button>
        </span>
      </div>

      {alerts.length > 0 && (
        <div role="note" className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
          <p className="font-semibold text-danger">Atenção na última anamnese</p>
          <ul className="mt-1 list-disc pl-5">{alerts.map((a) => <li key={a.questionId}>{a.text}{a.detail ? ` — ${a.detail}` : ""}</li>)}</ul>
        </div>
      )}

      {!records.length ? (
        !templates.length ? (
          <Empty title="Nenhum modelo de anamnese" body="Comece com o modelo padrão (dá para editar as perguntas) ou crie o seu."
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button disabled={readOnly} onClick={() => void run(() => api.anamnesis.saveTemplate({ name: DEFAULT_ANAMNESIS.name, questions: DEFAULT_ANAMNESIS.questions.map((q) => ({ ...q, id: uid() })) }), "Modelo criado.")}>Usar modelo padrão</Button>
              <Button variant="soft" onClick={() => setManage(true)}>Criar do zero</Button>
            </div>} />
        ) : <p className="text-sm text-ink-muted mt-2">Nenhuma anamnese preenchida para este paciente.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {records.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md py-1">
                  <span><span className="font-semibold">{dateBR(r.filledOn)}</span><span className="text-ink-muted"> · {r.templateName}</span></span>
                  {alertsOf(r).length > 0 && <Badge tone="danger">{alertsOf(r).length} alerta(s)</Badge>}
                </summary>
                <dl className="mt-2 space-y-2">
                  {r.answers.map((a) => (
                    <div key={a.questionId}>
                      <dt className="text-xs text-ink-muted">{a.text}</dt>
                      <dd className="break-words whitespace-pre-wrap">
                        {a.kind === "yesno" ? <>{a.yes ? <strong className={a.alert ? "text-danger" : undefined}>Sim</strong> : "Não"}{a.detail ? ` — ${a.detail}` : ""}</> : a.detail || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button size="sm" variant="ghost" className="mt-2" disabled={readOnly}
                  onClick={() => { if (window.confirm("Excluir esta ficha de anamnese? Não dá para desfazer.")) void run(() => api.anamnesis.removeRecord(r.id), "Ficha excluída."); }}>
                  <Trash2 className="size-3.5" />Excluir ficha
                </Button>
              </details>
            </li>
          ))}
        </ul>
      )}

      {fill && <FillForm templates={templates} patientId={patientId} onClose={() => setFill(false)} />}
      {manage && <Templates db={db} onClose={() => setManage(false)} />}
    </Card>
  );
}

function FillForm({ templates, patientId, onClose }: { templates: AnamnesisTemplate[]; patientId: string; onClose: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [yes, setYes] = useState<Record<string, boolean | undefined>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tpl = templates.find((t) => t.id === templateId);

  const pick = (id: string) => { setTemplateId(id); setYes({}); setDetail({}); };
  const missing = tpl?.questions.some((q) => q.kind === "yesno" && yes[q.id] === undefined);

  const save = async () => {
    setTried(true);
    if (!tpl || missing) return;
    const answers: AnamnesisAnswer[] = tpl.questions.map((q) => ({
      questionId: q.id, text: q.text, kind: q.kind, alert: q.alert || undefined,
      yes: q.kind === "yesno" ? yes[q.id] : undefined, detail: detail[q.id]?.trim() || undefined,
    }));
    setSaving(true); setError(null);
    try {
      await api.anamnesis.saveRecord({ patientId, templateId: tpl.id, templateName: tpl.name, answers, filledOn: date });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSaving(false);
    }
  };

  return (
    <Modal open wide onClose={onClose} title="Preencher anamnese" subtitle="Responda todas as perguntas de sim ou não."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar ficha</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Modelo">
            {(id) => <Select id={id} value={templateId} onChange={(e) => pick(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
          </Field>
          <Field label="Data">{(id) => <Input id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        {tried && missing && <ErrorNote message="Responda sim ou não em todas as perguntas marcadas." />}
        {tpl?.questions.map((q) => q.kind === "yesno" ? (
          <fieldset key={q.id} className="space-y-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{q.text}</legend>
            <div className="flex gap-4" role="radiogroup" aria-label={q.text}>
              {([["Sim", true], ["Não", false]] as const).map(([label, v]) => (
                <label key={label} className="inline-flex min-h-10 items-center gap-2 text-sm">
                  <input type="radio" name={`q-${q.id}`} checked={yes[q.id] === v} onChange={() => setYes((s) => ({ ...s, [q.id]: v }))} className="size-4 accent-brand" />{label}
                </label>
              ))}
            </div>
            {yes[q.id] === true && <Input aria-label={`Detalhes: ${q.text}`} value={detail[q.id] ?? ""} maxLength={500} onChange={(e) => setDetail((s) => ({ ...s, [q.id]: e.target.value }))} placeholder="Quais? Detalhes (opcional)" />}
          </fieldset>
        ) : (
          <Field key={q.id} label={q.text}>{(id) => <Textarea id={id} rows={3} maxLength={2000} value={detail[q.id] ?? ""} onChange={(e) => setDetail((s) => ({ ...s, [q.id]: e.target.value }))} />}</Field>
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Lista, cria, edita e exclui modelos. Alternar entre lista e editor dentro do mesmo modal. */
function Templates({ db, onClose }: { db: Db; onClose: () => void }) {
  const run = useAction();
  const [editing, setEditing] = useState<AnamnesisTemplate | "new" | null>(null);
  const readOnly = isReadOnly(db);

  if (editing) return <TemplateEditor template={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />;
  return (
    <Modal open onClose={onClose} title="Modelos de anamnese" subtitle="Valem para toda a clínica. Fichas já preenchidas não mudam."
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button disabled={readOnly} onClick={() => setEditing("new")}><Plus className="size-4" />Novo modelo</Button></>}>
      {!db.anamnesisTemplates.length ? (
        <Empty title="Nenhum modelo ainda" body="Crie o primeiro com o botão abaixo." />
      ) : (
        <ul className="divide-y divide-border">
          {db.anamnesisTemplates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><span className="font-semibold">{t.name}</span><span className="text-ink-muted"> · {t.questions.length} perguntas</span></span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing(t)} aria-label={`Editar modelo ${t.name}`}><Pencil className="size-3.5" />Editar</Button>
                <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir modelo ${t.name}`}
                  onClick={() => { if (window.confirm(`Excluir o modelo "${t.name}"? As fichas já preenchidas continuam guardadas.`)) void run(() => api.anamnesis.removeTemplate(t.id), "Modelo excluído."); }}>
                  <Trash2 className="size-3.5" />Excluir
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function TemplateEditor({ template, onClose }: { template?: AnamnesisTemplate; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [questions, setQuestions] = useState<AnamnesisQuestion[]>(template?.questions ?? [{ id: uid(), text: "", kind: "yesno" }]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (id: string, patch: Partial<AnamnesisQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const invalid = name.trim().length < 2 || !questions.some((q) => q.text.trim());

  const save = async () => {
    setTried(true);
    if (invalid) return;
    setSaving(true); setError(null);
    try {
      await api.anamnesis.saveTemplate({ id: template?.id, name, questions });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSaving(false);
    }
  };

  return (
    <Modal open wide onClose={onClose} title={template ? "Editar modelo" : "Novo modelo de anamnese"}
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button loading={saving} onClick={save}>Salvar modelo</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <Field label="Nome do modelo" error={tried && name.trim().length < 2 ? "Dê um nome ao modelo." : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} value={name} maxLength={120} invalid={tried && name.trim().length < 2} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Anamnese infantil" />}
        </Field>
        {tried && !questions.some((q) => q.text.trim()) && <ErrorNote message="Adicione pelo menos uma pergunta." />}
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="space-y-2 rounded-md border border-border p-3">
              <Field label={`Pergunta ${i + 1}`}>{(id) => <Input id={id} value={q.text} maxLength={300} onChange={(e) => set(q.id, { text: e.target.value })} />}</Field>
              <div className="flex flex-wrap items-center gap-3">
                <Select aria-label={`Tipo da pergunta ${i + 1}`} className="w-auto" value={q.kind} onChange={(e) => set(q.id, { kind: e.target.value as AnamnesisQuestion["kind"] })}>
                  <option value="yesno">Sim ou não</option>
                  <option value="text">Texto livre</option>
                </Select>
                {q.kind === "yesno" && (
                  <label className="inline-flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!q.alert} onChange={(e) => set(q.id, { alert: e.target.checked })} className="size-4 accent-brand" />Sim vira alerta
                  </label>
                )}
                <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-label={`Remover pergunta ${i + 1}`} onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}><Trash2 className="size-3.5" />Remover</Button>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="soft" onClick={() => setQuestions((qs) => [...qs, { id: uid(), text: "", kind: "yesno" }])}><Plus className="size-4" />Adicionar pergunta</Button>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
