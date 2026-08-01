import { useEffect, type RefObject } from 'react';

/**
 * Calls `onResize` whenever `containerRef`'s box size changes.
 * `ResizeObserver` rather than a `window.resize` listener: a chart card
 * resizes when its own grid column changes width (e.g. a breakpoint
 * flipping the Overview grid from 3 columns to 1), which doesn't
 * necessarily correlate with the window itself resizing.
 */
export function useChartResize(
  containerRef: RefObject<HTMLElement | null>,
  onResize: (width: number, height: number) => void,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) onResize(width, height);
    });

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResize is expected to be stable (a useCallback at the call site); re-observing on every render would be wasteful and isn't what any caller needs.
  }, [containerRef]);
}
