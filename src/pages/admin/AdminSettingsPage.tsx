import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, type AdminRole } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Settings } from 'lucide-react';

export default function AdminSettingsPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  if (role !== 'owner') return null;

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Настройки системы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Системные параметры приложения</p>
        </div>

        <div className="space-y-4">
          {[
            { label: 'Максимальное начисление ⭐ (support)', desc: 'Максимум звёзд за одну операцию для роли support', value: '100' },
            { label: 'Лимит промокодов на пользователя', desc: 'Максимальное количество промокодов на одного пользователя', value: '3' },
            { label: 'Вес реферала в рейтинге', desc: 'Множитель для рефералов при подсчёте рейтинга', value: '1' },
          ].map(setting => (
            <div key={setting.label} className="bg-card border border-border/40 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{setting.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{setting.desc}</p>
                </div>
                <input
                  defaultValue={setting.value}
                  type="number"
                  className="w-20 bg-secondary border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground text-right outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <button className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
