import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  description?: string;
  requireReason?: boolean;
  destructive?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  requireReason = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-border/40">
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              {description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none transition-colors"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => {
                if (requireReason && !reason.trim()) return;
                onConfirm(reason.trim() || undefined);
              }}
              disabled={requireReason && !reason.trim()}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              Подтвердить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
