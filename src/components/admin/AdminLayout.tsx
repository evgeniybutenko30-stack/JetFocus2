import { ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Star, Tag, CreditCard, BarChart2,
  ShieldCheck, ScrollText, Settings, LogOut, ChevronRight, Shield
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessAdminSection, type AdminRole, type AdminSection } from '@/lib/adminService';
import { ADMIN_ROLE_COLOR, ADMIN_ROLE_LABEL } from '@/components/admin/adminRoleStyles';

interface AdminLayoutProps {
  children: ReactNode;
  role: AdminRole;
  actorEmail?: string;
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  section: AdminSection;
}

const NAV: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { path: '/admin/users', label: 'Пользователи', icon: Users, section: 'users' },
  { path: '/admin/stars', label: 'Звёзды', icon: Star, section: 'stars' },
  { path: '/admin/promos', label: 'Промокоды', icon: Tag, section: 'promos' },
  { path: '/admin/subscriptions', label: 'PRO подписки', icon: CreditCard, section: 'subscriptions' },
  { path: '/admin/analytics', label: 'Аналитика', icon: BarChart2, section: 'analytics' },
  { path: '/admin/roles', label: 'Роли и доступы', icon: ShieldCheck, section: 'roles' },
  { path: '/admin/audit', label: 'Аудит', icon: ScrollText, section: 'audit' },
  { path: '/admin/settings', label: 'Настройки', icon: Settings, section: 'settings' },
];

export function AdminLayout({ children, role, actorEmail }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const visibleNav = NAV.filter(n => canAccessAdminSection(role, n.section));
  const roleBadge = (
    <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-md border font-medium ${ADMIN_ROLE_COLOR[role]}`}>
      {ADMIN_ROLE_LABEL[role]}
    </span>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background font-sans">
      {/* Mobile top bar (the 240px sidebar does not fit a phone screen) */}
      <header className="md:hidden sticky top-0 z-40 border-b border-border/40 bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Shield size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-none">Admin Console</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{actorEmail ?? 'JetFocus'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {roleBadge}
            <button
              onClick={() => navigate('/today')}
              aria-label="Выйти в приложение"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Разделы консоли">
          {visibleNav.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border/40 flex-col bg-card/50">
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
            {roleBadge}
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
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
