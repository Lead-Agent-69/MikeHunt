/**
 * Finishing setup changes the cookie-backed account gate. A document navigation
 * guarantees the next request sees those new cookies instead of reusing an App
 * Router payload that was fetched while the account was still incomplete.
 */
export function finishOnboardingNavigation(destination: string) {
  window.location.replace(destination);
}
