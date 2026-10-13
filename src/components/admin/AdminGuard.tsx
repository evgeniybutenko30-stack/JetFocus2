import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import {
  adminErrorMessage,
  canAccessAdminSection,
  getUserAdminRole,
  type AdminRole,
  type AdminSection,
} from '@/lib/adminService';
import { AdminLayout } from '@/components/admin/AdminLayout';

export interface AdminContext {
  /** Signed-in user id — the only value ever passed as p_actor_id. */
  actorId: string;
  role: AdminRole;
}

interface AdminGuardProps {
  section: AdminSection;
  children: (ctx: AdminContext) => ReactNode;
}

type RoleState =
  | { status: 'loading'; userId: string | null }
  | { status: 'ready'; userId: string; role: AdminRole | null }
  | { status: 'error'; userId: string; message: string };

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-label="Загрузка">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AccessDenied({ message, fullScreen }: { message: string; fullScreen: boolean }) {
  const navigate = useNavigate();
  return (
    <div
      className={`${fullScreen ? 'min-h-screen' : 'min-h-[60vh]'} bg-background flex flex-col items-center justify-center gap-4 px-4 text-center`}
    >
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-2">
        <span className="text-2xl" aria-hidden>🚫</span>
      </div>
      <h1 className="text-xl font-bold text-foreground">Доступ запрещён</h1>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      <button
        onClick={() => navigate(fullScreen ? '/today' : '/admin')}
        className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
      >
        {fullScreen ? 'Вернуться в приложение' : 'На главную консоли'}
      </button>
    </div>
  );
}

function RoleCheckError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-2">
        <span className="text-2xl" aria-hidden>⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-foreground">Не удалось проверить доступ</h1>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
        >
          Повторить
        </button>
        <button
          onClick={() => navigate('/today')}
          className="px-5 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground hover:bg-accent/40"
        >
          Вернуться в приложение
        </button>
      </div>
    </div>
  );
}

/**
 * Per-page access gate for /admin/* routes: resolves the signed-in user's staff role,
 * renders loading / error / "Доступ запрещён" states and only mounts the page body
 * (and therefore its data requests) for roles allowed in that section.
 */
export function AdminGuard({ section, children }: AdminGuardProps) {
  const user = useAuthStore(s => s.user);
  const userId = user?.id ?? null;
  const [state, setState] = useState<RoleState>({ status: 'loading', userId: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading', userId });
    getUserAdminRole(userId).then(
      role => { if (!cancelled) setState({ status: 'ready', userId, role }); },
      (err: unknown) => {
        if (!cancelled) setState({ status: 'error', userId, message: adminErrorMessage(err, 'Не удалось проверить права доступа') });
      },
    );
    return () => { cancelled = true; };
  }, [userId, attempt]);

  if (!user || !userId) {
    return <AccessDenied fullScreen message="Войдите в аккаунт с правами администратора, чтобы открыть консоль" />;
  }

  // A state that belongs to another (previous) account is never used.
  if (state.status === 'loading' || state.userId !== userId) return <FullScreenSpinner />;

  if (state.status === 'error') {
    return <RoleCheckError message={state.message} onRetry={() => setAttempt(a => a + 1)} />;
  }

  if (!state.role) {
    return <AccessDenied fullScreen message="У вас нет прав для доступа к этому разделу" />;
  }

  const email = user.email ?? undefined;
  if (!canAccessAdminSection(state.role, section)) {
    return (
      <AdminLayout role={state.role} actorEmail={email}>
        <AccessDenied fullScreen={false} message="Ваша роль не даёт доступа к этому разделу консоли" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout role={state.role} actorEmail={email}>
      {children({ actorId: userId, role: state.role })}
    </AdminLayout>
  );
}
