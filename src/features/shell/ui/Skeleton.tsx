/**
 * Loading-state primitives shared across features. Skeletons approximate the
 * final layout (no layout shift when data lands) and announce themselves to
 * screen readers via a single `role="status"` group with an sr-only label,
 * keeping the pulsing boxes themselves decorative.
 */

/** A single pulsing placeholder box. Decorative — group it in a SkeletonGroup. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-foreground/10 ${className}`}
    />
  );
}

/** Accessible wrapper for a skeleton region: one status role, one sr-only label. */
export function SkeletonGroup({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * Placeholder rows matching the managers' list item layout (`divide-y
 * divide-line` container, p-3 rows with title + subtitle + trailing pill).
 */
export function ListRowsSkeleton({
  rows = 4,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <SkeletonGroup label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-3 p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Full-size map placeholder. Used for BOTH the dynamic-import fallback and
 * the post-mount tile-loading overlay so the two states are pixel-identical.
 */
export function MapSkeleton({
  className = "h-full w-full",
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`relative overflow-hidden bg-background ${className}`}
    >
      <div aria-hidden className="absolute inset-0 animate-pulse bg-foreground/5" />
      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
        Cargando mapa…
      </div>
    </div>
  );
}
