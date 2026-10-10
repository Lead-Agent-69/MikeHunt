/** A late response must not update a newer search, even when a fetch ignores abort. */
export function createLatestRequest() {
  let current: AbortController | null = null;
  const cancel = () => {
    current?.abort();
    current = null;
  };
  return {
    cancel,
    start() {
      cancel();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted,
        finish() {
          if (current === controller) current = null;
        },
      };
    },
  };
}
