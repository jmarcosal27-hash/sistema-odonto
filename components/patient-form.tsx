"use client";

import { useState } from "react";
import type { Patient } from "@/lib/types";
import { api } from "@/lib/store";
import { isValidCpf, maskCep, maskCpf, maskPhone } from "@/lib/format";
import { REFERRAL_SOURCES } from "@/lib/catalog";
import { Modal, Button, Field, Input, Select, Textarea, Segmented, ErrorNote } from "./ui";
import { useAction } from "./toast";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export function PatientForm({ open, onClose, initial, onSaved }: {
  open: boolean; onClose: () => void; initial?: Patient | { fullName: string }; onSaved?: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<Patient>>(() => ({ ...initial }));
  const [showGuardian, setShowGuardian] = useState(!!(initial as Patient | undefined)?.guardian);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const run = useAction();
  const editing = initial && "id" in initial;
  const set = (patch: Partial<Patient>) => setF((x) => ({ ...x, ...patch }));
  const setAddr = (patch: Partial<NonNullable<Patient["address"]>>) => setF((x) => ({ ...x, address: { ...x.address, ...patch } }));

  const lookupCep = async (cep: string) => {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (!j.erro) setAddr({ street: j.logradouro, neighborhood: j.bairro, city: j.localidade, uf: j.uf });
    } catch { /* sem rede: preenchimento manual */ }
    setCepLoading(false);
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.fullName?.trim()) e.fullName = "Informe o nome.";
    if (f.cpf && !isValidCpf(f.cpf)) e.cpf = "CPF inválido.";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "E-mail inválido.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setFormError(null);
    const data = { ...f, fullName: f.fullName!.trim(), guardian: showGuardian ? f.guardian : undefined };
    try {
      if (editing) {
        await api.patients.update((initial as Patient).id, data);
        onSaved?.((initial as Patient).id);
      } else {
        const id = await run(() => api.patients.create(data as Patient), "Paciente cadastrado.");
        if (id) onSaved?.(id); else { setSaving(false); return; }
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? "Editar paciente" : "Novo paciente"} subtitle="Só o nome é obrigatório. O resto pode ser completado depois."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving}>{editing ? "Salvar alterações" : "Cadastrar"}</Button></>}>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <ErrorNote message={formError} />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted mb-2 sm:col-span-2">Identificação</legend>
          <Field label="Nome completo" error={errors.fullName} className="sm:col-span-2">
            {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.fullName} value={f.fullName ?? ""} onChange={(e) => set({ fullName: e.target.value })} autoComplete="off" />}
          </Field>
          <Field label="Data de nascimento">{(id) => <Input id={id} type="date" value={f.birthDate ?? ""} onChange={(e) => set({ birthDate: e.target.value || undefined })} />}</Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Sexo</span>
            <Segmented label="Sexo" size="sm" value={f.sex ?? ("" as never)} onChange={(v) => set({ sex: v })}
              options={[{ value: "female", label: "Feminino" }, { value: "male", label: "Masculino" }, { value: "other", label: "Outro" }]} />
          </div>
          <Field label="CPF" error={errors.cpf}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" invalid={!!errors.cpf} value={f.cpf ?? ""} onChange={(e) => set({ cpf: maskCpf(e.target.value) || undefined })} placeholder="000.000.000-00" />}
          </Field>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Contato</legend>
          <Field label="Celular (WhatsApp)">{(id) => <Input id={id} type="tel" inputMode="tel" value={f.phone ?? ""} onChange={(e) => set({ phone: maskPhone(e.target.value) || undefined })} placeholder="(00) 00000-0000" />}</Field>
          <Field label="E-mail" error={errors.email}>{(id, d) => <Input id={id} aria-describedby={d} type="email" invalid={!!errors.email} value={f.email ?? ""} onChange={(e) => set({ email: e.target.value || undefined })} />}</Field>
          {!showGuardian
            ? <button type="button" onClick={() => setShowGuardian(true)} className="text-sm font-semibold text-accent text-left sm:col-span-2">+ Responsável (para menores)</button>
            : <div className="grid gap-3 sm:grid-cols-3 sm:col-span-2 rounded-md bg-surface-sidebar p-3">
                <Field label="Nome do responsável">{(id) => <Input id={id} value={f.guardian?.name ?? ""} onChange={(e) => set({ guardian: { ...f.guardian, name: e.target.value } })} />}</Field>
                <Field label="Parentesco">{(id) => <Input id={id} value={f.guardian?.relationship ?? ""} onChange={(e) => set({ guardian: { name: f.guardian?.name ?? "", ...f.guardian, relationship: e.target.value } })} />}</Field>
                <Field label="Telefone">{(id) => <Input id={id} type="tel" value={f.guardian?.phone ?? ""} onChange={(e) => set({ guardian: { name: f.guardian?.name ?? "", ...f.guardian, phone: maskPhone(e.target.value) } })} />}</Field>
              </div>}
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-6">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Endereço</legend>
          <Field label="CEP" hint={cepLoading ? "Buscando endereço…" : undefined} className="sm:col-span-2">
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={f.address?.cep ?? ""} onChange={(e) => { const v = maskCep(e.target.value); setAddr({ cep: v }); lookupCep(v); }} placeholder="00000-000" />}
          </Field>
          <Field label="Rua" className="sm:col-span-4">{(id) => <Input id={id} value={f.address?.street ?? ""} onChange={(e) => setAddr({ street: e.target.value })} />}</Field>
          <Field label="Número" className="sm:col-span-2">{(id) => <Input id={id} value={f.address?.number ?? ""} onChange={(e) => setAddr({ number: e.target.value })} />}</Field>
          <Field label="Complemento" className="sm:col-span-4">{(id) => <Input id={id} value={f.address?.complement ?? ""} onChange={(e) => setAddr({ complement: e.target.value })} />}</Field>
          <Field label="Bairro" className="sm:col-span-2">{(id) => <Input id={id} value={f.address?.neighborhood ?? ""} onChange={(e) => setAddr({ neighborhood: e.target.value })} />}</Field>
          <Field label="Cidade" className="sm:col-span-3">{(id) => <Input id={id} value={f.address?.city ?? ""} onChange={(e) => setAddr({ city: e.target.value })} />}</Field>
          <Field label="UF" className="sm:col-span-1">{(id) => <Select id={id} value={f.address?.uf ?? ""} onChange={(e) => setAddr({ uf: e.target.value })}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>}</Field>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Outros</legend>
          <Field label="Como conheceu você">{(id) => <Select id={id} value={f.referralSource ?? ""} onChange={(e) => set({ referralSource: e.target.value || undefined })}><option value="">—</option>{REFERRAL_SOURCES.map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
          <Field label="Observações" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Alergias, preferências de horário…" />}</Field>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
