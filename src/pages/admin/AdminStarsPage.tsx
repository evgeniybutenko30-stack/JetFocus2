import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  AdminServiceError,
  adminErrorMessage,
  adminGrantStars,
  formatAdminDate,
  getAdminPermissions,
  getStarsLedger,
  isUuid,
  parseStarsDelta,
  type StarLedgerEntry,
} from '@/lib/adminService';
import { AdminGuard, type AdminContext } from '@/components/admin/AdminGuard';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { Star, RefreshCw, Plus } from 'lucide-react';

const DEFAULT_GRANT_AMOUNT = '50';

export default function AdminStarsPage() {
  return (
    <AdminGuard section="stars">
      {ctx => <AdminStarsContent {...ctx} />}
    </AdminGuard>
  );
}

function AdminStarsContent({ actorId, role }: AdminContext) {
  const { canGrantStars, maxStarsPerGrant } = getAdminPermissions(role);
  const [entries, setEntries] = useState<StarLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grantTarget, setGrantTarget] = useState('');
  const [grantAmount, setGrantAmount] = useState(DEFAULT_GRANT_AMOUNT);
  const requestSeq = useRef(0);

  const fetchLedger = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getStarsLedger(actorId);
      if (seq === requestSeq.current) setEntries(data);
    } catch (e) {
      if (seq === requestSeq.current) setError(adminErrorMessage(e, 'Не удалось загрузить журнал'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [actorId]);

  useEffect(() => { void fetchLedger(); }, [fetchLedger]);

  const openGrant = () => {
    setGrantTarget('');
    setGrantAmount(DEFAULT_GRANT_AMOUNT);
    setShowGrant(true);
  };

  const target = grantTarget.trim();
  const amountCheck = parseStarsDelta(grantAmount, role);
  const formError = !isUuid(target)
    ? 'Введите корректный User ID (UUID)'
    : amountCheck.error;

  const handleGrant = async (reason?: string) => {
    if (!isUuid(target)) throw new AdminServiceError('Введите корректный User ID (UUID)');
    const parsed = parseStarsDelta(grantAmount, role);
    if (parsed.error !== null) throw new AdminServiceError(parsed.error);
    await adminGrantStars(actorId, target, parsed.value, reason ?? '');
    toast.success(`${parsed.value > 0 ? 'Начислено' : 'Списано'} ${Math.abs(parsed.value)} ⭐`);
    setShowGrant(false);
    void fetchLedger();
  };

  return (
    <>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Звёзды</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Журнал операций со звёздами</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void fetchLedger()}
              disabled={loading}
              aria-label="Обновить"
              className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            </button>
            {canGrantStars && (
              <button
                onClick={openGrant}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                <Plus size={15} /> Начислить
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[1fr_1fr_80px_1fr_120px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
                <span>Кому</span>
                <span>Причина</span>
                <span>Δ Звёзды</span>
                <span>Источник</span>
                <span>Дата</span>
              </div>

              {loading ? (
                <AdminTableSkeleton rows={8} cols={5} />
              ) : entries.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {error ? 'Журнал недоступен' : 'Операций пока нет'}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {entries.map(e => (
                    <div
                      key={e.id}
                      className="grid grid-cols-[1fr_1fr_80px_1fr_120px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors"
                    >
                      <span className="text-xs font-mono text-muted-foreground truncate" title={e.target_user_id ?? undefined}>
                        {e.target_user_id ? e.target_user_id.slice(0, 8) + '…' : '—'}
                      </span>
                      <span className="text-sm text-foreground truncate" title={e.reason ?? undefined}>{e.reason ?? '—'}</span>
                      <div className="flex items-center gap-1">
                        <Star size={12} className={e.delta > 0 ? 'text-amber-400' : 'text-destructive'} />
                        <span className={`text-sm font-bold ${e.delta > 0 ? 'text-amber-400' : 'text-destructive'}`}>
                          {e.delta > 0 ? '+' : ''}{e.delta}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{e.source}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatAdminDate(e.created_at, 'd MMM yyyy')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showGrant && (
        <ConfirmModal
          title="Начислить звёзды"
          description={role === 'support' ? `Роль «Поддержка»: не более ${maxStarsPerGrant} ⭐ за одну операцию.` : undefined}
          requireReason
          confirmDisabled={formError !== null}
          validationMessage={target ? formError : amountCheck.error}
          onConfirm={handleGrant}
          onCancel={() => setShowGrant(false)}
        >
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">User ID получателя</label>
            <input
              value={grantTarget}
              onChange={e => setGrantTarget(e.target.value)}
              placeholder="uuid пользователя…"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Количество</label>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={grantAmount}
              onChange={e => setGrantAmount(e.target.value)}
              className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Отрицательное число — списание.</p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
