import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getAdminUsers, adminGrantStars, adminSetPro, adminSetBan, type AdminRole, type AdminUser } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { Search, Star, Shield, Ban, ChevronRight, RefreshCw } from 'lucide-react';

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [proFilter, setProFilter] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [confirm, setConfirm] = useState<{
    title: string;
    desc?: string;
    action: (reason: string) => Promise<void>;
  } | null>(null);

  // Check role
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchUsers = useCallback(async () => {
    if (!user || !role) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUsers(user.id, { search: search || undefined, isPro: proFilter });
      setUsers(data);
    } catch (e) {
      setError('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [user, role, search, proFilter]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  if (!role) return null;

  const canManagePro = role === 'owner' || role === 'admin';
  const canBan = role === 'owner' || role === 'admin' || role === 'support';
  const canGrantStars = role === 'owner' || role === 'admin' || role === 'support';

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Пользователи</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{users.length} записей</p>
          </div>
          <button onClick={fetchUsers} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по имени или email…"
              className="w-full bg-secondary border border-border/40 rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            {[undefined, true, false].map((val, i) => (
              <button
                key={i}
                onClick={() => setProFilter(val)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  proFilter === val
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent/60'
                }`}
              >
                {val === undefined ? 'Все' : val ? 'PRO' : 'Бесплатные'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_80px_80px_80px_100px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
            <span>Пользователь</span>
            <span>Email</span>
            <span>PRO</span>
            <span>Статус</span>
            <span className="flex items-center gap-1"><Star size={11} /> Звёзды</span>
            <span>Действия</span>
          </div>

          {loading ? (
            <AdminTableSkeleton rows={8} cols={6} />
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Пользователи не найдены
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {users.map(u => (
                <div
                  key={u.user_id}
                  className="grid grid-cols-[1fr_1fr_80px_80px_80px_100px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors"
                >
                  {/* Name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {u.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{u.display_name}</span>
                  </div>

                  {/* Email */}
                  <span className="text-xs text-muted-foreground truncate">{u.email}</span>

                  {/* PRO */}
                  <div>
                    {u.is_pro ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium">PRO</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border/30">Free</span>
                    )}
                  </div>

                  {/* Ban status */}
                  <div>
                    {u.is_banned ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">Бан</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Stars */}
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-amber-400" />
                    <span className="text-sm font-medium text-foreground">{u.stars_balance}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {canGrantStars && (
                      <button
                        title="Начислить звёзды"
                        onClick={() => setConfirm({
                          title: `Начислить ⭐ для ${u.display_name}`,
                          desc: 'Введите причину начисления.',
                          action: async (reason) => {
                            await adminGrantStars(user!.id, u.user_id, 50, reason);
                            await fetchUsers();
                          }
                        })}
                        className="p-1.5 rounded-lg hover:bg-amber-400/10 text-amber-400/70 hover:text-amber-400 transition-colors"
                      >
                        <Star size={14} />
                      </button>
                    )}
                    {canManagePro && (
                      <button
                        title={u.is_pro ? 'Снять PRO' : 'Выдать PRO'}
                        onClick={() => setConfirm({
                          title: u.is_pro ? `Снять PRO у ${u.display_name}` : `Выдать PRO для ${u.display_name}`,
                          action: async (reason) => {
                            await adminSetPro(user!.id, u.user_id, !u.is_pro, reason);
                            await fetchUsers();
                          }
                        })}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors"
                      >
                        <Shield size={14} />
                      </button>
                    )}
                    {canBan && (
                      <button
                        title={u.is_banned ? 'Разбанить' : 'Заблокировать'}
                        onClick={() => setConfirm({
                          title: u.is_banned ? `Разблокировать ${u.display_name}` : `Заблокировать ${u.display_name}`,
                          action: async (reason) => {
                            await adminSetBan(user!.id, u.user_id, !u.is_banned, reason);
                            await fetchUsers();
                          }
                        })}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/admin/users/${u.user_id}`)}
                      className="p-1.5 rounded-lg hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          description={confirm.desc}
          requireReason
          onConfirm={async (reason) => {
            await confirm.action(reason ?? '');
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  );
}
