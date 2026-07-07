"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { authenticate, type AuthState } from "@/features/auth/actions";
import type { CitySuggestion } from "@/features/routing/services/openrouteservice";

const initialState: AuthState = {};

const inputClass =
  "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "text-muted";

/** How long to wait after the last keystroke before querying suggestions. */
const AUTOCOMPLETE_DEBOUNCE_MS = 300;
const AUTOCOMPLETE_MIN_CHARS = 2;

/**
 * Accessible city combobox for signup: a debounced input backed by the public
 * /api/cities endpoint. The user must pick a suggestion — that captures the
 * city label, country, and center coordinates in one step, so signup does not
 * need a second geocoding pass.
 */
function CityCombobox({
  selected,
  onSelect,
  error,
}: {
  selected: CitySuggestion | null;
  onSelect: (city: CitySuggestion | null) => void;
  error: string | null;
}) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Exposed so blur can cancel the pending debounce and in-flight request.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // A query matching the picked suggestion's label came from the pick
    // itself (or is already resolved) — no new lookup needed.
    if (selected && query === selected.label) return;
    const text = query.trim();
    // Too-short queries are reset in the change handler; nothing to fetch.
    if (text.length < AUTOCOMPLETE_MIN_CHARS) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: CitySuggestion[] };
        const results = data.results ?? [];
        // The field may have lost focus while the request was in flight;
        // never open the listbox over the fields below.
        if (document.activeElement !== inputRef.current) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
      } catch {
        // Aborted or offline: keep whatever is currently shown.
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    debounceRef.current = timer;

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  const pick = (city: CitySuggestion) => {
    setQuery(city.label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(city);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && suggestions.length > 0) setOpen(true);
      setActiveIndex((i) => (i + 1) % Math.max(suggestions.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        suggestions.length === 0
          ? -1
          : (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  // Per the APG combobox pattern the label, helper text, and listbox are
  // siblings of the input — nesting them inside a <label> would fold the
  // whole suggestion list and hint into the input's accessible name.
  return (
    <div className="relative flex flex-col gap-1 text-sm">
      <label htmlFor={inputId} className={labelClass}>
        Ciudad del negocio
      </label>
      <input
        ref={inputRef}
        id={inputId}
        name="city"
        type="text"
        required
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          if (value.trim().length < AUTOCOMPLETE_MIN_CHARS) {
            setSuggestions([]);
            setOpen(false);
            setActiveIndex(-1);
          }
          // Any edit invalidates the previous pick until a new one is made.
          if (selected) onSelect(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Leaving the field must also stop any pending lookup, or the
          // listbox would pop open over the next fields after focus moved on.
          if (debounceRef.current) clearTimeout(debounceRef.current);
          abortRef.current?.abort();
          setOpen(false);
        }}
        placeholder="Ej: Tacna"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${helperId} ${errorId}` : helperId}
        className={inputClass}
      />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Ciudades sugeridas"
          className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${s.lng}-${s.lat}`}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // onMouseDown (not onClick) so the pick wins over the input blur.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIndex ? "bg-brand/10 text-brand" : ""
              }`}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <span id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
      <span id={helperId} className="text-xs text-muted">
        Usamos tu ciudad para que las búsquedas de direcciones caigan en tu
        zona y no en otro lugar.
      </span>
    </div>
  );
}

export default function AuthForm({ inviteCode }: { inviteCode?: string }) {
  const joining = Boolean(inviteCode);
  const [mode, setMode] = useState<"signin" | "signup">(
    joining ? "signup" : "signin",
  );
  const [state, formAction, isPending] = useActionState(
    authenticate,
    initialState,
  );
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Creating a business requires a city picked from the suggestions so we
    // get unambiguous coordinates — free text alone is not enough.
    if (isSignup && !joining && !selectedCity) {
      e.preventDefault();
      setCityError("Elegí una ciudad de la lista de sugerencias.");
    }
  };

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

      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="intent" value={mode} />
        {joining && (
          <input type="hidden" name="invite_code" value={inviteCode} />
        )}

        {isSignup && !joining && (
          <>
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
            <CityCombobox
              selected={selectedCity}
              onSelect={(city) => {
                setSelectedCity(city);
                if (city) setCityError(null);
              }}
              error={cityError}
            />
            {selectedCity && (
              <>
                {/* Bare city name to persist as tenant.city; the visible
                    input keeps the full label for disambiguation only. */}
                <input
                  type="hidden"
                  name="city_name"
                  value={selectedCity.city}
                />
                <input
                  type="hidden"
                  name="country"
                  value={selectedCity.country ?? ""}
                />
                <input
                  type="hidden"
                  name="center_lng"
                  value={String(selectedCity.lng)}
                />
                <input
                  type="hidden"
                  name="center_lat"
                  value={String(selectedCity.lat)}
                />
              </>
            )}
          </>
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
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            // The combobox unmounts on mode change; a stale pick or error
            // must not survive a later return to signup.
            setSelectedCity(null);
            setCityError(null);
          }}
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
