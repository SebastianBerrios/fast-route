"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "@/features/routing/domain/types";
import { createClient } from "@/lib/supabase/client";
import { insertProduct } from "@/features/products/services/products";
import { insertCustomer } from "@/features/customers/services/customers";
import ProductForm from "@/features/products/components/ProductForm";
import CustomerForm from "@/features/customers/components/CustomerForm";
import InviteGenerator from "@/features/admin/components/InviteGenerator";
import {
  formatPrice,
  type ProductInput,
} from "@/features/products/domain/types";
import type { CustomerInput } from "@/features/customers/domain/types";
import { dismissOnboarding } from "@/features/shell/onboarding/dismissal";
import type { OnboardingStepId } from "@/features/shell/onboarding/useOnboardingSteps";

interface StepMeta {
  icon: string;
  shortLabel: string;
  title: string;
  why: string;
}

const STEP_META: Record<OnboardingStepId, StepMeta> = {
  products: {
    icon: "📦",
    shortLabel: "Productos",
    title: "Cargá tu primer producto",
    why: "Con tu catálogo cargado, cada pedido suma productos y descuenta el stock solo.",
  },
  customers: {
    icon: "👥",
    shortLabel: "Clientes",
    title: "Registrá tu primer cliente",
    why: "Guardá su dirección una sola vez y reutilizala en cada pedido, sin volver a buscarla en el mapa.",
  },
  team: {
    icon: "🤝",
    shortLabel: "Equipo",
    title: "Invitá a tu equipo",
    why: "Tus repartidores ven su ruta optimizada en el celular y vos seguís cada entrega en vivo.",
  },
};

/** Decorative delivery-route motif for the wizard rail. */
function RouteMotif() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-15"
      viewBox="0 0 320 640"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <path
        d="M-30 620 C 130 540, 30 430, 165 360 S 350 230, 235 130 S 70 40, 150 -50"
        stroke="white"
        strokeWidth="2"
        strokeDasharray="1 11"
        strokeLinecap="round"
      />
      <circle cx="165" cy="360" r="5" fill="white" />
      <circle cx="235" cy="130" r="5" fill="white" />
      <circle cx="52" cy="530" r="7" fill="white" />
    </svg>
  );
}

/** Compact success list of the items created during this wizard session. */
function CreatedItemsList({
  countLabel,
  items,
}: {
  countLabel: string;
  items: { key: string; primary: string; secondary?: string }[];
}) {
  return (
    <div className="rounded-lg border border-green-600/30 bg-green-600/10 p-2.5">
      {/* role="status" so each new addition is announced politely. */}
      <p
        role="status"
        className="text-xs font-semibold text-green-700 dark:text-green-400"
      >
        {countLabel}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-baseline gap-1.5 text-sm text-green-700 dark:text-green-400"
          >
            <span aria-hidden="true">✓</span>
            <span className="font-medium">{item.primary}</span>
            {item.secondary && (
              <span className="text-xs text-green-700/80 dark:text-green-400/80">
                {item.secondary}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductStep({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: () => void;
}) {
  // Plain service calls instead of useProducts: the wizard only creates a few
  // products and must not open a realtime channel or fetch the whole table.
  const [supabase] = useState(() => createClient());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Real inserted ids are kept so later entries can share a pool with
  // products created earlier in this same session (e.g. refill → bottle).
  const [created, setCreated] = useState<{ id: string; input: ProductInput }[]>(
    [],
  );

  const handleSubmit = async (input: ProductInput) => {
    setSubmitting(true);
    const { id, error: errorMessage } = await insertProduct(
      supabase,
      userId,
      input,
    );
    setSubmitting(false);
    setError(errorMessage);
    // A partial failure (e.g. initial-stock ledger) still created the
    // product: keep it in the list so the error reads as a warning, not as
    // an invitation to re-submit a duplicate.
    if (id) {
      setCreated((prev) => [...prev, { id, input }]);
      onSaved();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {created.length > 0 && (
        <CreatedItemsList
          countLabel={
            created.length === 1
              ? "1 producto agregado"
              : `${created.length} productos agregados`
          }
          items={created.map(({ id, input: p }) => ({
            key: id,
            primary: p.name,
            secondary: [
              p.unit,
              formatPrice(p.price),
              p.stockSourceId ? "comparte stock" : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {/* Remounting on each save resets the form for the next entry. */}
      <ProductForm
        key={created.length}
        submitting={submitting}
        stockSourceCandidates={created
          .filter(({ input }) => !input.stockSourceId)
          .map(({ id, input }) => ({ id, name: input.name }))}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function CustomerStep({
  userId,
  defaultCenter,
  onSaved,
}: {
  userId: string;
  defaultCenter?: Coordinate;
  onSaved: () => void;
}) {
  // Plain service calls instead of useCustomers: the wizard only creates a few
  // customers and must not open a realtime channel or fetch the whole table.
  const [supabase] = useState(() => createClient());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CustomerInput[]>([]);

  const handleSubmit = async (input: CustomerInput) => {
    setSubmitting(true);
    const { error: errorMessage } = await insertCustomer(supabase, userId, input);
    setSubmitting(false);
    setError(errorMessage);
    if (!errorMessage) {
      setCreated((prev) => [...prev, input]);
      onSaved();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {created.length > 0 && (
        <CreatedItemsList
          countLabel={
            created.length === 1
              ? "1 cliente agregado"
              : `${created.length} clientes agregados`
          }
          items={created.map((c, i) => ({
            key: `${c.name}-${i}`,
            primary: c.name,
            secondary: c.address || "Sin dirección",
          }))}
        />
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {/* Remounting on each save resets the form for the next entry. */}
      <CustomerForm
        key={created.length}
        submitting={submitting}
        defaultCenter={defaultCenter}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function TeamStep({ done, onDone }: { done: boolean; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <InviteGenerator onGenerated={() => onDone()} />
      {done && (
        <p className="rounded-lg border border-green-600/30 bg-green-600/10 p-2.5 text-sm text-green-700 dark:text-green-400">
          Invitación lista. Compartí el link con tu equipo: cuando entren, van
          a aparecer en tu negocio con el rol que elegiste.
        </p>
      )}
    </div>
  );
}

interface OnboardingWizardProps {
  userId: string;
  /** Pending steps captured when the wizard opens, in order. */
  stepIds: OnboardingStepId[];
  /** The tenant's stored region, used by the customer location picker. */
  defaultCenter?: Coordinate;
  /** Called after a step saves successfully so live counts can refresh. */
  onStepCompleted: () => void;
  onClose: () => void;
}

/**
 * Full-screen first-run wizard: the owner completes each setup step with the
 * real forms embedded, no navigation away. Steps allow adding several items
 * before continuing explicitly. Skippable, but the layout pushes toward
 * completing the flow. Built on the native <dialog> element for focus
 * trapping and Escape handling.
 */
export default function OnboardingWizard({
  userId,
  stepIds,
  defaultCenter,
  onStepCompleted,
  onClose,
}: OnboardingWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<OnboardingStepId[]>([]);
  const [view, setView] = useState<"steps" | "done">("steps");
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // No close() in cleanup: under StrictMode the double-mount cleanup would
    // fire the dialog's `close` event, which routes through finish() and
    // persists the dismissal before first paint. On a real unmount React
    // removes the element, which closes it without firing `close`.
  }, []);

  useEffect(() => {
    // Advancing a step remounts the pane (key={current}), so the previously
    // focused control unmounts and focus falls to <body>. Move it to the new
    // step heading so screen readers announce the change.
    headingRef.current?.focus();
  }, [index, view]);

  const total = stepIds.length;
  const current = view === "steps" ? stepIds[index] : null;
  const allCompleted = completed.length === total;
  const progress = view === "done" ? total : completed.length;

  const finish = () => {
    // Persist the dismissal so skipped steps don't reopen the wizard on every
    // visit. Live data still rules: all-done never shows it again anyway.
    dismissOnboarding(userId);
    onClose();
  };

  const goNext = () =>
    index + 1 < total ? setIndex(index + 1) : setView("done");

  // Marks the step done (first save) and refreshes live counts on every save.
  // Never advances: the user adds as many items as they want, then continues.
  const markCompleted = (id: OnboardingStepId) => {
    setCompleted((prev) => (prev.includes(id) ? prev : [...prev, id]));
    onStepCompleted();
  };

  const requestExit = () => {
    if (view === "done") finish();
    else setConfirmExit(true);
  };

  const stepState = (id: OnboardingStepId, i: number) => {
    if (completed.includes(id)) return "done" as const;
    if (view === "steps" && i === index) return "current" as const;
    return "pending" as const;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Configuración inicial del negocio"
      onCancel={(e) => {
        // Escape asks for confirmation instead of silently closing; if the
        // confirmation is already showing, Escape dismisses it instead.
        e.preventDefault();
        if (confirmExit) setConfirmExit(false);
        else requestExit();
      }}
      onClose={() => {
        // The browser can force-close the dialog past onCancel's
        // preventDefault (e.g. a second Escape without user activation in
        // Chrome, per CloseWatcher semantics). Sync React state through the
        // same dismissal path so the component unmounts and the card's
        // reopen button keeps working.
        finish();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full w-full items-center justify-center md:p-6">
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface md:h-auto md:max-h-[min(94dvh,820px)] md:min-h-[560px] md:max-w-5xl md:flex-row md:rounded-3xl md:shadow-2xl">
          {/* ── Rail (desktop): steps as stops on a route ── */}
          <aside className="relative hidden w-72 shrink-0 flex-col bg-[#0f1c3f] p-8 text-white md:flex">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.4),transparent_60%)]" />
            <RouteMotif />

            <div className="relative flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-lg shadow-sm">
                🚚
              </span>
              <span className="font-display text-lg font-bold tracking-tight">
                Fast Route
              </span>
            </div>

            <h2 className="relative mt-8 font-display text-3xl font-bold leading-tight tracking-tight">
              Configurá tu negocio
            </h2>
            <p className="relative mt-2 text-sm text-white/70">
              {total === 1
                ? "Un paso y quedás en ruta."
                : `${total} paradas y quedás en ruta.`}
            </p>

            <ol className="relative mt-8 flex flex-col">
              {stepIds.map((id, i) => {
                const state = stepState(id, i);
                return (
                  <li key={id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors ${
                          state === "done"
                            ? "bg-white text-[#0f1c3f]"
                            : state === "current"
                              ? "border-2 border-white bg-white/10 text-white"
                              : "border border-white/30 text-white/50"
                        }`}
                        aria-hidden="true"
                      >
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      {i < total - 1 && (
                        <span
                          className={`my-1 h-8 border-l-2 border-dashed ${
                            state === "done"
                              ? "border-white/60"
                              : "border-white/20"
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p
                        className={`text-sm font-medium ${
                          state === "pending" ? "text-white/50" : "text-white"
                        }`}
                      >
                        {STEP_META[id].shortLabel}
                        {state === "done" && (
                          <span className="sr-only"> (completado)</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={requestExit}
              className="relative mt-auto self-start text-sm text-white/50 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/80"
            >
              Saltar configuración
            </button>
          </aside>

          {/* ── Mobile header + progress ── */}
          <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-base shadow-sm">
              🚚
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold tracking-tight">
                Configurá tu negocio
              </p>
              <p className="text-xs text-muted">
                {view === "done"
                  ? "Configuración terminada"
                  : `Paso ${index + 1} de ${total}`}
              </p>
            </div>
            <button
              type="button"
              onClick={requestExit}
              aria-label="Salir de la configuración"
              className="rounded-md px-2 py-1 text-muted hover:bg-black/5 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </header>
          <div
            className="h-1 w-full bg-line md:hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={progress}
            aria-label="Progreso de la configuración"
          >
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${(progress / total) * 100}%` }}
            />
          </div>

          {/* ── Content pane ── */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <button
              type="button"
              onClick={requestExit}
              aria-label="Salir de la configuración"
              className="absolute right-4 top-4 z-10 hidden rounded-md px-2 py-1 text-muted hover:bg-black/5 md:block dark:hover:bg-white/10"
            >
              ✕
            </button>

            {view === "steps" && current && (
              <div
                key={current}
                className="onboarding-step-in flex flex-1 flex-col gap-4 p-4 pb-6 md:p-10"
              >
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                    Paso {index + 1} de {total}
                  </p>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="font-display text-2xl font-bold tracking-tight outline-none md:text-3xl"
                  >
                    {STEP_META[current].icon} {STEP_META[current].title}
                  </h3>
                  <p className="text-sm text-muted md:max-w-md">
                    {STEP_META[current].why}
                  </p>
                </div>

                <div className="md:max-w-xl">
                  {current === "products" && (
                    <ProductStep
                      userId={userId}
                      onSaved={() => markCompleted("products")}
                    />
                  )}
                  {current === "customers" && (
                    <CustomerStep
                      userId={userId}
                      defaultCenter={defaultCenter}
                      onSaved={() => markCompleted("customers")}
                    />
                  )}
                  {current === "team" && (
                    <TeamStep
                      done={completed.includes("team")}
                      onDone={() => markCompleted("team")}
                    />
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  {/* Skip is for leaving with zero items; once something was
                      created this session, "Continuar" is the only way out. */}
                  {current !== "team" && completed.includes(current) ? (
                    <span aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      onClick={goNext}
                      className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
                    >
                      Saltar por ahora
                    </button>
                  )}
                  {current === "team" ? (
                    completed.includes("team") && (
                      <button
                        type="button"
                        onClick={goNext}
                        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand/90"
                      >
                        Continuar
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={!completed.includes(current)}
                      className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-50"
                    >
                      Continuar
                    </button>
                  )}
                </div>
              </div>
            )}

            {view === "done" && (
              <div className="onboarding-step-in flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <span className="onboarding-pop grid h-20 w-20 place-items-center rounded-full bg-brand/10 text-4xl">
                  {allCompleted ? "🎉" : "🚀"}
                </span>
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-display text-3xl font-bold tracking-tight outline-none"
                >
                  {allCompleted ? "¡Todo listo!" : "¡Buen comienzo!"}
                </h3>
                <p className="max-w-sm text-sm text-muted">
                  Ya podés crear tu primer pedido y planificar la ruta óptima
                  desde el mapa.
                  {!allCompleted &&
                    " Los pasos que saltaste te esperan en el planificador."}
                </p>
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand/90"
                >
                  Crear mi primer pedido
                </button>
              </div>
            )}
          </div>

          {/* ── Exit confirmation ── */}
          {confirmExit && (
            <div
              role="alertdialog"
              aria-label="Confirmar salida de la configuración"
              className="absolute inset-0 z-20 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
            >
              <div className="onboarding-pop flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xl">
                <h4 className="font-display text-lg font-bold tracking-tight">
                  ¿Salir de la configuración?
                </h4>
                <p className="text-sm text-muted">
                  La podés retomar cuando quieras desde el planificador de
                  ruta.
                </p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmExit(false)}
                    className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
                  >
                    Seguir configurando
                  </button>
                  <button
                    type="button"
                    onClick={finish}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Salir por ahora
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
