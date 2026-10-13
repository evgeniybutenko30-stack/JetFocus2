import { useEffect, useState, useCallback, useRef } from 'react';
import {
  adminErrorMessage,
  formatAdminDate,
  formatAuditTarget,
  getAuditLog,
  type AuditEntry,
} from '@/lib/adminService';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminTableSkeleton } from '@/components/admin/AdminSkeletons';
import { RefreshCw } from 'lucide-react';

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
  return (
    <AdminGuard section="audit">
      {() => <AdminAuditContent />}
    </AdminGuard>
  );
}

function AdminAuditContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const requestSeq = useRef(0);

  const fetchAudit = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLog({ limit: 200 });
      if (seq === requestSeq.current) setEntries(data);
    } catch (e) {
      if (seq === requestSeq.current) setError(adminErrorMessage(e, 'Не удалось загрузить аудит-лог'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAudit(); }, [fetchAudit]);

  const filtered = filter ? entries.filter(e => e.action === filter) : entries;

  return (
    <>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Аудит-лог</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Неизменяемый журнал всех действий</p>
          </div>
          <button
            onClick={() => void fetchAudit()}
            disabled={loading}
            aria-label="Обновить"
            className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
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

        {error && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
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
                <div className="py-16 text-center text-sm text-muted-foreground">{error ? 'Журнал недоступен' : 'Записей нет'}</div>
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
                        <span className="text-xs font-mono text-muted-foreground truncate" title={e.target_id ?? undefined}>
                          {formatAuditTarget(e)}
                        </span>
                        <span className="text-xs text-muted-foreground truncate" title={e.reason ?? undefined}>{e.reason || '—'}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatAdminDate(e.created_at, 'd MMM HH:mm')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
