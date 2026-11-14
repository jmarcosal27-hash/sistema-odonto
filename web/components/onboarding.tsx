"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Field, Input, Segmented, cx } from "./ui";
import { api, useDb } from "@/lib/store";
import { SPECIALTIES } from "@/lib/catalog";
import type { Profile } from "@/lib/types";

const COLORS = ["#6d4fd8", "#0f766e", "#8a5a00", "#b42318", "#1f1b2e"];

export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Partial<Profile> | null>(null);
  if (!db) return null;
  const p = { ...db.profile, ...draft };
  const set = (patch: Partial<Profile>) => setDraft({ ...draft, ...patch });

  const steps = [
    {
      title: "Quais especialidades você atende?",
      body: (
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map((s) => {
            const on = p.activeSpecialtyIds.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on}
                onClick={() => set({ activeSpecialtyIds: on ? p.activeSpecialtyIds.filter((x) => x !== s.id) : [...p.activeSpecialtyIds, s.id] })}
                className={cx("rounded-pill px-3 h-8 text-sm border", on ? "bg-brand text-on-brand border-brand" : "border-border-strong")}>
                {s.name}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "Como seu nome aparece no orçamento?",
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome profissional">{(id) => <Input id={id} value={p.professionalName ?? ""} onChange={(e) => set({ professionalName: e.target.value })} placeholder="Ex.: Dra. Camila Rocha" />}</Field>
          <Field label="CRO (opcional)">{(id) => <Input id={id} value={p.cro ?? ""} onChange={(e) => set({ cro: e.target.value })} placeholder="UF 00000" />}</Field>
        </div>
      ),
    },
    {
      title: "Onde você atende?",
      body: (
        <Segmented label="Onde você atende" value={p.workMode} onChange={(v) => set({ workMode: v })}
          options={[{ value: "solo", label: "Consultório próprio, sozinho(a)" }, { value: "in_clinic", label: "Atendo em clínica de terceiros" }, { value: "owns_clinic", label: "Tenho uma clínica com equipe" }]} />
      ),
    },
    {
      title: "Escolha a cor dos seus documentos",
      body: (
        <div className="flex gap-3" role="radiogroup" aria-label="Cor do documento">
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={p.pdfColor === c} aria-label={c} onClick={() => set({ pdfColor: c })}
              style={{ background: c }} className={cx("size-10 rounded-full ring-offset-2", p.pdfColor === c && "ring-2 ring-ink")} />
          ))}
        </div>
      ),
    },
  ];

  const finish = async () => {
    await api.account.updateProfile({ ...draft, onboardingDone: true });
    setStep(0); setDraft(null); onClose();
    router.push("/plano");
  };

  return (
    <Modal open={open} onClose={onClose} title={steps[step].title} subtitle={`Passo ${step + 1} de ${steps.length} · dá para mudar tudo depois em Ajustes`}
      footer={<>
        <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : onClose())}>{step ? "Voltar" : "Depois"}</Button>
        {step < steps.length - 1
          ? <Button onClick={() => setStep(step + 1)}>Continuar</Button>
          : <Button onClick={finish}>Montar meu primeiro plano</Button>}
      </>}>
      {steps[step].body}
    </Modal>
  );
}
