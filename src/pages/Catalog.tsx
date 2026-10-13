import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, X, HelpCircle, ChevronDown, RefreshCw } from 'lucide-react';
import { useFullAccess } from '@/hooks/use-full-access';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { ProPaywall } from '@/components/ProPaywall';
import { safeImageSrc } from '@/lib/profile-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: string | null;
  interests: string[] | null;
  city: string | null;
  tagline: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'Студент', 'Предприниматель', 'Сотрудник', 'Фрилансер',
  'Менеджер', 'Разработчик', 'Дизайнер', 'Другое',
];

const INTEREST_OPTIONS = [
  'Бизнес', 'Кулинария', 'Маркетинг', 'Продуктивность', 'Путешествия', 'Саморазвитие',
];

const ONBOARDING_SLIDES = [
  { emoji: '🌐', title: 'Найди сильное окружение', text: 'Каталог помогает находить людей по статусу и интересам — для общения, коллабораций и роста.' },
  { emoji: '🔍', title: 'Фильтры и поиск', text: 'Выбирай статус и интересы — и находи релевантных людей за секунды.' },
  { emoji: '✅', title: 'Только реальные пользователи', text: 'В каталоге показываются только настоящие люди с заполненными профилями. Никаких ботов и фейков.' },
  { emoji: '👋', title: 'Открой профиль и знакомься', text: 'Нажми на карточку, чтобы открыть профиль и понять, чем человек может быть полезен.' },
];

const ONBOARDING_KEY = 'onboarding_seen_users_catalog';
const SEARCH_MAX = 60;

/** localStorage can throw (blocked storage / private mode): never let that break the page. */
function readFlag(key: string): boolean {
  try { return !!localStorage.getItem(key); } catch { return true; }
}
function writeFlag(key: string): void {
  try { localStorage.setItem(key, 'true'); } catch { /* storage unavailable */ }
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = imgFailed ? undefined : safeImageSrc(url);
  const initials = name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const colors = [
    'from-[hsl(var(--sphere-health))] to-[hsl(var(--sphere-development))]',
    'from-[hsl(var(--sphere-career))] to-[hsl(var(--primary))]',
    'from-[hsl(var(--accent-secondary))] to-[hsl(var(--sphere-finance))]',
    'from-[hsl(var(--sphere-relationships))] to-[hsl(var(--sphere-family))]',
    'from-[hsl(var(--accent-tertiary))] to-[hsl(var(--sphere-spirituality))]',
  ];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  const sz = size === 'sm' ? 'w-10 h-10 text-xs' : 'w-14 h-14 text-sm';
  if (src) {
    return <img src={src} alt={name} className={`${sz} rounded-2xl object-cover shrink-0`} onError={() => setImgFailed(true)} />;
  }
  return <div className={`${sz} rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center font-bold text-white shrink-0`}>{initials}</div>;
}

// ─── User Card ───────────────────────────────────────────────────────────────

function UserCard({ user, onClick }: { user: CatalogUser; onClick: () => void }) {
  const interests = user.interests ?? [];
  const shown = interests.slice(0, 3);
  const extra = interests.length - shown.length;
  return (
    <button onClick={onClick} className="w-full text-left p-4 rounded-2xl bg-card border border-border/50 hover:border-border active:scale-[0.99] transition-all duration-150 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar name={user.display_name} url={user.avatar_url} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.display_name}</p>
              {user.tagline && <p className="text-xs text-muted-foreground truncate mt-0.5">{user.tagline}</p>}
            </div>
            {user.status && <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground border border-border/40 shrink-0">{user.status}</span>}
          </div>
          {user.city && <p className="text-xs text-muted-foreground mb-2">{user.city}</p>}
          {shown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {shown.map(interest => <span key={interest} className="text-[10px] px-2 py-0.5 rounded-lg bg-accent text-accent-foreground border border-border/30">{interest}</span>)}
              {extra > 0 && <span className="text-[10px] px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">+{extra}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function CardSkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-start gap-3">
        <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
          <div className="flex gap-1.5 mt-2"><Skeleton className="h-5 w-16 rounded-lg" /><Skeleton className="h-5 w-14 rounded-lg" /></div>
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const slide = ONBOARDING_SLIDES[step];
  const isLast = step === ONBOARDING_SLIDES.length - 1;
  const finish = () => { writeFlag(ONBOARDING_KEY); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border/40 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex gap-1.5">{ONBOARDING_SLIDES.map((_, i) => <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`} />)}</div>
          <button onClick={finish} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-6 text-center">
          <div className="text-5xl mb-5">{slide.emoji}</div>
          <h2 className="text-xl font-bold text-foreground mb-3">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{slide.text}</p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          {!isLast ? (
            <>
              <button onClick={finish} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">Пропустить</button>
              <button onClick={() => setStep(s => s + 1)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-colors">Далее</button>
            </>
          ) : (
            <button onClick={finish} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-colors">Начать</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const navigate = useNavigate();
  const { hasAccess } = useFullAccess();
  const fetchSeq = useRef(0);

  const [users, setUsers] = useState<CatalogUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [activeInterests, setActiveInterests] = useState<string[]>([]);
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [showInterestDrop, setShowInterestDrop] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (!readFlag(ONBOARDING_KEY)) setShowOnboarding(true); }, []);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    // Typing / toggling filters fires several requests: only the latest may update the list.
    const requestId = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('user_profiles').select('user_id, display_name, avatar_url, status, interests, city, tagline').not('display_name', 'is', null);
      // Escape LIKE wildcards so "%" / "_" in the search are matched literally.
      const term = debouncedSearch.trim().slice(0, SEARCH_MAX).replace(/[\\%_]/g, m => `\\${m}`);
      if (term) query = query.ilike('display_name', `%${term}%`);
      if (activeStatus) query = query.eq('status', activeStatus);
      if (activeInterests.length > 0) query = query.overlaps('interests', activeInterests);
      const { data, error: err } = await query.limit(50);
      if (requestId !== fetchSeq.current) return;
      if (err) throw err;
      setUsers(((data ?? []) as CatalogUser[]).filter(u => u.display_name?.trim()));
    } catch {
      if (requestId !== fetchSeq.current) return;
      setError('Не удалось загрузить пользователей');
    } finally {
      if (requestId === fetchSeq.current) setLoading(false);
    }
  }, [debouncedSearch, activeStatus, activeInterests]);

  useEffect(() => { if (hasAccess) fetchUsers(); }, [fetchUsers, hasAccess]);

  // PRO gate — show paywall while loading or if no access
  if (hasAccess === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!hasAccess) {
    return <ProPaywall />;
  }

  const resetFilters = () => { setSearch(''); setActiveStatus(null); setActiveInterests([]); };
  const toggleInterest = (i: string) => setActiveInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  const hasFilters = !!activeStatus || activeInterests.length > 0 || !!search;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20 fade-in">
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/30">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-muted/40 transition-colors"><ArrowLeft size={20} className="text-foreground" /></button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Каталог пользователей</h1>
          <p className="text-xs text-muted-foreground">Только реальные, заполненные профили</p>
        </div>
        <button onClick={() => setShowOnboarding(true)} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground transition-colors"><HelpCircle size={18} /></button>
      </div>

      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} maxLength={SEARCH_MAX} placeholder="Поиск по имени…" className="w-full bg-secondary rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none border border-transparent focus:border-primary/40 transition-colors text-foreground placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={14} /></button>}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <button onClick={() => { setShowStatusDrop(v => !v); setShowInterestDrop(false); }} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${activeStatus ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent'}`}>
              {activeStatus ?? 'Статус'}
              {activeStatus ? <X size={11} onClick={e => { e.stopPropagation(); setActiveStatus(null); }} /> : <ChevronDown size={11} />}
            </button>
            {showStatusDrop && (
              <div className="absolute z-20 top-full mt-1 w-44 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden">
                {STATUS_OPTIONS.map(s => <button key={s} onClick={() => { setActiveStatus(s === activeStatus ? null : s); setShowStatusDrop(false); }} className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${s === activeStatus ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-accent'}`}>{s}</button>)}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => { setShowInterestDrop(v => !v); setShowStatusDrop(false); }} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${activeInterests.length > 0 ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border/40 hover:bg-accent'}`}>
              {activeInterests.length > 0 ? `Интересы (${activeInterests.length})` : 'Интересы'}
              <ChevronDown size={11} />
            </button>
            {showInterestDrop && (
              <div className="absolute z-20 top-full mt-1 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden">
                {INTEREST_OPTIONS.map(i => <button key={i} onClick={() => toggleInterest(i)} className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between transition-colors ${activeInterests.includes(i) ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-accent'}`}>{i}</button>)}
              </div>
            )}
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
              <RefreshCw size={11} /> Сбросить
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-3 pb-4 space-y-2">
        {!loading && !error && <p className="text-xs text-muted-foreground pb-1">{users.length} пользователей</p>}
        {loading && Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        {error && (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-sm text-destructive text-center">{error}</p>
            <button onClick={fetchUsers} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"><RefreshCw size={14} /> Повторить</button>
          </div>
        )}
        {!loading && !error && users.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center"><Search size={24} className="text-muted-foreground/40" /></div>
            <p className="text-sm text-muted-foreground text-center">Не найдено пользователей по выбранным фильтрам</p>
            {hasFilters && <button onClick={resetFilters} className="text-xs text-primary font-medium">Сбросить фильтры</button>}
          </div>
        )}
        {!loading && !error && users.map(u => <UserCard key={u.user_id} user={u} onClick={() => navigate(`/profile/${u.user_id}`)} />)}
      </div>
    </div>
  );
}
