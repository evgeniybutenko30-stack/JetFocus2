import { useNavigate } from 'react-router-dom';
import { Bell, ScrollText, Users, Globe, Trophy, Sun, Moon, Gift, LogIn, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { useState, useEffect } from 'react';
import { safeImageSrc } from '@/lib/profile-utils';

export function AppHeader() {
  const navigate = useNavigate();
  const session = useAuthStore(s => s.session);
  const displayName = useAuthStore(s => s.displayName);
  const avatarUrl = safeImageSrc(useAuthStore(s => s.avatarUrl));
  const { theme, toggle } = useThemeStore();
  const initials = (displayName || 'Г').charAt(0).toUpperCase();

  // Countdown: 24h from page load for guest promo banner
  const [seconds, setSeconds] = useState(24 * 60 * 60 - 1);
  useEffect(() => {
    if (session) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [session]);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');

  const icons = [
    { icon: Bell, path: '/notifications', badge: 1 },
    { icon: ScrollText, path: '/news' },
    { icon: Users, path: '/social' },
    { icon: Globe, path: '/catalog' },
    { icon: Trophy, path: '/rating' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/20">
      {/* Guest promo banner */}
      {!session && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/20">
          <Sparkles size={16} className="text-primary shrink-0" />
          <span className="text-xs text-primary font-medium flex-1 truncate">
            PRO бесплатно: {hh}ч {mm}м. Данные сохранятся при входе
          </span>
          <button
            onClick={() => navigate('/auth')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shrink-0"
          >
            <LogIn size={13} />
            Войти
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-14">
      <button onClick={() => navigate('/profile')} aria-label="Профиль" className="w-9 h-9 shrink-0 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-semibold text-primary overflow-hidden">
        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
      </button>
      <div className="flex items-center gap-0.5">
        {icons.map(({ icon: Icon, path, badge }) => (
          <button key={path} onClick={() => navigate(path)} className="relative p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground">
            <Icon size={18} />
            {badge && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive rounded-full text-[9px] flex items-center justify-center text-white font-bold">{badge}</span>
            )}
          </button>
        ))}
        <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={() => navigate('/pro')} className="ml-1 px-2.5 py-1.5 bg-[hsl(var(--accent-secondary))] rounded-lg">
          <Gift size={16} className="text-white" />
        </button>
      </div>
      </div>
    </header>
  );
}
