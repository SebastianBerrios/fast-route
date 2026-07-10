"use client";

import { useCallback, useRef, useState } from "react";

export interface PendingActions {
  /**
   * Run an async action under a key. No-op while that key is already in
   * flight (synchronous ref guard, so double-taps can't fire twice).
   */
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  /** Whether this exact key is in flight. */
  isPending: (key: string) => boolean;
  /** Whether any in-flight key starts with the prefix (e.g. `${orderId}:`). */
  hasPending: (prefix: string) => boolean;
}

/**
 * Per-key pending state for client-Supabase mutations that aren't tracked by
 * a form or transition. Key convention: `${orderId}:verb` so one row's
 * conflicting buttons disable together while other rows stay live; item-level
 * ops use `item:${itemId}` / `additem:${orderId}`.
 */
export function usePendingActions(): PendingActions {
  // Source of truth for the re-entry guard: updated synchronously, unlike state.
  const inFlightRef = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      if (inFlightRef.current.has(key)) return;
      inFlightRef.current.add(key);
      setPending(new Set(inFlightRef.current));
      try {
        await action();
      } finally {
        inFlightRef.current.delete(key);
        setPending(new Set(inFlightRef.current));
      }
    },
    [],
  );

  const isPending = useCallback((key: string) => pending.has(key), [pending]);

  const hasPending = useCallback(
    (prefix: string) => {
      for (const key of pending) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    },
    [pending],
  );

  return { run, isPending, hasPending };
}
