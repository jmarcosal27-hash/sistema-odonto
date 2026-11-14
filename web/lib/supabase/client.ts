import { createBrowserClient } from "@supabase/ssr";

/** Modo nuvem ligado quando o projeto Supabase está configurado; sem isso o app roda em modo demonstração (dados no navegador). */
export const REMOTE = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!REMOTE) throw new Error("Supabase não configurado.");
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
