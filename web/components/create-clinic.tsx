"use client";

import { useState } from "react";
import { z } from "zod";
import { supabaseBrowser } from "@/lib/supabase/client";
import { reloadRemote } from "@/lib/store";
import { Button, Field, Input, ErrorNote } from "./ui";

const schema = z.object({
  clinic: z.string().trim().min(2, "Dê um nome ao consultório ou clínica.").max(120),
  name: z.string().trim().max(120).optional(),
});

/** Primeiro acesso: cria a clínica (com 14 dias de teste) e o usuário vira dono. */
export function CreateClinic({ email }: { email: string }) {
  const [clinic, setClinic] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError(null);
    const v = schema.safeParse({ clinic, name: name || undefined });
    if (!v.success) return setError(v.error.issues[0].message);
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("create_clinic", { p_name: v.data.clinic, p_professional_name: v.data.name ?? null });
    if (error) { setBusy(false); return setError(error.message); }
    await reloadRemote();
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-100 px-4">
      <form className="w-full max-w-md space-y-4 rounded-lg bg-surface-200 p-6 shadow-md" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <div>
          <h1 className="text-lg font-bold">Bem-vindo(a)!</h1>
          <p className="text-sm text-ink-muted">Conta {email}. Falta criar o seu consultório — você ganha 14 dias para testar tudo.</p>
          <p className="text-xs text-ink-muted mt-1">Foi convidado(a) por uma clínica? Peça para o dono enviar o convite para este e-mail e entre de novo.</p>
        </div>
        <ErrorNote message={error} />
        <Field label="Nome do consultório ou clínica">{(id) => <Input id={id} value={clinic} onChange={(e) => setClinic(e.target.value)} placeholder="Ex.: Clínica Sorriso Centro" />}</Field>
        <Field label="Seu nome profissional (opcional)">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dra. Camila Rocha" />}</Field>
        <Button type="submit" className="w-full" loading={busy}>Criar e começar</Button>
      </form>
    </main>
  );
}
