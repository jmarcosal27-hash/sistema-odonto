"use client";

import { useEffect, useRef } from "react";

/**
 * Atalhos de uma tecla para a tela atual (ex.: { n: novaConsulta }).
 * Ignorados enquanto a pessoa digita, com Ctrl/Alt/Cmd, ou com algum diálogo aberto.
 */
export function useHotkeys(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map);
  useEffect(() => { ref.current = map; });
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (/^(radio|tab|option|menuitem|slider)$/.test(t.getAttribute("role") ?? "")) return;
      if (document.querySelector('[role="dialog"]')) return;
      const fn = ref.current[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled]);
}
