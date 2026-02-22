import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, getAdminRoles, adminSetRole, adminRemoveRole, type AdminRole, type AdminRoleEntry } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const ROLES: AdminRole[] = ['admin', 'support', 'content', 'analyst'];
const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  support: 'Поддержка',
  content: 'Контент',
  analyst: 'Аналитик',
};
const ROLE_COLOR: Record<AdminRole, string> = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  admin: 'text-primary bg-primary/10 border-primary/20',
  support: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  content: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  analyst: 'text-muted-foreground bg-muted/30 border-border/40',
};

export default function AdminRolesPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [entries, setEntries] = useState<AdminRoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<AdminRole>('analyst');
  const [confirm, setConfirm] = useState<{ entry: AdminRoleEntry } | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminRoles();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  if (role !== 'owner') return null;

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Роли и доступы</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Управление командой администраторов</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchRoles} className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors">
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              <Plus size={15} /> Добавить
            </button>
          </div>
        </div>

        {/* Role descriptions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {([['owner', 'Полный контроль. Не удаляется.'], ['admin', 'Почти всё: пользователи, звёзды, промокоды.'], ['support', 'Просмотр + ограниченные начисления (≤100⭐).'], ['content', 'Модерация публикаций и контента.'], ['analyst', 'Только просмотр аналитики.']] as [AdminRole, string][]).map(([r, desc]) => (
            <div key={r} className="bg-card border border-border/40 rounded-xl p-3">
              <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium mb-2 ${ROLE_COLOR[r]}`}>
                {ROLE_LABEL[r]}
              </span>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        {/* Members table */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_1fr_60px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
            <span>User ID</span>
            <span>Роль</span>
            <span>Добавлен</span>
            <span></span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Нет записей</div>
          ) : (
            <div className="divide-y divide-border/20">
              {entries.map(e => (
                <div key={e.id} className="grid grid-cols-[1fr_120px_1fr_60px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                  <span className="text-xs font-mono text-muted-foreground truncate">{e.user_id}</span>
                  <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium w-fit ${ROLE_COLOR[e.role]}`}>
                    {ROLE_LABEL[e.role]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), 'd MMM yyyy', { locale: ru })}
                  </span>
                  {e.role !== 'owner' && (
                    <button
                      onClick={() => setConfirm({ entry: e })}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add admin modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Добавить администратора</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">User ID</label>
              <input
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                placeholder="uuid пользователя…"
                className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Роль</label>
              <div className="space-y-1.5">
                {ROLES.map(r => (
                  <button
                    key={r}
                    onClick={() => setAddRole(r)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      addRole === r
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-secondary border-border/40 text-foreground hover:bg-accent/60'
                    }`}
                  >
                    <span className="font-medium">{ROLE_LABEL[r]}</span>
                  </button>
                ))}
              </div>
            </div>
            <ConfirmModal
              title={`Назначить роль ${ROLE_LABEL[addRole]}`}
              requireReason
              onConfirm={async (reason) => {
                await adminSetRole(user!.id, addUserId, addRole, reason ?? '');
                setShowAdd(false);
                fetchRoles();
              }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        </div>
      )}

      {/* Remove confirm */}
      {confirm && (
        <ConfirmModal
          title={`Удалить роль ${ROLE_LABEL[confirm.entry.role]}`}
          description="Пользователь потеряет доступ к административным функциям."
          requireReason
          destructive
          onConfirm={async (reason) => {
            await adminRemoveRole(user!.id, confirm.entry.user_id, confirm.entry.role, reason ?? '');
            setConfirm(null);
            fetchRoles();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  );
}
