"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Field, Input, ErrorNote } from "@/components/ui";

export default function NovaSenha() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    if (pw.length < 8) return setError("A senha precisa de pelo menos 8 caracteres.");
    if (pw !== pw2) return setError("As senhas não são iguais.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError("Não foi possível trocar a senha. Peça um novo link.");
    router.replace("/");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-100 px-4">
      <form className="w-full max-w-sm space-y-4 rounded-lg bg-surface-200 p-6 shadow-md" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h1 className="text-lg font-bold">Criar nova senha</h1>
        <ErrorNote message={error} />
        <Field label="Nova senha">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="Repita a senha">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
        <Button type="submit" className="w-full" loading={busy}>Salvar senha</Button>
      </form>
    </main>
  );
}
