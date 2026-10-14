import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, LogIn, Moon, Sun, Calendar, RefreshCw, Palette, Volume2, VolumeX, Sparkles, Globe, Eye, Link, Download, Upload, FileText, Bell, ChevronRight, Copy, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { supabase } from '@/lib/supabase';
import { buildPublicProfileUrl, safeImageSrc } from '@/lib/profile-utils';

interface PreviewData {
  status: string;
  city: string;
  interests: string[];
  likes: number;
  referrals: number;
}

const EMPTY_PREVIEW: PreviewData = { status: '', city: '', interests: [], likes: 0, referrals: 0 };

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-accent'}`}>
      <div className={`w-5 h-5 rounded-full bg-foreground transition-transform ${value ? 'ml-[18px]' : 'ml-0.5'}`} />
    </button>
  );
}

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const displayName = useAuthStore(s => s.displayName);
  const avatarUrl = useAuthStore(s => s.avatarUrl);
  const stars = useAuthStore(s => s.stars);
  const signOut = useAuthStore(s => s.signOut);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const [firstDay, setFirstDay] = useState('monday');
  const [soundEffects, setSoundEffects] = useState(true);
  const [confetti, setConfetti] = useState(true);
  const [language, setLanguage] = useState('ru');
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData>(EMPTY_PREVIEW);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  const userId = user?.id ?? null;
  const safeAvatar = safeImageSrc(avatarUrl);
  // Real in-app route (/profile/:userId), respecting the GitHub Pages base path.
  const profileLink = userId
    ? buildPublicProfileUrl(window.location.origin, import.meta.env.BASE_URL, userId)
    : '';

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Load the real public-profile data for the preview (it used to show hardcoded values).
  useEffect(() => {
    if (!showPreview || !userId) {
      setPreview(EMPTY_PREVIEW);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('post_likes').select('id, posts!inner(user_id)', { count: 'exact', head: true }).eq('posts.user_id', userId),
      supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('inviter_id', userId),
    ])
      .then(([profileRes, likesRes, refRes]) => {
        if (cancelled) return;
        const row = profileRes.data as { status?: string | null; city?: string | null; interests?: string[] | null } | null;
        setPreview({
          status: row?.status ?? '',
          city: row?.city ?? '',
          interests: Array.isArray(row?.interests) ? row.interests : [],
          likes: likesRes.count ?? 0,
          referrals: refRes.count ?? 0,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) console.error('Profile preview load failed:', err);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [showPreview, userId]);

  async function copyLink() {
    if (!profileLink) return;
    try {
      await navigator.clipboard.writeText(profileLink);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) toast.error('Не удалось выйти: ' + error);
      else toast.success('Вы вышли из аккаунта');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full fade-in space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">⚙ Профиль и Настройки</h1>
        </div>

        {/* User card */}
        <div className="glass-card p-4 flex items-center gap-3">
          <button onClick={() => navigate('/profile')} className="relative" aria-label="Открыть профиль">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary overflow-hidden">
              {safeAvatar ? <img src={safeAvatar} alt="" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px]">✏️</div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || 'Гостевой режим'}</p>
          </div>
          {user ? (
            <button onClick={handleSignOut} disabled={signingOut} className="px-3 py-1.5 border border-border rounded-lg text-xs flex items-center gap-1 text-destructive disabled:opacity-50 shrink-0">
              {signingOut ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Выйти
            </button>
          ) : (
            <button onClick={() => navigate('/auth')} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs flex items-center gap-1 shrink-0">
              <LogIn size={12} /> Войти
            </button>
          )}
        </div>

        {/* Sync */}
        <Section title="Синхронизация" icon={<RefreshCw size={14} className="text-primary" />}>
          <SettingRow icon={<RefreshCw size={14} />} title="История синхронизаций" subtitle="Всего синхронизаций: 0" />
        </Section>

        {/* Appearance */}
        <Section title="Оформление" icon={<Palette size={14} className="text-primary" />}>
          <div className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon size={18} className="text-yellow-400" /> : <Sun size={18} className="text-yellow-400" />}
              <div>
                <p className="text-sm font-medium">Тема</p>
                <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Тёмная' : 'Светлая'}</p>
              </div>
            </div>
            <div className="flex bg-secondary rounded-lg p-0.5">
              <button onClick={() => setTheme('light')} className={`px-3 py-1.5 text-xs rounded-md ${theme === 'light' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
                <Sun size={12} />
              </button>
              <button onClick={() => setTheme('dark')} className={`px-3 py-1.5 text-xs rounded-md ${theme === 'dark' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
                <Moon size={12} />
              </button>
            </div>
          </div>
        </Section>

        {/* Effects */}
        <Section title="Эффекты" icon={<Sparkles size={14} className="text-purple-400" />}>
          <div className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {soundEffects ? <Volume2 size={16} className="text-muted-foreground" /> : <VolumeX size={16} className="text-muted-foreground" />}
              <span className="text-sm">Звуковые эффекты</span>
            </div>
            <Toggle value={soundEffects} onChange={setSoundEffects} />
          </div>
          <div className="glass-card p-3 flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-muted-foreground" />
              <span className="text-sm">Анимация конфетти</span>
            </div>
            <Toggle value={confetti} onChange={setConfetti} />
          </div>
        </Section>

        {/* Public Profile */}
        <Section title="Публичный профиль" icon={<Eye size={14} className="text-blue-400" />}>
          <div className="glass-card p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Link size={14} className="text-muted-foreground shrink-0" />
              <input readOnly value={profileLink} placeholder="Войдите, чтобы получить ссылку" className="form-input flex-1 min-w-0 text-xs font-mono py-2" />
              <button onClick={copyLink} disabled={!profileLink} className="p-2 disabled:opacity-40" aria-label="Скопировать ссылку">
                {copied ? <CheckCircle size={14} className="text-primary" /> : <Copy size={14} className="text-muted-foreground" />}
              </button>
            </div>
            <button onClick={() => setShowPreview(true)} className="w-full py-2 border border-border rounded-xl text-xs font-medium flex items-center justify-center gap-1.5">
              <Eye size={12} /> Предпросмотр профиля
            </button>
          </div>
        </Section>

        {/* Backup */}
        <Section title="Резервное копирование" icon={<Download size={14} className="text-green-400" />}>
          <div className="space-y-2">
            <SettingRow icon={<RefreshCw size={14} />} title="Облачная синхронизация" subtitle="PRO функция" chevron />
            <SettingRow icon={<Download size={14} />} title="Сохранить данные на устройство" subtitle="Локальный бэкап" chevron />
            <SettingRow icon={<Upload size={14} />} title="Восстановить данные" subtitle="Из резервной копии" chevron />
          </div>
        </Section>

        {/* Personalization */}
        <Section title="Персонализация" icon={<Calendar size={14} className="text-[hsl(var(--accent-secondary))]" />}>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Calendar size={12} /> Первый день недели</p>
          <div className="flex bg-secondary rounded-lg p-0.5 mb-3">
            <button onClick={() => setFirstDay('monday')} className={`flex-1 py-2.5 text-xs font-medium rounded-md ${firstDay === 'monday' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>✓ Понедельник</button>
            <button onClick={() => setFirstDay('sunday')} className={`flex-1 py-2.5 text-xs font-medium rounded-md ${firstDay === 'sunday' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Воскресенье</button>
          </div>

          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Globe size={12} /> Язык</p>
          <div className="flex bg-secondary rounded-lg p-0.5">
            {[{ k: 'ru', l: '🇷🇺 Рус' }, { k: 'en', l: '🇬🇧 Eng' }, { k: 'es', l: '🇪🇸 Esp' }].map(lang => (
              <button key={lang.k} onClick={() => setLanguage(lang.k)}
                className={`flex-1 py-2 text-xs font-medium rounded-md ${language === lang.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {lang.l}
              </button>
            ))}
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Уведомления" icon={<Bell size={14} className="text-blue-400" />}>
          <button onClick={() => navigate('/notifications')} className="glass-card p-3 w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell size={16} className="text-muted-foreground" />
              <span className="text-sm">Настройки уведомлений</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </Section>

        {/* About */}
        <Section title="О приложении" icon={<FileText size={14} className="text-muted-foreground" />}>
          <div className="space-y-2">
            {[
              'Условия использования',
              'Политика конфиденциальности',
              'Обработка персональных данных',
              'Публичная оферта',
              'Помощь и поддержка',
              'Управление разрешениями',
            ].map(item => (
              <button key={item} className="glass-card p-3 w-full flex items-center justify-between">
                <span className="text-sm">{item}</span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </Section>

        <p className="text-[10px] text-muted-foreground text-center py-4">JetFocus v1.0.0 · 2024-2026</p>
      </div>

      {/* Profile Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary mx-auto mb-2 overflow-hidden">
                {safeAvatar ? <img src={safeAvatar} alt="" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-bold break-words">{displayName}</h3>
              {previewLoading && <Loader2 size={14} className="animate-spin text-primary mx-auto mt-1" />}
              {preview.status && <p className="text-xs text-muted-foreground">{preview.status}</p>}
              {preview.city && <p className="text-xs text-muted-foreground">{preview.city}</p>}
            </div>
            <div className="flex justify-center gap-4 text-xs">
              <div className="text-center"><p className="font-bold">{stars}</p><p className="text-muted-foreground">Звёзды</p></div>
              <div className="text-center"><p className="font-bold">{preview.likes}</p><p className="text-muted-foreground">Лайки</p></div>
              <div className="text-center"><p className="font-bold">{preview.referrals}</p><p className="text-muted-foreground">Рефералы</p></div>
            </div>
            {preview.interests.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center">
                {preview.interests.map(i => (
                  <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full">{i}</span>
                ))}
              </div>
            )}
            <button onClick={() => setShowPreview(false)} className="w-full py-2.5 bg-secondary rounded-xl text-sm font-medium">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold flex items-center gap-2 mb-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ icon, title, subtitle, chevron }: { icon: React.ReactNode; title: string; subtitle?: string; chevron?: boolean }) {
  return (
    <div className="glass-card p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">{icon}</div>
      <div className="flex-1"><p className="text-sm font-medium">{title}</p>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
      {chevron && <ChevronRight size={16} className="text-muted-foreground" />}
    </div>
  );
}
