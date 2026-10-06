/** Thrown by the deal page fetcher so the UI can tell "not found" from "can't reach". */
export class DealFetchError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Deal request failed with status ${status}`);
    this.name = "DealFetchError";
    this.status = status;
  }
}

export type DealLoadErrorKind =
  | "not-found"
  | "auth"
  | "unavailable"
  | "network"
  | "unknown";

export function classifyDealLoadError(error: unknown): DealLoadErrorKind {
  if (error instanceof DealFetchError) {
    if (error.status === 404 || error.status === 400 || error.status === 410)
      return "not-found";
    if (error.status === 401 || error.status === 403) return "auth";
    if (error.status >= 500) return "unavailable";
    return "unknown";
  }
  // fetch() rejects with a TypeError when the request never got a response.
  if (error instanceof TypeError) return "network";
  return "unknown";
}

export type DealLoadErrorCopy = {
  title: string;
  message: string;
  actionLabel: string;
  /** "retry" reloads the page; "discover" sends the buyer back to browsing. */
  action: "retry" | "discover" | "login";
};

export function dealLoadErrorCopy(kind: DealLoadErrorKind): DealLoadErrorCopy {
  switch (kind) {
    case "not-found":
      return {
        title: "Deal not found",
        message:
          "This listing may have sold, expired, or been removed by the source.",
        actionLabel: "Browse Discover",
        action: "discover",
      };
    case "auth":
      return {
        title: "Sign in to view this deal",
        message: "Your session needs attention. Sign in again, then reopen it.",
        actionLabel: "Sign in",
        action: "login",
      };
    case "unavailable":
      return {
        title: "Deal details are temporarily unavailable",
        message:
          "MIKEHUNT couldn't load this deal right now. Try again in a minute.",
        actionLabel: "Try again",
        action: "retry",
      };
    case "network":
      return {
        title: "Couldn't load deal",
        message:
          "We couldn't reach MIKEHUNT right now. Check your connection and try again.",
        actionLabel: "Try again",
        action: "retry",
      };
    default:
      return {
        title: "Couldn't load deal",
        message: "Something went wrong loading this deal. Please try again.",
        actionLabel: "Try again",
        action: "retry",
      };
  }
}
