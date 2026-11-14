// Mapeia os tokens (tokens.css) para classes Tailwind. Componentes usam
// bg-surface, text-muted, etc. -- nunca hex cru nem var(--...) direto no JSX.
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          sidebar: "var(--color-surface-sidebar)",
          "success-subtle": "var(--color-surface-success-subtle)",
          "info-subtle": "var(--color-surface-info-subtle)",
          "warning-subtle": "var(--color-surface-warning-subtle)",
          "accent-subtle": "var(--color-surface-accent-subtle)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          input: "var(--color-border-input)",
        },
        text: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-on-accent)",
        },
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: ["var(--text-xs-size)", { lineHeight: "var(--text-xs-line)" }],
        sm: ["var(--text-sm-size)", { lineHeight: "var(--text-sm-line)" }],
        base: ["var(--text-base-size)", { lineHeight: "var(--text-base-line)" }],
        lg: ["var(--text-lg-size)", { lineHeight: "var(--text-lg-line)" }],
        xl: ["var(--text-xl-size)", { lineHeight: "var(--text-xl-line)" }],
      },
      spacing: {
        0: "var(--space-0)", 1: "var(--space-1)", 2: "var(--space-2)",
        3: "var(--space-3)", 4: "var(--space-4)", 5: "var(--space-5)",
        6: "var(--space-6)", 7: "var(--space-7)", 8: "var(--space-8)",
      },
      borderRadius: {
        sm: "var(--radius-sm)", md: "var(--radius-md)",
        lg: "var(--radius-lg)", pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)", pop: "var(--shadow-pop)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)", base: "var(--motion-base)",
      },
      transitionTimingFunction: {
        brand: "var(--motion-ease)",
      },
    },
  },
};

export default config;
