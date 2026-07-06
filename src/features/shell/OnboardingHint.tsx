"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { can, type Permission } from "@/features/auth/domain/permissions";

interface Counts {
  products: number;
  customers: number;
  team: number;
}

/**
 * Live setup checklist for a new business. Each step checks off automatically
 * as the data is created; the whole card disappears once setup is complete.
 */
export default function OnboardingHint({
  permissions,
}: {
  permissions: Permission[];
}) {
  const [supabase] = useState(() => createClient());
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [p, c, t] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      if (active) {
        setCounts({
          products: p.count ?? 0,
          customers: c.count ?? 0,
          team: t.count ?? 0,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  if (!can(permissions, "products.manage") || !counts) return null;

  const steps = [
    {
      done: counts.products > 0,
      href: "/products",
      label: "Cargá tus productos y stock",
      perm: "products.manage" as Permission,
    },
    {
      done: counts.customers > 0,
      href: "/customers",
      label: "Registrá tus clientes",
      perm: "customers.manage" as Permission,
    },
    {
      done: counts.team > 1,
      href: "/admin/users",
      label: "Invitá a tu equipo",
      perm: "users.manage" as Permission,
    },
  ].filter((s) => can(permissions, s.perm));

  if (steps.every((s) => s.done)) return null;

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/5 p-3">
      <p className="mb-2 text-sm font-semibold">👋 Primeros pasos</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {steps.map((s) => (
          <li key={s.href} className="flex items-center gap-2">
            <span>{s.done ? "✅" : "⬜"}</span>
            {s.done ? (
              <span className="text-muted line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="text-brand hover:underline">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
