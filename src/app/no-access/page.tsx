import { signOut } from "@/features/auth/actions";
import ThemeToggle from "@/features/shell/ThemeToggle";

/**
 * Dead end for an authenticated user who is NOT a fast_route member. In the
 * shared mvp-lab auth pool a valid session proves identity, never belonging, so
 * a user of another fleet app who signs in here must land on a wall — not a
 * redirect to /login (they already have a session, so that would loop). The
 * proxy middleware routes non-members here; the only way forward is to sign out.
 */
export default function NoAccessPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(55rem 35rem at 75% -10%, color-mix(in oklab, var(--brand) 20%, transparent), transparent), radial-gradient(45rem 35rem at -10% 110%, color-mix(in oklab, var(--brand) 12%, transparent), transparent)",
        }}
      />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-xl shadow-sm">
            🚚
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">
            Fast Route
          </span>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Sin acceso</h1>
        <p className="mt-2 text-sm text-muted">
          Tu cuenta no pertenece a Fast Route. Si creés que es un error, pedile a
          un administrador de tu negocio que te envíe una invitación.
        </p>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium transition hover:bg-muted/10"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
