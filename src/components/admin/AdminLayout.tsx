import { ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Star, Tag, CreditCard, BarChart2,
  ShieldCheck, ScrollText, Settings, LogOut, ChevronRight, Shield
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminRole } from '@/lib/adminService';

interface AdminLayoutProps {
  children: ReactNode;
  role: AdminRole;
  actorEmail?: string;
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: AdminRole[];
}

const NAV: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'support', 'content', 'analyst'] },
  { path: '/admin/users', label: 'Пользователи', icon: Users, roles: ['owner', 'admin', 'support'] },
  { path: '/admin/stars', label: 'Звёзды', icon: Star, roles: ['owner', 'admin', 'support'] },
  { path: '/admin/promos', label: 'Промокоды', icon: Tag, roles: ['owner', 'admin', 'support'] },
  { path: '/admin/subscriptions', label: 'PRO подписки', icon: CreditCard, roles: ['owner', 'admin'] },
  { path: '/admin/analytics', label: 'Аналитика', icon: BarChart2, roles: ['owner', 'admin', 'analyst'] },
  { path: '/admin/roles', label: 'Роли и доступы', icon: ShieldCheck, roles: ['owner'] },
  { path: '/admin/audit', label: 'Аудит', icon: ScrollText, roles: ['owner', 'admin'] },
  { path: '/admin/settings', label: 'Настройки', icon: Settings, roles: ['owner'] },
];

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

export function AdminLayout({ children, role, actorEmail }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const visibleNav = NAV.filter(n => n.roles.includes(role));

  return (
    <div className="flex min-h-screen bg-background font-sans">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border/40 flex flex-col bg-card/50">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-none">Admin Console</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">JetFocus</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {visibleNav.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
              >
                <item.icon size={16} className={isActive ? 'text-primary' : undefined} />
                {item.label}
                {isActive && <ChevronRight size={14} className="ml-auto text-primary/60" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-3 py-3 border-t border-border/40 space-y-1.5">
          <div className="px-3 py-2.5 rounded-xl bg-accent/40">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {actorEmail?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <p className="text-xs text-foreground font-medium truncate flex-1">{actorEmail}</p>
            </div>
            <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium ${ROLE_COLOR[role]}`}>
              {ROLE_LABEL[role]}
            </span>
          </div>
          <button
            onClick={() => navigate('/today')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <LogOut size={14} />
            Выйти в приложение
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
