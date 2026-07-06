"use client";

import Link from "next/link";
import { can, type Permission } from "@/features/auth/domain/permissions";

/**
 * First-run guidance for a fresh business. Shows while there are no products
 * yet (auto-hides once the catalog is set up). Steps are gated by permission.
 */
export default function OnboardingHint({
  permissions,
  show,
}: {
  permissions: Permission[];
  show: boolean;
}) {
  if (!show || !can(permissions, "products.manage")) return null;

  const allSteps: { href: string; label: string; perm: Permission }[] = [
    { href: "/products", label: "Cargá tus productos y stock", perm: "products.manage" },
    { href: "/customers", label: "Registrá tus clientes", perm: "customers.manage" },
    { href: "/admin/users", label: "Invitá a tu equipo", perm: "users.manage" },
  ];
  const steps = allSteps.filter((s) => can(permissions, s.perm));

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/5 p-3">
      <p className="mb-2 text-sm font-semibold">👋 Primeros pasos</p>
      <ol className="flex flex-col gap-1 text-sm">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="text-brand hover:underline">
              {i + 1}. {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
