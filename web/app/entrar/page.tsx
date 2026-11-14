"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { REMOTE, supabaseBrowser } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/brand";
import { Button, Field, Input, Segmented, ErrorNote } from "@/components/ui";

type Mode = "login" | "signup" | "reset";
const email = z.string().trim().email("E-mail inválido.");
const password = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.");

export default function Entrar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!REMOTE) {
    return (
      <Center>
        <h1 className="text-xl font-bold">Modo demonstração</h1>
        <p className="text-sm text-muted">O login aparece quando o Supabase estiver configurado (veja <code>.env.example</code>). Por enquanto, os dados ficam neste navegador.</p>
        <Button onClick={() => router.push("/")}>Abrir o sistema</Button>
      </Center>
    );
  }

  const submit = async () => {
    setError(null); setInfo(null);
    const e = email.safeParse(form.email);
    if (!e.success) return setError(e.error.issues[0].message);
    if (mode !== "reset") { const p = password.safeParse(form.password); if (!p.success) return setError(p.error.issues[0].message); }
    setBusy(true);
    const sb = supabaseBrowser();
    const redirect = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: e.data, password: form.password });
        if (error) throw new Error(/confirm/i.test(error.message) ? "Confirme seu e-mail antes de entrar (veja a caixa de entrada)." : "E-mail ou senha incorretos.");
        router.replace("/"); router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: e.data, password: form.password, options: { emailRedirectTo: redirect } });
        if (error) throw new Error(/already/i.test(error.message) ? "Já existe uma conta com esse e-mail. Use Entrar." : error.message);
        if (data.session) { router.replace("/"); router.refresh(); return; } // projeto sem confirmação de e-mail
        setInfo("Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar a conta.");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(e.data, { redirectTo: `${redirect}?next=/auth/nova-senha` });
        if (error) throw new Error(error.message);
        setInfo("Se existir uma conta com esse e-mail, chegará um link para criar uma nova senha.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível continuar.");
    }
    setBusy(false);
  };

  return (
    <Center>
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-accent text-on-accent font-bold">{APP_NAME[0]}</span>
        <h1 className="text-xl font-bold">{APP_NAME}</h1>
      </div>
      <Segmented label="Entrar ou criar conta" value={mode} onChange={(m) => { setMode(m); setError(null); setInfo(null); }}
        options={[{ value: "login", label: "Entrar" }, { value: "signup", label: "Criar conta" }, { value: "reset", label: "Esqueci a senha" }]} />
      <form className="w-full space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorNote message={error} />
        {info && <p role="status" className="rounded-md bg-surface-success-subtle px-3 py-2 text-sm">{info}</p>}
        <Field label="E-mail">{(id) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        {mode !== "reset" && (
          <Field label="Senha" hint={mode === "signup" ? "Mínimo de 8 caracteres." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          </Field>
        )}
        <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}</Button>
      </form>
      <p className="text-xs text-muted text-center">Ao criar a conta você concorda com os <a href="/termos" className="underline">termos</a> e a <a href="/privacidade" className="underline">política de privacidade</a>.</p>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg bg-surface p-6 shadow-pop">{children}</div>
    </main>
  );
}
