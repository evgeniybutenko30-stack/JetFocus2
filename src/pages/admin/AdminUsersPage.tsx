import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  ADMIN_SEARCH_MAX,
  ADMIN_USERS_MAX_LIMIT,
  ADMIN_USERS_PAGE_SIZE,
  AdminServiceError,
  adminErrorMessage,
  adminGrantStars,
  adminSetBan,
  adminSetPro,
  getAdminPermissions,
  getAdminUsers,
  mergeUniqueUsers,
  parseStarsDelta,
  type AdminUser,
} from '@/lib/adminService';
import { AdminGuard, type AdminContext } from '@/components/admin/AdminGuard';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { Search, Star, Shield, Ban, Copy, RefreshCw } from 'lucide-react';

type PendingAction =
  | { kind: 'stars'; user: AdminUser }
  | { kind: 'pro'; user: AdminUser }
  | { kind: 'ban'; user: AdminUser };

const DEFAULT_STARS_AMOUNT = '50';

export default function AdminUsersPage() {
  return (
    <AdminGuard section="users">
      {ctx => <AdminUsersContent {...ctx} />}
    </AdminGuard>
  );
}

function AdminUsersContent({ actorId, role }: AdminContext) {
  const { canGrantStars, canManagePro, canBan } = getAdminPermissions(role);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [proFilter, setProFilter] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [starsAmount, setStarsAmount] = useState(DEFAULT_STARS_AMOUNT);

  // Only the latest request may update the list (typing fast / switching filters).
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = useCallback(async (opts: { offset: number; limit: number; append: boolean }) => {
    const seq = ++requestSeq.current;
    if (opts.append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await getAdminUsers(actorId, {
        search: debouncedSearch || undefined,
        isPro: proFilter,
        limit: opts.limit,
        offset: opts.offset,
      });
      if (seq !== requestSeq.current) return;
      setUsers(prev => (opts.append ? mergeUniqueUsers(prev, page) : page));
      setHasMore(page.length === opts.limit);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      if (!opts.append) {
        setUsers([]);
        setHasMore(false);
      }
      setError(adminErrorMessage(e, 'Не удалось загрузить пользователей'));
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [actorId, debouncedSearch, proFilter]);

  useEffect(() => {
    void loadUsers({ offset: 0, limit: ADMIN_USERS_PAGE_SIZE, append: false });
  }, [loadUsers]);

  /** Reloads everything currently shown (after an action or on the refresh button). */
  const loadedCount = users.length;
  const refresh = useCallback(() => {
    const limit = Math.min(Math.max(loadedCount, ADMIN_USERS_PAGE_SIZE), ADMIN_USERS_MAX_LIMIT);
    void loadUsers({ offset: 0, limit, append: false });
  }, [loadUsers, loadedCount]);

  const loadMore = () => {
    if (loading || loadingMore) return;
    void loadUsers({ offset: users.length, limit: ADMIN_USERS_PAGE_SIZE, append: true });
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('ID пользователя скопирован');
    } catch {
      toast.error('Не удалось скопировать ID');
    }
  };

  const openStars = (u: AdminUser) => {
    setStarsAmount(DEFAULT_STARS_AMOUNT);
    setPending({ kind: 'stars', user: u });
  };

  const starsCheck = parseStarsDelta(starsAmount, role);

  const runPending = async (reason?: string) => {
    if (!pending) return;
    const u = pending.user;
    const why = reason ?? '';
    if (pending.kind === 'stars') {
      const parsed = parseStarsDelta(starsAmount, role);
      if (parsed.error !== null) throw new AdminServiceError(parsed.error);
      await adminGrantStars(actorId, u.user_id, parsed.value, why);
      toast.success(`${parsed.value > 0 ? 'Начислено' : 'Списано'} ${Math.abs(parsed.value)} ⭐ — ${u.display_name}`);
    } else if (pending.kind === 'pro') {
      await adminSetPro(actorId, u.user_id, !u.is_pro, why);
      toast.success(u.is_pro ? `PRO снят — ${u.display_name}` : `PRO выдан — ${u.display_name}`);
    } else {
      await adminSetBan(actorId, u.user_id, !u.is_banned, why);
      toast.success(u.is_banned ? `${u.display_name} разблокирован(а)` : `${u.display_name} заблокирован(а)`);
    }
    setPending(null);
    refresh();
  };

  const modalTitle = !pending
    ? ''
    : pending.kind === 'stars'
      ? `Начислить ⭐ для ${pending.user.display_name}`
      : pending.kind === 'pro'
        ? (pending.user.is_pro ? `Снять PRO у ${pending.user.display_name}` : `Выдать PRO для ${pending.user.display_name}`)
        : (pending.user.is_banned ? `Разблокировать ${pending.user.display_name}` : `Заблокировать ${pending.user.display_name}`);

  const destructiveAction = !!pending && (
    (pending.kind === 'pro' && pending.user.is_pro) || (pending.kind === 'ban' && !pending.user.is_banned)
  );

  return (
    <>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Пользователи</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {hasMore ? `Показано ${users.length}` : `${users.length} записей`}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Обновить"
            className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              maxLength={ADMIN_SEARCH_MAX}
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
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_80px_80px_80px_110px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
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
                  {error ? 'Список недоступен' : 'Пользователи не найдены'}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {users.map(u => (
                    <div
                      key={u.user_id}
                      className="grid grid-cols-[1fr_1fr_80px_80px_80px_110px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors"
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
                        <span className="text-sm font-medium text-foreground">{u.stars_balance ?? 0}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {canGrantStars && (
                          <button
                            title="Начислить звёзды"
                            aria-label="Начислить звёзды"
                            onClick={() => openStars(u)}
                            className="p-1.5 rounded-lg hover:bg-amber-400/10 text-amber-400/70 hover:text-amber-400 transition-colors"
                          >
                            <Star size={14} />
                          </button>
                        )}
                        {canManagePro && (
                          <button
                            title={u.is_pro ? 'Снять PRO' : 'Выдать PRO'}
                            aria-label={u.is_pro ? 'Снять PRO' : 'Выдать PRO'}
                            onClick={() => setPending({ kind: 'pro', user: u })}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary/70 hover:text-primary transition-colors"
                          >
                            <Shield size={14} />
                          </button>
                        )}
                        {canBan && (
                          <button
                            title={u.is_banned ? 'Разбанить' : 'Заблокировать'}
                            aria-label={u.is_banned ? 'Разбанить' : 'Заблокировать'}
                            onClick={() => setPending({ kind: 'ban', user: u })}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        <button
                          title="Скопировать ID пользователя"
                          aria-label="Скопировать ID пользователя"
                          onClick={() => void copyId(u.user_id)}
                          className="p-1.5 rounded-lg hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {!loading && hasMore && (
          <div className="flex justify-center mt-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 rounded-xl border border-border/40 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
            >
              {loadingMore ? 'Загрузка…' : 'Показать ещё'}
            </button>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {pending && (
        <ConfirmModal
          title={modalTitle}
          description={pending.kind === 'stars' ? 'Укажите количество и причину начисления.' : undefined}
          requireReason
          destructive={destructiveAction}
          confirmDisabled={pending.kind === 'stars' && starsCheck.error !== null}
          validationMessage={pending.kind === 'stars' ? starsCheck.error : null}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        >
          {pending.kind === 'stars' && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Количество ⭐</label>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                value={starsAmount}
                onChange={e => setStarsAmount(e.target.value)}
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Отрицательное число — списание.</p>
            </div>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
