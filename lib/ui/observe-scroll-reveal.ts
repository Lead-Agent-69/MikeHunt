/** Reveal compact search after deliberate upward travel, without per-scroll React updates. */
export function observeScrollReveal(
  anchor: HTMLElement,
  publish: (visible: boolean) => void,
  interacting: () => boolean,
  initialVisible = false,
) {
  const position = () =>
    Math.max(
      0,
      window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0,
    );
  let previousY = position();
  let travel = 0;
  let direction = 0;
  let visible = initialVisible;
  let frame: number | null = null;
  let disposed = false;
  const update = () => {
    frame = null;
    const y = position();
    const delta = y - previousY;
    previousY = y;
    let next = visible;
    if (interacting()) {
      direction = 0;
      travel = 0;
    } else if (anchor.getBoundingClientRect().bottom > 56 || y <= 56) {
      next = false;
      travel = 0;
      direction = 0;
    } else if (delta !== 0) {
      const nextDirection = Math.sign(delta);
      travel =
        nextDirection === direction
          ? travel + Math.abs(delta)
          : Math.abs(delta);
      direction = nextDirection;
      if (direction < 0 && travel >= 24) next = true;
      if (direction > 0 && travel >= 48) next = false;
    }
    if (next !== visible) {
      visible = next;
      publish(next);
    }
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = requestAnimationFrame(update);
  };
  // Capture body-based dashboard scrolling as well as normal document scrolling.
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("focusout", schedule, { capture: true });
  return () => {
    disposed = true;
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", schedule);
    window.removeEventListener("focusout", schedule, { capture: true });
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
