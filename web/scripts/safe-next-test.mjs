// Teste do filtro de redirecionamento do /auth/callback. Uso: node scripts/safe-next-test.mjs
// (Node 22.18+ roda o .ts direto, sem etapa de build.)
import assert from "node:assert/strict";
import { safeNext } from "../lib/safe-next.ts";

const origin = "https://app.exemplo.com";
for (const hostil of ["//evil.com", "/\\evil.com", "/%09/evil.com", "/\t/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com"]) {
  const r = safeNext(hostil, origin);
  assert.ok(new URL(r, origin).origin === origin, `${JSON.stringify(hostil)} escapou para ${r}`);
}
assert.equal(safeNext("/auth/nova-senha", origin), "/auth/nova-senha");
assert.equal(safeNext("/pacientes?x=1#a", origin), "/pacientes?x=1#a");
assert.equal(safeNext(null, origin), "/");
console.log("safe-next: tudo certo.");
