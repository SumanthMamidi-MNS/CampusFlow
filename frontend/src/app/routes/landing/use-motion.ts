import { useEffect, useRef, useState } from 'react';

/**
 * Motion hooks for the landing page.
 *
 * Separated from the components that use them so fast refresh keeps working
 * (a module that exports both components and hooks loses it), and so the
 * reduced-motion decision lives in exactly one place.
 *
 * Every hook removes what it registered; the page can mount and unmount without
 * leaving a scroll listener or an animation frame behind.
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(REDUCED_QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export function useInView<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const { threshold = 0.18, rootMargin = '0px 0px -8% 0px', once = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}

/**
 * Pointer-driven tilt for a flat card.
 *
 * Writes CSS custom properties on the element instead of re-rendering React:
 * the pointer can move at 120 Hz and the browser only has to recompute a
 * transform. Coarse pointers and reduced motion opt out entirely.
 */
export function useTilt<T extends HTMLElement>(max = 7, base = { x: 0, y: 0 }) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;

    const rest = () => {
      node.style.setProperty('--cf-rx', `${base.x}deg`);
      node.style.setProperty('--cf-ry', `${base.y}deg`);
      node.style.setProperty('--cf-mx', '50%');
      node.style.setProperty('--cf-my', '50%');
    };

    // A resting angle gives the scene depth before the pointer arrives; on a
    // coarse pointer it is the only depth the visitor gets.
    rest();

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const reset = () => rest();

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.classList.remove('is-settling');
        node.style.setProperty('--cf-ry', `${base.y + (x - 0.5) * max * 2}deg`);
        node.style.setProperty('--cf-rx', `${base.x + (0.5 - y) * max * 2}deg`);
        node.style.setProperty('--cf-mx', `${x * 100}%`);
        node.style.setProperty('--cf-my', `${y * 100}%`);
      });
    };

    const onLeave = () => {
      node.classList.add('is-settling');
      reset();
      clearTimeout(settle);
      settle = setTimeout(() => node.classList.remove('is-settling'), 900);
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [max, reduced, base.x, base.y]);

  return ref;
}

/**
 * How far the viewport has travelled through an element, 0 → 1.
 *
 * Used by the examination journey: the track fills as the reader moves through
 * the section, so the six stages read as a sequence rather than six cards.
 */
export function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const start = window.innerHeight * 0.82;
      const end = window.innerHeight * 0.22;
      const span = rect.height + (start - end);
      if (span <= 0) return;
      const travelled = start - rect.top;
      setProgress(Math.min(1, Math.max(0, travelled / span)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return { ref, progress };
}

/**
 * A scroll position written straight onto an element as a CSS custom property.
 *
 * The header hairline and the hero's dive only need a number in CSS. Routing
 * that through `useState` re-rendered the whole landing tree — every section,
 * every card, every step button — once per scroll frame, which is what made the
 * page stutter while scrolling. Here the value never enters React: one
 * rAF-throttled `setProperty`, quantised so an unchanged frame writes nothing.
 */
export function useScrollVar<T extends HTMLElement>(
  name: string,
  options?: { target?: 'page' | 'self'; span?: number },
) {
  const ref = useRef<T | null>(null);
  const target = options?.target ?? 'page';
  const span = options?.span ?? 1;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let last = -1;

    const measure = () => {
      frame = 0;
      let value: number;
      if (target === 'page') {
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        value = total <= 0 ? 0 : window.scrollY / total;
      } else {
        value = -node.getBoundingClientRect().top / Math.max(1, window.innerHeight * span);
      }
      const next = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
      if (next === last) return;
      last = next;
      node.style.setProperty(name, String(next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [name, target, span]);

  return ref;
}

/**
 * Progress through a tall container holding a `position: sticky` child.
 *
 * 0 when the container's top reaches the viewport top, 1 when its bottom
 * reaches the viewport bottom — exactly the window in which the child is
 * pinned, so a step sequence advances one stage per screen of scrolling and
 * lands on the last stage as the pin releases.
 */
export function useStickyProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      setProgress(Math.min(1, Math.max(0, -rect.top / span)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return { ref, progress };
}

/** Which of the chapter anchors the reader is currently inside. */
export function useActiveSection(ids: string[]): string {
  const key = ids.join('|');
  const [active, setActive] = useState(ids[0] ?? '');

  useEffect(() => {
    const nodes = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.38;
      let current = nodes[0].id;
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= line) current = node.id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [key]);

  return active;
}

/**
 * A pointer-following highlight for every `.cf-spot` surface on the page.
 *
 * One delegated listener instead of one per card: the pointer can move at
 * 120 Hz across a section of six cards and only the hovered element gets two
 * custom properties written, once per frame. Coarse pointers never attach.
 */
export function useSpotlightField() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let node: HTMLElement | null = null;
    let spotX = '50%';
    let spotY = '0%';

    const paint = () => {
      frame = 0;
      if (!node) return;
      node.style.setProperty('--cf-spot-x', spotX);
      node.style.setProperty('--cf-spot-y', spotY);
    };

    const onMove = (event: PointerEvent) => {
      const next = (event.target as Element | null)?.closest?.('.cf-spot') as HTMLElement | null;
      if (!next) {
        if (node) {
          node.style.setProperty('--cf-spot-x', '50%');
          node.style.setProperty('--cf-spot-y', '0%');
          node = null;
        }
        return;
      }

      node = next;
      const rect = next.getBoundingClientRect();
      if (rect.width === 0) return;
      spotX = `${((event.clientX - rect.left) / rect.width) * 100}%`;
      spotY = `${((event.clientY - rect.top) / rect.height) * 100}%`;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
    };
  }, []);
}
