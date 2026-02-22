import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getAdminKPIs, getAuditLog, type AdminRole, type AuditEntry } from '@/lib/adminService';
import { AdminCardSkeleton } from '@/components/admin/AdminSkeletons';
import { Users, Star, Tag, CreditCard, Shield, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface KPIs {
  total_users: number;
  pro_users: number;
  active_7d: number;
  stars_granted: number;
  promo_used: number;
}

const ACTION_LABELS: Record<string, string> = {
  'stars.grant': '⭐ Начисление звёзд',
  'pro.manage': '🔑 Изменение PRO',
  'users.ban': '🚫 Блокировка',
  'users.unban': '✅ Разблокировка',
  'roles.manage': '🛡 Роль добавлена',
  'roles.remove': '🛡 Роль удалена',
};

export function AdminDashboard({ actorId, role }: { actorId: string; role: AdminRole }) {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAdminKPIs(actorId),
      getAuditLog({ limit: 10 }),
    ]).then(([k, a]) => {
      setKpis(k);
      setRecentAudit(a);
    }).finally(() => setLoading(false));
  }, [actorId]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Help banner */}
      <div className="bg-card border border-border/40 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <HelpCircle size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Как попасть в Admin Console</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Открой «Профиль» в приложении</li>
              <li>Нажми на версию приложения 7 раз</li>
              <li>Появится кнопка «Admin Console»</li>
              <li>Или открой напрямую: <code className="bg-secondary px-1 py-0.5 rounded text-primary">/admin</code></li>
            </ol>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <AdminCardSkeleton />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Пользователей', value: kpis?.total_users ?? 0, icon: Users, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
            { label: 'PRO', value: kpis?.pro_users ?? 0, icon: Shield, color: 'text-primary bg-primary/10 border-primary/20' },
            { label: 'Активных 7 дн.', value: kpis?.active_7d ?? 0, icon: CreditCard, color: 'text-green-400 bg-green-400/10 border-green-400/20' },
            { label: 'Звёзд выдано', value: (kpis?.stars_granted ?? 0).toLocaleString('ru'), icon: Star, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border/40 rounded-2xl p-5">
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${card.color}`}>
                <card.icon size={18} className={card.color.split(' ')[0]} />
              </div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent Audit */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Последние действия</h2>
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          {recentAudit.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Действий ещё не было</div>
          ) : (
            <div className="divide-y divide-border/20">
              {recentAudit.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg bg-accent/60 flex items-center justify-center text-sm shrink-0">
                    {ACTION_LABELS[e.action]?.[0] ?? '•'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{ACTION_LABELS[e.action] ?? e.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.actor_email} · {e.reason ?? '—'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(e.created_at), 'd MMM HH:mm', { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
