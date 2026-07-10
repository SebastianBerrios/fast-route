/**
 * The wizard dismissal is stored per user in localStorage — no DB migration.
 * Data-driven completion always wins: when every step is done the wizard
 * never shows, regardless of this flag.
 */
const storageKey = (userId: string) => `fast-route:onboarding-dismissed:${userId}`;

export function isOnboardingDismissed(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding(userId: string): void {
  try {
    window.localStorage.setItem(storageKey(userId), "1");
  } catch {
    // storage unavailable (private mode) — the wizard will just reappear
  }
}
