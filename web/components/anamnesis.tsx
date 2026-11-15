"use client";

import { ask } from "./confirm";
import { useState } from "react";
import { ClipboardList, FilePenLine, Pencil, Plus, Trash2 } from "lucide-react";
import { api, isReadOnly } from "@/lib/store";
import { ANAMNESIS_CHOICES, DEFAULT_ANAMNESIS, choiceOf, hasUnanswered } from "@/lib/catalog";
import { dateBR, todayISO, uid, plural } from "@/lib/format";
import type { AnamnesisAnswer, AnamnesisChoice, AnamnesisQuestion, AnamnesisRecord, AnamnesisTemplate, Db } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Textarea } from "./ui";
import { useAction, useToast } from "./toast";
import { removeWithUndo, usePendingRemoval } from "@/lib/undo";

const alertsOf = (r: AnamnesisRecord) => r.answers.filter((a) => a.alert && choiceOf(a) === "yes");
const choiceLabel = (c: AnamnesisChoice | undefined) => ANAMNESIS_CHOICES.find((x) => x.value === c)?.label ?? "Não respondida";

type FormTarget = { kind: "new" } | { kind: "draft"; record: AnamnesisRecord } | { kind: "revision"; record: AnamnesisRecord };

/** Anamnese na ficha do paciente: rascunhos, fichas concluídas (imutáveis, com revisões) e gestão dos modelos da clínica. */
export function Anamnesis({ db, patientId }: { db: Db; patientId: string }) {
  const run = useAction();
  const toast = useToast();
  const pending = usePendingRemoval();
  const [form, setForm] = useState<FormTarget | null>(null);
  const [manage, setManage] = useState(false);
  const records = db.anamnesisRecords
    .filter((r) => r.patientId === patientId && !pending.has(r.id))
    .sort((a, b) => b.filledOn.localeCompare(a.filledOn) || b.createdAt.localeCompare(a.createdAt));
  const templates = db.anamnesisTemplates;
  const readOnly = isReadOnly(db);
  const hasRevision = new Set(records.flatMap((r) => (r.revisionOf ? [r.revisionOf] : [])));
  const completedRevisionOf = new Set(records.flatMap((r) => (r.status === "completed" && r.revisionOf ? [r.revisionOf] : [])));
  // a ficha vigente é a concluída mais recente que nenhuma revisão concluída substituiu
  const current = records.find((r) => r.status === "completed" && !completedRevisionOf.has(r.id));
  const alerts = current ? alertsOf(current) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Anamnese</h3>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setManage(true)}><ClipboardList className="size-4" />Modelos</Button>
          <Button size="sm" variant="ghost" disabled={readOnly || !templates.length} onClick={() => setForm({ kind: "new" })}><Plus className="size-4" />Preencher</Button>
        </span>
      </div>

      {alerts.length > 0 && (
        <div role="note" className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
          <p className="font-semibold text-danger">Atenção na anamnese vigente</p>
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
          {records.map((r) => {
            const draft = r.status === "draft";
            const superseded = completedRevisionOf.has(r.id);
            return (
              <li key={r.id} className="py-2 text-sm">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md py-1">
                    <span><span className="font-semibold">{dateBR(r.filledOn)}</span><span className="text-ink-muted"> · {r.templateName}</span></span>
                    <span className="flex flex-wrap gap-1">
                      {draft && <Badge tone="warning">Rascunho</Badge>}
                      {r.revisionOf && <Badge tone="info">Revisão</Badge>}
                      {superseded && <Badge tone="neutral">Substituída</Badge>}
                      {!draft && !superseded && alertsOf(r).length > 0 && <Badge tone="danger">{plural(alertsOf(r).length, "alerta", "alertas")}</Badge>}
                    </span>
                  </summary>
                  <dl className="mt-2 space-y-2">
                    {r.answers.map((a) => (
                      <div key={a.questionId}>
                        <dt className="text-xs text-ink-muted">{a.text}</dt>
                        <dd className="break-words whitespace-pre-wrap">
                          {a.kind === "yesno"
                            ? <>{choiceOf(a) === "yes" ? <strong className={a.alert ? "text-danger" : undefined}>Sim</strong> : choiceLabel(choiceOf(a))}{a.detail ? ` — ${a.detail}` : ""}</>
                            : a.detail || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {!draft && r.completedAt && <p className="mt-2 text-xs text-ink-muted">Concluída em {dateBR(r.completedAt.slice(0, 10))}. Não pode ser alterada: para corrigir, crie uma revisão.</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {draft ? (
                      <>
                        <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setForm({ kind: "draft", record: r })}><FilePenLine className="size-3.5" />Continuar</Button>
                        <Button size="sm" variant="ghost" disabled={readOnly}
                          onClick={() => removeWithUndo(r.id, "Rascunho excluído.", () => api.anamnesis.removeRecord(r.id), toast)}>
                          <Trash2 className="size-3.5" />Excluir rascunho
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={readOnly || hasRevision.has(r.id)} onClick={() => setForm({ kind: "revision", record: r })}>
                        <FilePenLine className="size-3.5" />{hasRevision.has(r.id) ? "Revisão em andamento ou concluída" : "Criar revisão"}
                      </Button>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {form && <FillForm key={form.kind === "new" ? "new" : form.record.id + form.kind} templates={templates} patientId={patientId} target={form} onClose={() => setForm(null)} />}
      {manage && <Templates db={db} onClose={() => setManage(false)} />}
    </Card>
  );
}

const fromQuestions = (qs: AnamnesisQuestion[]): AnamnesisAnswer[] => qs.map((q) => ({ questionId: q.id, text: q.text, kind: q.kind, alert: q.alert || undefined }));

function FillForm({ templates, patientId, target, onClose }: { templates: AnamnesisTemplate[]; patientId: string; target: FormTarget; onClose: () => void }) {
  const record = target.kind === "new" ? undefined : target.record;
  const [templateId, setTemplateId] = useState(record?.templateId ?? templates[0]?.id ?? "");
  const [date, setDate] = useState(target.kind === "draft" ? target.record.filledOn : todayISO());
  const [choice, setChoice] = useState<Record<string, AnamnesisChoice | undefined>>(() => Object.fromEntries((record?.answers ?? []).map((a) => [a.questionId, choiceOf(a)])));
  const [detail, setDetail] = useState<Record<string, string>>(() => Object.fromEntries((record?.answers ?? []).map((a) => [a.questionId, a.detail ?? ""])));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "complete" | null>(null);
  const tpl = templates.find((t) => t.id === templateId);
  // rascunho e revisão usam a cópia das perguntas guardada na ficha; modelo só vale para ficha nova
  const base: AnamnesisAnswer[] = record ? record.answers : tpl ? fromQuestions(tpl.questions) : [];
  const incomplete = hasUnanswered(base.map((a) => ({ ...a, answer: choice[a.questionId] })));

  const pick = (id: string) => { setTemplateId(id); setChoice({}); setDetail({}); };

  const save = async (complete: boolean) => {
    setTried(true);
    if (!base.length || (complete && incomplete)) return;
    const answers: AnamnesisAnswer[] = base.map((a) => {
      const c = choice[a.questionId];
      const text = detail[a.questionId]?.trim();
      return {
        questionId: a.questionId, text: a.text, kind: a.kind, alert: a.alert,
        answer: a.kind === "yesno" ? c : undefined,
        yes: c === "yes" ? true : c === "no" ? false : undefined, // formato antigo, só para sim e não
        detail: text && (a.kind === "text" || c === "yes") ? text : undefined,
      };
    });
    setSaving(complete ? "complete" : "draft"); setError(null);
    try {
      await api.anamnesis.saveRecord({
        id: target.kind === "draft" ? target.record.id : undefined, patientId, templateId: record?.templateId ?? tpl?.id,
        templateName: record?.templateName ?? tpl?.name ?? "", answers, filledOn: date,
        revisionOf: target.kind === "revision" ? target.record.id : undefined, complete,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSaving(null);
    }
  };

  const title = target.kind === "revision" ? "Revisar anamnese" : target.kind === "draft" ? "Continuar rascunho" : "Preencher anamnese";
  return (
    <Modal open wide onClose={onClose} title={title}
      subtitle={target.kind === "revision" ? "A ficha original continua guardada. Esta será uma nova ficha, ligada a ela." : "Salve como rascunho para continuar depois. Ao concluir, a ficha não pode mais ser alterada."}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="soft" loading={saving === "draft"} disabled={saving === "complete"} onClick={() => void save(false)}>Salvar rascunho</Button>
        <Button loading={saving === "complete"} disabled={saving === "draft"} onClick={() => void save(true)}>Concluir ficha</Button>
      </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <ErrorNote message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!record ? (
            <Field label="Modelo">
              {(id) => <Select id={id} value={templateId} onChange={(e) => pick(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
            </Field>
          ) : <p className="self-end text-sm text-ink-muted">{record.templateName}</p>}
          <Field label="Data">{(id) => <Input id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        {tried && incomplete && <ErrorNote message="Para concluir, responda todas as perguntas de sim ou não. Dá para salvar como rascunho sem responder." />}
        {base.map((q) => q.kind === "yesno" ? (
          <fieldset key={q.questionId} className="space-y-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{q.text}</legend>
            <div className="flex flex-wrap gap-x-4" role="radiogroup" aria-label={q.text}>
              {ANAMNESIS_CHOICES.map(({ value, label }) => (
                <label key={value} className="inline-flex min-h-10 items-center gap-2 text-sm">
                  <input type="radio" name={`q-${q.questionId}`} checked={choice[q.questionId] === value} onChange={() => setChoice((s) => ({ ...s, [q.questionId]: value }))} className="size-4 accent-brand" />{label}
                </label>
              ))}
            </div>
            {choice[q.questionId] === "yes" && <Input aria-label={`Detalhes: ${q.text}`} value={detail[q.questionId] ?? ""} maxLength={500} onChange={(e) => setDetail((s) => ({ ...s, [q.questionId]: e.target.value }))} placeholder="Quais? Detalhes (opcional)" />}
          </fieldset>
        ) : (
          <Field key={q.questionId} label={q.text}>{(id) => <Textarea id={id} rows={3} maxLength={2000} value={detail[q.questionId] ?? ""} onChange={(e) => setDetail((s) => ({ ...s, [q.questionId]: e.target.value }))} />}</Field>
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
                  onClick={async () => { if (await ask({ title: `Excluir o modelo "${t.name}"?`, body: "As fichas já preenchidas continuam guardadas.", confirmLabel: "Excluir", danger: true })) void run(() => api.anamnesis.removeTemplate(t.id), "Modelo excluído."); }}>
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
