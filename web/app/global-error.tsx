"use client";

/** Último recurso: o layout inteiro falhou. Sem dependências do app, só HTML. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f6fa", color: "#1f1b2e", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>O SmillicOS não abriu</h1>
          <p style={{ color: "#625c78", lineHeight: 1.5 }}>Algo deu errado ao carregar o sistema. Seus dados continuam guardados.</p>
          <button type="button" onClick={reset} style={{ height: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#6d4fd8", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Tentar de novo</button>
        </div>
      </body>
    </html>
  );
}
