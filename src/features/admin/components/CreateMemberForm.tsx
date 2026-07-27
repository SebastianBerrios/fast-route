"use client";

import { useRef, useState, useTransition } from "react";
import { createTeamMember } from "@/features/admin/actions";
import { ROLE_LABELS, type UserRole } from "@/features/auth/domain/roles";

const ROLE_OPTIONS: UserRole[] = ["driver", "seller", "admin"];

const inputClass =
  "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "text-muted";

interface CreateMemberFormProps {
  /** Called after an account is successfully created. */
  onCreated?: () => void;
}

/**
 * Creates a team member's account outright: the admin sets the initial password
 * and hands it over. Standalone so it can be embedded both in the admin panel
 * and in the onboarding wizard.
 */
export default function CreateMemberForm({ onCreated }: CreateMemberFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      setError(null);
      setSuccess(false);
      try {
        const res = await createTeamMember({
          fullName: String(data.get("full_name") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          role: String(data.get("role") ?? "driver") as UserRole,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        setSuccess(true);
        formRef.current?.reset();
        onCreated?.();
      } catch {
        setError("No se pudo crear la cuenta. Probá de nuevo.");
      }
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      aria-busy={isPending}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className={labelClass}>Nombre</span>
        <input
          name="full_name"
          type="text"
          required
          placeholder="Ej: Ana Pérez"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={labelClass}>Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="ana@ejemplo.com"
          className={inputClass}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className={labelClass}>Contraseña inicial</span>
          <input
            name="password"
            type="text"
            required
            minLength={6}
            autoComplete="off"
            placeholder="Al menos 6 caracteres"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Rol</span>
          <select
            name="role"
            defaultValue="driver"
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
      >
        {isPending ? "Creando…" : "Crear cuenta"}
      </button>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p
          className="rounded-lg border border-green-600/30 bg-green-600/10 p-2.5 text-sm text-green-700 dark:text-green-400"
          role="status"
        >
          Cuenta creada. Pasale el email y la contraseña para que ingrese.
        </p>
      )}
    </form>
  );
}
