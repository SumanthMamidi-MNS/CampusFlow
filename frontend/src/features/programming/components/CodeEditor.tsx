import { useEffect, useMemo, useRef } from 'react';

/**
 * A lightweight, dependency-free code editor.
 *
 * It provides a monospace editing surface with a synced line-number gutter,
 * tab-to-spaces insertion and auto-indent. It is intentionally isolated behind
 * this component so it can later be swapped for Monaco or CodeMirror without
 * touching any surrounding feature code (see docs/architecture.md).
 */
export function CodeEditor({
  value,
  onChange,
  language = 'python',
  readOnly = false,
  minLines = 16,
  ariaLabel = 'Source code editor',
}: {
  value: string;
  onChange: (next: string) => void;
  language?: string;
  readOnly?: boolean;
  minLines?: number;
  ariaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const lineCount = useMemo(() => Math.max(minLines, value.split('\n').length), [value, minLines]);

  // Keep the gutter scrolled in lockstep with the textarea.
  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(() => {
    syncScroll();
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${value.slice(0, start)}    ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      });
      return;
    }

    if (e.key === 'Enter') {
      // Preserve the indentation of the current line.
      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = (value.slice(lineStart, start).match(/^[ \t]*/) || [''])[0];
      if (indent) {
        e.preventDefault();
        const next = `${value.slice(0, start)}\n${indent}${value.slice(textarea.selectionEnd)}`;
        onChange(next);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
        });
      }
    }
  };

  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-slate-900 font-mono text-[13px] leading-5">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="select-none overflow-hidden bg-slate-800/70 px-2 py-3 text-right text-slate-500"
        style={{ minWidth: '2.75rem' }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="h-5">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        data-language={language}
        className="h-80 w-full resize-none bg-transparent px-3 py-3 text-slate-100 outline-none placeholder:text-slate-500"
        style={{ tabSize: 4 }}
        placeholder="# Write your solution here"
      />
    </div>
  );
}
