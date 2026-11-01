import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useInView, useReducedMotion } from './use-motion';

/**
 * The three motion components the landing page composes with.
 *
 * `Reveal` wraps a block that should arrive on first view; `Counter` counts a
 * number up once; `Typewriter` types the terminal once. All three read the
 * reduced-motion preference and show their finished state instead.
 */

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}

/** A block that fades and rises the first time it enters the viewport. */
export function Reveal({ children, delay = 0, y = 18, className = '' }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`cf-reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ '--cf-delay': `${delay}ms`, '--cf-y': `${y}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * A headline that arrives word by word.
 *
 * Each word sits in its own overflow-hidden box and rises from behind the
 * baseline, staggered by index, so the line assembles itself instead of
 * fading in as a block. The words are real inline boxes, so wrapping and
 * `text-balance` still behave normally; the last `emphasis` words take the
 * gradient ink.
 */
export function Words({
  text,
  emphasis,
  className = '',
  delay = 0,
  step = 38,
}: {
  text: string;
  emphasis?: string;
  className?: string;
  delay?: number;
  step?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.12 });
  const words = text.split(' ');
  const inkFrom = emphasis ? Math.max(0, words.length - emphasis.split(' ').length) : Infinity;

  return (
    <span ref={ref} className={`cf-words ${inView ? 'is-in' : ''} ${className}`}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="cf-word"
          style={{ '--cf-i': index, '--cf-step': `${step}ms`, '--cf-delay': `${delay}ms` } as CSSProperties}
        >
          <span className={index >= inkFrom ? 'cf-ink' : undefined}>
            {word}
            {index < words.length - 1 ? '\u00A0' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

/** A number that counts up once, when it is first seen. */
export function Counter({
  value,
  suffix = '',
  className = '',
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) return;

    // Timer-driven rather than requestAnimationFrame: the loop measures real
    // elapsed time, so a throttled or backgrounded tab still lands on the true
    // value instead of leaving a stat at zero.
    const started = performance.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / 1200);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(value * eased));
      if (t >= 1) clearInterval(timer);
    }, 32);

    return () => clearInterval(timer);
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {display}
      {suffix}
    </span>
  );
}

/**
 * A terminal that types its content the first time it is seen.
 *
 * The visible text is decorative; the full command block is exposed to
 * assistive technology immediately, so a screen reader never hears half a
 * command or waits for an animation.
 */
export function Typewriter({ text, className = '' }: { text: string; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (!inView || reduced) return;

    const started = performance.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / 1500);
      setCount(Math.floor(text.length * t));
      if (t >= 1) clearInterval(timer);
    }, 24);

    return () => clearInterval(timer);
  }, [inView, reduced, text]);

  return (
    <div ref={ref} className={className}>
      <pre className="overflow-x-auto p-5 text-[12.5px] leading-relaxed text-slate-100">
        <code aria-hidden="true">
          {text.slice(0, count)}
          {count < text.length && <span className="cf-caret" />}
        </code>
        <code className="sr-only">{text}</code>
      </pre>
    </div>
  );
}
