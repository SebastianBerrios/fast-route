"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "@/features/auth/actions";

const initialState: AuthState = {};

const inputClass =
  "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "text-muted";

export default function AuthForm({ inviteCode }: { inviteCode?: string }) {
  const joining = Boolean(inviteCode);
  const [mode, setMode] = useState<"signin" | "signup">(
    joining ? "signup" : "signin",
  );
  const [state, formAction, isPending] = useActionState(
    authenticate,
    initialState,
  );

  const isSignup = mode === "signup";

  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-6 shadow-sm">
      {joining && (
        <div className="mb-4 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm text-brand">
          Te invitaron a un negocio. Creá tu cuenta para unirte al equipo.
        </div>
      )}

      <p className="mb-6 text-center text-sm text-muted">
        {joining
          ? "Unite al equipo"
          : isSignup
            ? "Creá tu negocio"
            : "Ingresá a tu cuenta"}
      </p>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="intent" value={mode} />
        {joining && (
          <input type="hidden" name="invite_code" value={inviteCode} />
        )}

        {isSignup && !joining && (
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>Nombre del negocio</span>
            <input
              name="business_name"
              type="text"
              required
              placeholder="Ej: Agua Tacna Express"
              className={inputClass}
            />
          </label>
        )}

        {isSignup && (
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>Tu nombre</span>
            <input
              name="full_name"
              type="text"
              autoComplete="name"
              className={inputClass}
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Contraseña</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className={inputClass}
          />
        </label>

        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="text-sm text-green-600" role="status">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-brand px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending
            ? "Procesando…"
            : joining
              ? "Unirme al equipo"
              : isSignup
                ? "Crear cuenta"
                : "Ingresar"}
        </button>
      </form>

      {!joining && (
        <button
          type="button"
          onClick={() => setMode(isSignup ? "signin" : "signup")}
          className="mt-4 w-full text-center text-sm text-brand hover:underline"
        >
          {isSignup
            ? "¿Ya tenés cuenta? Ingresá"
            : "¿No tenés cuenta? Registrate"}
        </button>
      )}
    </div>
  );
}
