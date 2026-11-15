import { APP_NAME } from "@/lib/brand";

// Regras de uso: design-system/assets/Logos/README.md.
// Logotipo completo: mínimo de 96px de largura e respiro de 25% da largura do ícone (o tile ocupa 24% da largura).
// Ícone: mínimo de 24px. Os SVGs são usados por <img> e nunca são recoloridos.
const LOGO_MIN_WIDTH = 96;
const ICON_MIN_SIZE = 24;

export function Logo({ width = 144, className, onDark }: { width?: number; className?: string; onDark?: boolean }) {
  const w = Math.max(width, LOGO_MIN_WIDTH);
  const height = Math.round(w / 3);
  const respiro = Math.round(w * 0.06);
  const img = "block max-w-none";
  if (onDark) {
    // Fundo sempre escuro (barra lateral): só a versão para fundo escuro, nos dois temas.
    return (
      <span className={className} style={{ display: "inline-block", padding: respiro }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca */}
        <img src="/brand/smileos_logo_fundo_escuro.svg" alt={APP_NAME} width={w} height={height} className={img} />
      </span>
    );
  }
  return (
    <span className={className} style={{ display: "inline-block", padding: respiro }}>
      {/* eslint-disable @next/next/no-img-element -- SVG estático da marca, sem otimização necessária */}
      <img src="/brand/smileos_logo_fundo_claro.svg" alt={APP_NAME} width={w} height={height} className={`so-logo-light ${img}`} />
      <img src="/brand/smileos_logo_fundo_escuro.svg" alt={APP_NAME} width={w} height={height} className={`so-logo-dark ${img}`} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}

/** Ícone oficial do app (lavanda). Usar onde só o ícone cabe. */
export function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  const s = Math.max(size, ICON_MIN_SIZE);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca
    <img src="/brand/smileos_icone_lavanda.svg" alt={APP_NAME} width={s} height={s} className={className} />
  );
}
