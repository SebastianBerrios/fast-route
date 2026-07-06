import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthForm from "@/features/auth/components/AuthForm";
import ThemeToggle from "@/features/shell/ThemeToggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background p-4">
      {/* Ambient brand glow */}
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

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-xl shadow-sm">
            🚚
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">
            Fast Route
          </span>
        </div>
        <AuthForm inviteCode={invite} />
      </div>
    </main>
  );
}
