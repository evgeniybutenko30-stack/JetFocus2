import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getStarsLedger, adminGrantStars, type AdminRole, type StarLedgerEntry } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { Star, RefreshCw, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function AdminStarsPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [entries, setEntries] = useState<StarLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grantTarget, setGrantTarget] = useState('');
  const [grantAmount, setGrantAmount] = useState('50');

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchLedger = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStarsLedger(user.id);
      setEntries(data);
    } catch {
      setError('Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  if (!role) return null;

  const canGrant = role === 'owner' || role === 'admin' || role === 'support';

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Звёзды</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Журнал операций со звёздами</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchLedger} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors">
              <RefreshCw size={16} />
            </button>
            {canGrant && (
              <button
                onClick={() => setShowGrant(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                <Plus size={15} /> Начислить
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
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
            <div className="py-16 text-center text-sm text-muted-foreground">Операций пока нет</div>
          ) : (
            <div className="divide-y divide-border/20">
              {entries.map(e => (
                <div
                  key={e.id}
                  className="grid grid-cols-[1fr_1fr_80px_1fr_120px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors"
                >
                  <span className="text-xs font-mono text-muted-foreground truncate">{e.target_user_id ? e.target_user_id.slice(0, 8) + '…' : '—'}</span>
                  <span className="text-sm text-foreground truncate">{e.reason ?? '—'}</span>
                  <div className="flex items-center gap-1">
                    <Star size={12} className={e.delta > 0 ? 'text-amber-400' : 'text-destructive'} />
                    <span className={`text-sm font-bold ${e.delta > 0 ? 'text-amber-400' : 'text-destructive'}`}>
                      {e.delta > 0 ? '+' : ''}{e.delta}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{e.source}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), 'd MMM yyyy', { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showGrant && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Начислить звёзды</h3>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">User ID получателя</label>
              <input
                value={grantTarget}
                onChange={e => setGrantTarget(e.target.value)}
                placeholder="uuid пользователя…"
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Количество</label>
              <input
                type="number"
                value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)}
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <ConfirmModal
              title="Подтвердить начисление"
              requireReason
              onConfirm={async (reason) => {
                await adminGrantStars(user!.id, grantTarget, Number(grantAmount), reason ?? '');
                setShowGrant(false);
                fetchLedger();
              }}
              onCancel={() => setShowGrant(false)}
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
