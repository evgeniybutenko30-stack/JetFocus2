import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  adminErrorMessage,
  createPromoCode,
  formatAdminDate,
  getAdminPermissions,
  getPromoCodes,
  togglePromoCode,
  validatePromoForm,
  type PromoCode,
  type PromoFormValues,
  type PromoType,
} from '@/lib/adminService';
import { AdminGuard, type AdminContext } from '@/components/admin/AdminGuard';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { Plus, RefreshCw, X, ToggleLeft, ToggleRight } from 'lucide-react';

const PROMO_TYPE_OPTIONS: { value: PromoType; label: string }[] = [
  { value: 'stars', label: '⭐ Звёзды бонусом' },
  { value: 'pro_days', label: '🔑 PRO на N дней' },
  { value: 'percent', label: '% Скидка' },
  { value: 'fixed', label: '₽ Фиксированная скидка' },
];

const TYPE_LABEL: Record<PromoType, string> = {
  stars: '⭐ Звёзды',
  pro_days: '🔑 PRO дни',
  percent: '% Скидка',
  fixed: '₽ Фикс',
};

const EMPTY_FORM: PromoFormValues = {
  code: '',
  type: 'stars',
  value: '',
  expires_at: '',
  max_uses: '',
};

export default function AdminPromosPage() {
  return (
    <AdminGuard section="promos">
      {ctx => <AdminPromosContent {...ctx} />}
    </AdminGuard>
  );
}

function AdminPromosContent({ actorId, role }: AdminContext) {
  const { canManagePromos } = getAdminPermissions(role);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PromoFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(() => new Set());
  const creatingRef = useRef(false);
  const togglingRef = useRef<Set<string>>(new Set());
  const requestSeq = useRef(0);

  const fetchPromos = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getPromoCodes();
      if (seq === requestSeq.current) setPromos(data);
    } catch (e) {
      if (seq === requestSeq.current) setError(adminErrorMessage(e, 'Не удалось загрузить промокоды'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPromos(); }, [fetchPromos]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (creatingRef.current) return;
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (creatingRef.current) return;
    const checked = validatePromoForm(form);
    if (checked.error !== null) {
      setFormError(checked.error);
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setFormError(null);
    try {
      await createPromoCode(actorId, checked.value);
      toast.success(`Промокод ${checked.value.code} создан`);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      void fetchPromos();
    } catch (e) {
      setFormError(adminErrorMessage(e, 'Не удалось создать промокод'));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleToggle = async (promo: PromoCode) => {
    if (togglingRef.current.has(promo.id)) return;
    togglingRef.current.add(promo.id);
    setTogglingIds(new Set(togglingRef.current));
    try {
      await togglePromoCode(promo.id, !promo.is_active);
      setPromos(prev => prev.map(p => (p.id === promo.id ? { ...p, is_active: !promo.is_active } : p)));
      toast.success(promo.is_active ? `Промокод ${promo.code} выключен` : `Промокод ${promo.code} включён`);
    } catch (e) {
      toast.error(adminErrorMessage(e, 'Не удалось изменить промокод'));
    } finally {
      togglingRef.current.delete(promo.id);
      setTogglingIds(new Set(togglingRef.current));
    }
  };

  const canSubmit = !!form.code.trim() && !!form.value.trim() && !creating;

  return (
    <>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Промокоды</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{promos.length} кодов</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void fetchPromos()}
              disabled={loading}
              aria-label="Обновить"
              className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            </button>
            {canManagePromos && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                <Plus size={15} /> Создать
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
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
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {error ? 'Список недоступен' : 'Промокодов нет'}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {promos.map(p => (
                    <div key={p.id} className="grid grid-cols-[1fr_100px_80px_80px_80px_80px_60px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                      <span className="text-sm font-mono font-semibold text-foreground truncate">{p.code}</span>
                      <span className="text-xs text-muted-foreground">{TYPE_LABEL[p.type] ?? p.type}</span>
                      <span className="text-sm font-medium text-foreground">{p.value}</span>
                      <span className="text-sm text-muted-foreground">{p.max_uses ?? '∞'}</span>
                      <span className="text-sm text-muted-foreground">{p.used_count ?? 0}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.expires_at ? formatAdminDate(p.expires_at, 'd MMM yyyy') : '∞'}
                      </span>
                      <button
                        onClick={() => void handleToggle(p)}
                        disabled={!canManagePromos || togglingIds.has(p.id)}
                        aria-label={p.is_active ? `Выключить ${p.code}` : `Включить ${p.code}`}
                        className="flex items-center justify-center disabled:opacity-40"
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
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Новый промокод"
            className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <h3 className="text-base font-semibold text-foreground">Новый промокод</h3>
              <button onClick={closeCreate} disabled={creating} aria-label="Закрыть" className="text-muted-foreground hover:text-foreground disabled:opacity-40">
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
                  maxLength={32}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Тип</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROMO_TYPE_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
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
                    inputMode="decimal"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    maxLength={12}
                    className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Макс. активаций</label>
                  <input
                    inputMode="numeric"
                    value={form.max_uses}
                    onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                    placeholder="∞"
                    maxLength={9}
                    className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Дата истечения (включительно)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              {formError && (
                <div role="alert" className="px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeCreate}
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground disabled:opacity-40"
                >
                  Отмена
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={!canSubmit}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
                >
                  {creating ? 'Создание…' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
