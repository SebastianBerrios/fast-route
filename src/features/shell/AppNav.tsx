"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { can, type Permission } from "@/features/auth/domain/permissions";
import { roleLabel, type UserRole } from "@/features/auth/domain/roles";
import ThemeToggle from "@/features/shell/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Mapa", icon: "🗺️" },
  { href: "/customers", label: "Clientes", icon: "👥", permission: "customers.manage" },
  { href: "/products", label: "Productos", icon: "📦", permission: "products.manage" },
  { href: "/sales", label: "Ventas", icon: "💰", permission: "sales.view" },
  { href: "/metrics", label: "Métricas", icon: "📊", permission: "metrics.view" },
  { href: "/admin/users", label: "Usuarios", icon: "⚙️", permission: "users.manage" },
];

interface AppNavProps {
  email: string;
  role: UserRole;
  permissions: Permission[];
}

export default function AppNav({ email, role, permissions }: AppNavProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (i) => !i.permission || can(permissions, i.permission),
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex h-dvh w-16 shrink-0 flex-col border-r border-line bg-surface md:w-60">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-lg shadow-sm">
          🚚
        </span>
        <span className="hidden font-display text-lg font-bold tracking-tight md:inline">
          Fast Route
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand text-white shadow-sm"
                  : "text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-2">
        <ThemeToggle />
        <div className="hidden px-3 py-1 md:block">
          <p className="truncate text-sm font-medium">{email}</p>
          <p className="text-xs text-muted">{roleLabel(role)}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Salir"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="text-lg">🚪</span>
            <span className="hidden md:inline">Salir</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
