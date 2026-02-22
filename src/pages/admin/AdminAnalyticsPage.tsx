import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, type AdminRole } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { BarChart2, Users, TrendingUp } from 'lucide-react';

export default function AdminAnalyticsPage() {
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(r => setRole(r));
  }, [user]);

  if (!role) return null;

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Аналитика</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Статистика использования приложения</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'DAU / WAU / MAU', icon: Users, desc: 'Скоро будет доступно' },
            { label: 'Конверсия в PRO', icon: TrendingUp, desc: 'Скоро будет доступно' },
            { label: 'Использование промокодов', icon: BarChart2, desc: 'Скоро будет доступно' },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-3 py-10">
              <div className="w-10 h-10 rounded-xl bg-accent/60 flex items-center justify-center">
                <card.icon size={20} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{card.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border/40 rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Полная аналитика будет добавлена в следующем обновлении. Данные уже собираются через audit_log.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
