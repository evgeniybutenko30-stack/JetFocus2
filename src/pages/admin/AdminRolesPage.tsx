import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  AdminServiceError,
  adminErrorMessage,
  adminRemoveRole,
  adminSetRole,
  formatAdminDate,
  getAdminRoles,
  isUuid,
  type AdminRole,
  type AdminRoleEntry,
} from '@/lib/adminService';
import { AdminGuard, type AdminContext } from '@/components/admin/AdminGuard';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { ADMIN_ROLE_LABEL, adminRoleColor, adminRoleLabel } from '@/components/admin/adminRoleStyles';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

const ASSIGNABLE_ROLES: AdminRole[] = ['admin', 'support', 'content', 'analyst'];

const ROLE_DESCRIPTIONS: [AdminRole, string][] = [
  ['owner', 'Полный контроль. Не удаляется.'],
  ['admin', 'Почти всё: пользователи, звёзды, промокоды.'],
  ['support', 'Просмотр + ограниченные начисления (≤100⭐).'],
  ['content', 'Модерация публикаций и контента.'],
  ['analyst', 'Только просмотр аналитики.'],
];

export default function AdminRolesPage() {
  return (
    <AdminGuard section="roles">
      {ctx => <AdminRolesContent {...ctx} />}
    </AdminGuard>
  );
}

function AdminRolesContent({ actorId }: AdminContext) {
  const [entries, setEntries] = useState<AdminRoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<AdminRole>('analyst');
  const [confirm, setConfirm] = useState<{ entry: AdminRoleEntry } | null>(null);
  const requestSeq = useRef(0);

  const fetchRoles = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminRoles();
      if (seq === requestSeq.current) setEntries(data);
    } catch (e) {
      if (seq === requestSeq.current) setError(adminErrorMessage(e, 'Не удалось загрузить роли'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRoles(); }, [fetchRoles]);

  const openAdd = () => {
    setAddUserId('');
    setAddRole('analyst');
    setShowAdd(true);
  };

  const targetId = addUserId.trim();
  const addError = !isUuid(targetId) ? 'Введите корректный User ID (UUID)' : null;

  const handleAdd = async (reason?: string) => {
    if (!isUuid(targetId)) throw new AdminServiceError('Введите корректный User ID (UUID)');
    await adminSetRole(actorId, targetId, addRole, reason ?? '');
    toast.success(`Роль «${ADMIN_ROLE_LABEL[addRole]}» назначена`);
    setShowAdd(false);
    void fetchRoles();
  };

  const handleRemove = async (reason?: string) => {
    if (!confirm) return;
    const { entry } = confirm;
    await adminRemoveRole(actorId, entry.user_id, entry.role, reason ?? '');
    toast.success(`Роль «${adminRoleLabel(entry.role)}» удалена`);
    setConfirm(null);
    void fetchRoles();
  };

  return (
    <>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Роли и доступы</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Управление командой администраторов</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void fetchRoles()}
              disabled={loading}
              aria-label="Обновить"
              className="p-2 rounded-xl border border-border/40 text-muted-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              <Plus size={15} /> Добавить
            </button>
          </div>
        </div>

        {/* Role descriptions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {ROLE_DESCRIPTIONS.map(([r, desc]) => (
            <div key={r} className="bg-card border border-border/40 rounded-xl p-3">
              <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium mb-2 ${adminRoleColor(r)}`}>
                {adminRoleLabel(r)}
              </span>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
        )}

        {/* Members table */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1fr_120px_1fr_60px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-medium text-muted-foreground">
                <span>User ID</span>
                <span>Роль</span>
                <span>Добавлен</span>
                <span></span>
              </div>

              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
              ) : entries.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {error ? 'Список недоступен' : 'Нет записей'}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {entries.map(e => (
                    <div key={e.id} className="grid grid-cols-[1fr_120px_1fr_60px] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground truncate" title={e.user_id}>
                        {e.user_id}{e.user_id === actorId ? ' (вы)' : ''}
                      </span>
                      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium w-fit ${adminRoleColor(e.role)}`}>
                        {adminRoleLabel(e.role)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatAdminDate(e.created_at, 'd MMM yyyy')}
                      </span>
                      {e.role !== 'owner' ? (
                        <button
                          onClick={() => setConfirm({ entry: e })}
                          aria-label={`Удалить роль ${adminRoleLabel(e.role)}`}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add admin dialog (fields live inside the dialog so they stay usable) */}
      {showAdd && (
        <ConfirmModal
          title="Добавить администратора"
          description={`Будет назначена роль «${ADMIN_ROLE_LABEL[addRole]}».`}
          requireReason
          confirmDisabled={addError !== null}
          validationMessage={targetId ? addError : null}
          confirmLabel="Назначить"
          onConfirm={handleAdd}
          onCancel={() => setShowAdd(false)}
        >
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">User ID</label>
            <input
              value={addUserId}
              onChange={e => setAddUserId(e.target.value)}
              placeholder="uuid пользователя…"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground mt-1">ID можно скопировать в разделе «Пользователи».</p>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Роль</label>
            <div className="space-y-1.5">
              {ASSIGNABLE_ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAddRole(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    addRole === r
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-secondary border-border/40 text-foreground hover:bg-accent/60'
                  }`}
                >
                  <span className="font-medium">{ADMIN_ROLE_LABEL[r]}</span>
                </button>
              ))}
            </div>
          </div>
        </ConfirmModal>
      )}

      {/* Remove confirm */}
      {confirm && (
        <ConfirmModal
          title={`Удалить роль ${adminRoleLabel(confirm.entry.role)}`}
          description="Пользователь потеряет доступ к административным функциям."
          requireReason
          destructive
          onConfirm={handleRemove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
