/**
 * Destino seguro para o parâmetro `next` dos links de e-mail: só caminhos da própria origem.
 * Resolve com `new URL` (como o navegador) e compara a origem, o que pega `//evil.com`,
 * `/\evil.com` (a barra invertida vira barra) e variações com caracteres de controle.
 * Qualquer coisa suspeita volta para "/".
 */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
