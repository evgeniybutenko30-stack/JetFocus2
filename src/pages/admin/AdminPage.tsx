import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminDashboard } from './sections/AdminDashboard';

export default function AdminPage() {
  return (
    <AdminGuard section="dashboard">
      {({ actorId, role }) => <AdminDashboard actorId={actorId} role={role} />}
    </AdminGuard>
  );
}
