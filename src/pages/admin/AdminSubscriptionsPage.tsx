import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ADMIN_USERS_MAX_LIMIT,
  adminErrorMessage,
  adminSetPro,
  getAdminUsers,
  type AdminUser,
} from '@/lib/adminService';
import { AdminGuard, type AdminContext } from '@/components/admin/AdminGuard';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { RefreshCw, ShieldOff } from 'lucide-react';

export default function AdminSubscriptionsPage() {
  return (
    <AdminGuard section="subscriptions">
      {ctx => <AdminSubscriptionsContent {...ctx} />}
    </AdminGuard>
  );
}

function AdminSubscriptionsContent({ actorId }: AdminContext) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proUsers, setProUsers] = useState<AdminUser[]>([]);
  const [confirm, setConfirm] = useState<{ userId: string; name: string } | null>(null);
  const requestSeq = useRef(0);

  const fetchPro = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Server caps p_limit at 500; the page shows every PRO user it can get in one call.
      const data = await getAdminUsers(actorId, { isPro: true, limit: ADMIN_USERS_MAX_LIMIT });
      if (seq === requestSeq.current) setProUsers(data);
    } catch (e) {
      if (seq === requestSeq.current) setError(adminErrorMessage(e, 'Не удалось загрузить PRO пользователей'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [actorId]);

  useEffect(() => { void fetchPro(); }, [fetchPro]);

  const handleRemovePro = async (reason?: string) => {
    if (!confirm) return;
    await adminSetPro(actorId, confirm.userId, false, reason ?? '');
    toast.success(`PRO снят — ${confirm.name}`);
    setConfirm(null);
    void fetchPro();
  };

  const countLabel = proUsers.length >= ADMIN_USERS_MAX_LIMIT
    ? `Показано ${proUsers.length} PRO пользователей`
    : `${proUsers.length} активных PRO пользователей`;

  return (
    <>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">PRO подписки</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{loading ? 'Загрузка…' : countLabel}</p>
          </div>
          <button
            onClick={() => void fetchPro()}
            disabled={loading}
            aria-label="Обновить"
            className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1fr_1fr_100px_110px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
                <span>Пользователь</span>
                <span>Email</span>
                <span>Звёзды</span>
                <span>Действие</span>
              </div>

              {loading ? (
                <AdminTableSkeleton rows={6} cols={4} />
              ) : proUsers.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {error ? 'Список недоступен' : 'Нет PRO пользователей'}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {proUsers.map(u => (
                    <div key={u.user_id} className="grid grid-cols-[1fr_1fr_100px_110px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {u.display_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="text-sm font-medium text-foreground truncate">{u.display_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                      <span className="text-sm text-foreground">{u.stars_balance ?? 0}</span>
                      <button
                        onClick={() => setConfirm({ userId: u.user_id, name: u.display_name })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors whitespace-nowrap"
                      >
                        <ShieldOff size={12} /> Снять PRO
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={`Снять PRO у ${confirm.name}`}
          requireReason
          destructive
          onConfirm={handleRemovePro}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
