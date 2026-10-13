import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { ADMIN_REASON_MAX, adminErrorMessage } from '@/lib/adminService';

interface ConfirmModalProps {
  title: string;
  description?: string;
  requireReason?: boolean;
  destructive?: boolean;
  /** Extra form fields rendered above the reason (kept inside the same dialog). */
  children?: ReactNode;
  /** Blocks confirming while the extra fields are invalid. */
  confirmDisabled?: boolean;
  /** Hint shown under the fields while confirmDisabled is true. */
  validationMessage?: string | null;
  confirmLabel?: string;
  /**
   * May return a promise: the dialog stays open, disables its buttons while it runs and
   * shows the error text if it rejects. The caller closes the dialog on success.
   */
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  requireReason = false,
  destructive = false,
  children,
  confirmDisabled = false,
  validationMessage,
  confirmLabel = 'Подтвердить',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard: two fast clicks happen before `submitting` re-renders.
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const trimmedReason = reason.trim();
  const blocked = confirmDisabled || (requireReason && !trimmedReason);

  const handleConfirm = async () => {
    if (blocked || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmedReason || undefined);
    } catch (e) {
      if (mountedRef.current) setError(adminErrorMessage(e));
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submittingRef.current) return;
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl"
      >
        <div className="flex items-start justify-between p-5 border-b border-border/40">
          <div className="flex items-start gap-3 min-w-0">
            {destructive && (
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground break-words">{title}</h3>
              {description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={submitting}
            aria-label="Закрыть"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {children}

          {confirmDisabled && validationMessage && (
            <p className="text-xs text-destructive">{validationMessage}</p>
          )}

          {requireReason && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Причина <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Укажите причину действия…"
                rows={3}
                maxLength={ADMIN_REASON_MAX}
                disabled={submitting}
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none transition-colors"
              />
            </div>
          )}

          {error && (
            <div role="alert" className="px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground hover:bg-accent/40 transition-colors disabled:opacity-40"
            >
              Отмена
            </button>
            <button
              onClick={handleConfirm}
              disabled={blocked || submitting}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {submitting ? 'Сохранение…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
