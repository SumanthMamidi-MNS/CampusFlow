import * as React from 'react';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  /** Message describing the action and its consequences. */
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Applies destructive styling to the confirm action. */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Accessible in-app replacement for `window.confirm`.
 *
 * Renders through the shared Dialog primitive so focus is moved into a real
 * dialog element, Escape closes it, and background scrolling is locked. The
 * confirm action may be async; while it is pending both buttons are disabled
 * and the dialog cannot be dismissed.
 */
export function ConfirmDialog({
  open,
  title = 'Please confirm',
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const titleId = React.useId();
  const bodyId = React.useId();

  React.useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      labelledBy={titleId}
      describedBy={bodyId}
    >
      <DialogHeader>
        <DialogTitle id={titleId}>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p id={bodyId} className="text-sm text-slate-600">{body}</p>
      </DialogBody>
      <DialogFooter className="gap-3 sm:space-x-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          autoFocus
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
