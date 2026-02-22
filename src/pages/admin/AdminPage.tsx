import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAdminRole, type AdminRole } from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminDashboard } from './sections/AdminDashboard';

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserAdminRole(user.id).then(r => {
      setRole(r);
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-2">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">Доступ запрещён</h1>
        <p className="text-sm text-muted-foreground">У вас нет прав для доступа к этому разделу</p>
        <button
          onClick={() => navigate('/today')}
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
        >
          Вернуться в приложение
        </button>
      </div>
    );
  }

  return (
    <AdminLayout role={role} actorEmail={user?.email ?? undefined}>
      <AdminDashboard actorId={user!.id} role={role} />
    </AdminLayout>
  );
}
