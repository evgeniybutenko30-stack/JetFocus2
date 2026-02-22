import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getPromoCodes, createPromoCode, togglePromoCode, type AdminRole, type PromoCode } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { Plus, RefreshCw, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const PROMO_TYPES = [
  { value: 'stars', label: '⭐ Звёзды бонусом' },
  { value: 'pro_days', label: '🔑 PRO на N дней' },
  { value: 'percent', label: '% Скидка' },
  { value: 'fixed', label: '₽ Фиксированная скидка' },
];

export default function AdminPromosPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'stars' as PromoCode['type'],
    value: '',
    expires_at: '',
    max_uses: '',
    is_active: true,
  });

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPromoCodes();
      setPromos(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const handleCreate = async () => {
    if (!user || !form.code || !form.value) return;
    await createPromoCode(user.id, {
      code: form.code.toUpperCase(),
      type: form.type,
      value: Number(form.value),
      expires_at: form.expires_at || null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      used_count: 0,
      rules_json: {},
      is_active: true,
    } as PromoCode);
    setShowCreate(false);
    fetchPromos();
  };

  const handleToggle = async (id: string, current: boolean) => {
    await togglePromoCode(id, !current);
    fetchPromos();
  };

  if (!role) return null;

  const canCreate = role === 'owner' || role === 'admin' || role === 'support';

  const TYPE_LABEL: Record<string, string> = {
    stars: '⭐ Звёзды',
    pro_days: '🔑 PRO дни',
    percent: '% Скидка',
    fixed: '₽ Фикс',
  };

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Промокоды</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{promos.length} кодов</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchPromos} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors">
              <RefreshCw size={16} />
            </button>
            {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                <Plus size={15} /> Создать
              </button>
            )}
          </div>
        </div>

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_80px_80px_80px_80px_60px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
            <span>Код</span>
            <span>Тип</span>
            <span>Значение</span>
            <span>Макс.</span>
            <span>Исп.</span>
            <span>Истекает</span>
            <span>Статус</span>
          </div>

          {loading ? (
            <AdminTableSkeleton rows={5} cols={7} />
          ) : promos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Промокодов нет</div>
          ) : (
            <div className="divide-y divide-border/20">
              {promos.map(p => (
                <div key={p.id} className="grid grid-cols-[1fr_100px_80px_80px_80px_80px_60px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                  <span className="text-sm font-mono font-semibold text-foreground">{p.code}</span>
                  <span className="text-xs text-muted-foreground">{TYPE_LABEL[p.type]}</span>
                  <span className="text-sm font-medium text-foreground">{p.value}</span>
                  <span className="text-sm text-muted-foreground">{p.max_uses ?? '∞'}</span>
                  <span className="text-sm text-muted-foreground">{p.used_count}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.expires_at ? format(new Date(p.expires_at), 'd MMM', { locale: ru }) : '∞'}
                  </span>
                  <button
                    onClick={() => handleToggle(p.id, p.is_active)}
                    className="flex items-center justify-center"
                  >
                    {p.is_active
                      ? <ToggleRight size={20} className="text-primary" />
                      : <ToggleLeft size={20} className="text-muted-foreground" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <h3 className="text-base font-semibold text-foreground">Новый промокод</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Код</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="JETFOCUS50"
                  className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Тип</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROMO_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(f => ({ ...f, type: t.value as PromoCode['type'] }))}
                      className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                        form.type === t.value
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent/60'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Значение</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Макс. активаций</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                    placeholder="∞"
                    className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Дата истечения</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground">
                  Отмена
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.code || !form.value}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
