"use client";

import { signOut } from "@/features/auth/actions";
import { roleLabel, type UserRole } from "@/features/auth/domain/roles";

interface AccountBadgeProps {
  email: string;
  role: UserRole;
}

export default function AccountBadge({ email, role }: AccountBadgeProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <p className="truncate font-medium">{email}</p>
        <p className="text-xs text-neutral-500">{roleLabel(role)}</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="shrink-0 rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
