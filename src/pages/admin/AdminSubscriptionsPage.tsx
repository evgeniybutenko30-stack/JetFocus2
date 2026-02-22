import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getAdminUsers, adminSetPro, type AdminRole } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { RefreshCw, Shield, ShieldOff } from 'lucide-react';

export default function AdminSubscriptionsPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [proUsers, setProUsers] = useState<Awaited<ReturnType<typeof getAdminUsers>>>([]);
  const [confirm, setConfirm] = useState<{ userId: string; name: string; isPro: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchPro = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getAdminUsers(user.id, { isPro: true });
      setProUsers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (role) fetchPro(); }, [role]);

  if (!role || (role !== 'owner' && role !== 'admin')) return null;

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">PRO подписки</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{proUsers.length} активных PRO пользователей</p>
          </div>
          <button onClick={fetchPro} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_100px_80px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
            <span>Пользователь</span>
            <span>Email</span>
            <span>Звёзды</span>
            <span>Действие</span>
          </div>

          {loading ? (
            <AdminTableSkeleton rows={6} cols={4} />
          ) : proUsers.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Нет PRO пользователей</div>
          ) : (
            <div className="divide-y divide-border/20">
              {proUsers.map(u => (
                <div key={u.user_id} className="grid grid-cols-[1fr_1fr_100px_80px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {u.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{u.display_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                  <span className="text-sm text-foreground">{u.stars_balance}</span>
                  <button
                    onClick={() => setConfirm({ userId: u.user_id, name: u.display_name, isPro: u.is_pro })}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
                  >
                    <ShieldOff size={12} /> Снять PRO
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={`Снять PRO у ${confirm.name}`}
          requireReason
          destructive
          onConfirm={async (reason) => {
            await adminSetPro(user!.id, confirm.userId, false, reason ?? '');
            setConfirm(null);
            fetchPro();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  );
}
