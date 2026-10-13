import { AdminGuard } from '@/components/admin/AdminGuard';
import { SUPPORT_MAX_STARS_PER_GRANT } from '@/lib/adminService';

export default function AdminSettingsPage() {
  return (
    <AdminGuard section="settings">
      {() => <AdminSettingsContent />}
    </AdminGuard>
  );
}

/**
 * Read-only for now: these limits are enforced by the database (see
 * supabase/migrations/20261013_security_hardening.sql) and there is no settings table/RPC
 * to persist changes, so the page must not pretend it can save them.
 */
function AdminSettingsContent() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Настройки системы</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Системные параметры приложения</p>
      </div>

      <div className="space-y-4">
        {[
          { label: 'Максимальное начисление ⭐ (support)', desc: 'Максимум звёзд за одну операцию для роли support', value: String(SUPPORT_MAX_STARS_PER_GRANT) },
          { label: 'Лимит промокодов на пользователя', desc: 'Максимальное количество промокодов на одного пользователя', value: '3' },
          { label: 'Вес реферала в рейтинге', desc: 'Множитель для рефералов при подсчёте рейтинга', value: '1' },
        ].map(setting => (
          <div key={setting.label} className="bg-card border border-border/40 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{setting.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{setting.desc}</p>
              </div>
              <input
                value={setting.value}
                readOnly
                disabled
                aria-label={setting.label}
                className="w-20 shrink-0 bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground text-right outline-none disabled:opacity-70"
              />
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground pt-2">
          Значения заданы на сервере. Изменение параметров из консоли будет доступно в следующем обновлении.
        </p>
      </div>
    </div>
  );
}
