"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCheck, RotateCcw } from "lucide-react";
import { cx } from "./ui";

const TABS = [
  { href: "/agenda", label: "Calendário", icon: CalendarDays },
  { href: "/agenda/confirmar", label: "Confirmar", icon: CheckCheck },
  { href: "/agenda/reativar", label: "Reativar", icon: RotateCcw },
];

export function AgendaTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Seções da agenda" className="flex justify-center">
      <ul className="inline-flex rounded-pill bg-surface-sidebar p-1 gap-1">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={path === href ? "page" : undefined}
              className={cx("inline-flex items-center gap-1.5 rounded-pill h-8 px-4 text-sm font-semibold", path === href ? "bg-surface shadow-card" : "text-muted hover:text-text")}>
              <Icon aria-hidden className="size-4" />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
