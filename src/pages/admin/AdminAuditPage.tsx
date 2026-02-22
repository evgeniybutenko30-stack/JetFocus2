import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getAuditLog, type AdminRole, type AuditEntry } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'stars.grant': { label: '⭐ Начисление звёзд', color: 'text-amber-400' },
  'stars.revoke': { label: '⭐ Списание звёзд', color: 'text-red-400' },
  'pro.manage': { label: '🔑 Изменение PRO', color: 'text-primary' },
  'users.ban': { label: '🚫 Блокировка', color: 'text-destructive' },
  'users.unban': { label: '✅ Разблокировка', color: 'text-green-400' },
  'roles.manage': { label: '🛡 Изменение ролей', color: 'text-purple-400' },
  'roles.remove': { label: '🛡 Удаление роли', color: 'text-orange-400' },
};

export default function AdminAuditPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLog({ limit: 200 });
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  if (!role) return null;

  const filtered = filter
    ? entries.filter(e => e.action === filter || e.actor_email?.includes(filter))
    : entries;

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Аудит-лог</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Неизменяемый журнал всех действий</p>
          </div>
          <button onClick={fetchAudit} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          <button
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${!filter ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent/60'}`}
          >
            Все
          </button>
          {Object.entries(ACTION_LABELS).map(([action, meta]) => (
            <button
              key={action}
              onClick={() => setFilter(action)}
              className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${filter === action ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent/60'}`}
            >
              {meta.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_120px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
            <span>Действие</span>
            <span>Администратор</span>
            <span>Объект</span>
            <span>Причина</span>
            <span>Дата</span>
          </div>

          {loading ? (
            <AdminTableSkeleton rows={10} cols={5} />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Записей нет</div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map(e => {
                const meta = ACTION_LABELS[e.action];
                return (
                  <div key={e.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_120px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                    <span className={`text-xs font-medium ${meta?.color ?? 'text-foreground'}`}>
                      {meta?.label ?? e.action}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{e.actor_email ?? '—'}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {e.target_type}/{e.target_id?.slice(0, 8)}…
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{e.reason ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.created_at), 'd MMM HH:mm', { locale: ru })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
