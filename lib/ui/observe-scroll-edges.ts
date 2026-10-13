export type ScrollEdges = { start: boolean; end: boolean };

/** Read geometry once per animation frame, publishing only changed control states. */
export function observeScrollEdges(
  element: HTMLElement,
  publish: (edges: ScrollEdges) => void,
): () => void {
  let frame: number | null = null;
  let disposed = false;
  let previous: ScrollEdges | undefined;
  const update = () => {
    frame = null;
    const next = {
      start: element.scrollLeft <= 2,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    };
    if (previous?.start === next.start && previous?.end === next.end) return;
    previous = next;
    publish(next);
  };
  const schedule = () => {
    if (disposed) return;
    if (frame === null) frame = requestAnimationFrame(update);
  };
  update();
  element.addEventListener("scroll", schedule, { passive: true });
  const observer = new ResizeObserver(schedule);
  observer.observe(element);
  return () => {
    disposed = true;
    element.removeEventListener("scroll", schedule);
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
