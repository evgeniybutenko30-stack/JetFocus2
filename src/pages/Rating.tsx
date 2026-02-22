import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Users, ChevronRight, X, ArrowRight, RefreshCw, Heart } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────────────────────

type SortMode = 'stars' | 'referrals';
type TimePeriod = 'all' | 'year' | 'month';

interface RankedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  stars_balance: number;
  referrals_count: number;
  likes_count: number;
  score: number;
}

// ─── Onboarding Slides ──────────────────────────────────────────────────────

const ONBOARDING_SLIDES = [
  {
    emoji: '🏆',
    title: 'Зачем рейтинг?',
    text: 'Рейтинг — это ваш прогресс и социальная мотивация. Поднимайтесь выше и прокачивайте дисциплину каждый день.',
  },
  {
    emoji: '⭐',
    title: 'Как считаются очки?',
    text: 'Ваше место зависит от трёх вещей: ⭐ звёзды за задачи и привычки, 👥 рефералы — приглашённые друзья, ❤️ лайки на ваших публикациях.',
  },
  {
    emoji: '🚀',
    title: 'Как быстро расти?',
    text: 'Публикуйте полезные посты, приглашайте друзей по реферальной ссылке и выполняйте активность — звёзды копятся, а позиция растёт.',
  },
  {
    emoji: '🔒',
    title: 'Прозрачность',
    text: 'В рейтинге участвуют только реальные пользователи. Никаких ботов и фиктивных профилей — только честная конкуренция.',
  },
];

// ─── Avatar placeholder ──────────────────────────────────────────────────────

function AvatarPlaceholder({
  name,
  size = 'md',
  url,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  url?: string | null;
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClass =
    size === 'lg' ? 'w-20 h-20 text-xl' : size === 'md' ? 'w-14 h-14 text-base' : 'w-10 h-10 text-xs';

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-2xl object-cover`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  const colors = [
    'from-[hsl(var(--sphere-health))] to-[hsl(var(--sphere-development))]',
    'from-[hsl(var(--sphere-career))] to-[hsl(var(--primary))]',
    'from-[hsl(var(--accent-secondary))] to-[hsl(var(--sphere-finance))]',
    'from-[hsl(var(--sphere-relationships))] to-[hsl(var(--sphere-family))]',
    'from-[hsl(var(--accent-tertiary))] to-[hsl(var(--sphere-spirituality))]',
    'from-[hsl(var(--sphere-leisure))] to-[hsl(var(--sphere-health))]',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];

  return (
    <div
      className={`${sizeClass} rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center font-bold text-white shrink-0`}
    >
      {initials}
    </div>
  );
}

// ─── Podium Card ─────────────────────────────────────────────────────────────

function PodiumCard({
  user,
  place,
  isFirst,
  onClick,
  sortMode,
}: {
  user: RankedUser | null;
  place: number;
  isFirst: boolean;
  onClick: () => void;
  sortMode: SortMode;
}) {
  const medalColors: Record<number, string> = {
    1: 'bg-amber-400 text-amber-900',
    2: 'bg-slate-400 text-slate-900',
    3: 'bg-amber-700 text-amber-100',
  };

  const value = user
    ? sortMode === 'stars'
      ? user.stars_balance
      : user.referrals_count
    : 0;

  if (!user) {
    return (
      <div className={`flex flex-col items-center gap-2 ${isFirst ? 'mb-0' : 'mb-4'}`}>
        <div
          className={`${isFirst ? 'w-20 h-20' : 'w-14 h-14'} rounded-2xl bg-muted/30 border border-border/30 flex items-center justify-center`}
        >
          <Users size={isFirst ? 24 : 18} className="text-muted-foreground/40" />
        </div>
        <div
          className={`${isFirst ? 'w-7 h-7 text-sm' : 'w-6 h-6 text-xs'} rounded-full ${medalColors[place]} flex items-center justify-center font-bold -mt-5`}
        >
          {place}
        </div>
        <p className="text-xs text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${isFirst ? '' : 'mt-4'} transition-transform active:scale-95`}
    >
      <div className="relative">
        <AvatarPlaceholder name={user.display_name} size={isFirst ? 'lg' : 'md'} url={user.avatar_url} />
        <span
          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 ${isFirst ? 'w-7 h-7 text-sm' : 'w-6 h-6 text-xs'} rounded-full ${medalColors[place]} flex items-center justify-center font-bold shadow-md`}
        >
          {place}
        </span>
      </div>
      <p className={`${isFirst ? 'text-sm' : 'text-xs'} font-semibold mt-3 text-foreground max-w-[80px] text-center leading-tight`}>
        {user.display_name}
      </p>
      <div className="flex items-center gap-1">
        <Star size={isFirst ? 13 : 11} className="text-[hsl(var(--accent-secondary))] fill-[hsl(var(--accent-secondary))]" />
        <span className={`${isFirst ? 'text-sm' : 'text-xs'} font-bold text-foreground`}>
          {value.toLocaleString('ru')}
        </span>
      </div>
    </button>
  );
}

// ─── Skeleton loaders ────────────────────────────────────────────────────────

function PodiumSkeleton() {
  return (
    <div className="flex items-end justify-center gap-6 py-6">
      {[false, true, false].map((isFirst, i) => (
        <div key={i} className={`flex flex-col items-center gap-2 ${!isFirst ? 'mt-4' : ''}`}>
          <Skeleton className={`${isFirst ? 'w-20 h-20' : 'w-14 h-14'} rounded-2xl`} />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 mt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-6 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RatingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const myStars = useAuthStore((s) => s.stars);
  const myName = useAuthStore((s) => s.displayName);
  const myAvatar = useAuthStore((s) => s.avatarUrl);

  const [sortMode, setSortMode] = useState<SortMode>('stars');
  const [period, setPeriod] = useState<TimePeriod>('month');
  const [users, setUsers] = useState<RankedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // ── Check onboarding flag ─────────────────────────────────────────────────
  useEffect(() => {
    const seen = localStorage.getItem('onboarding_seen_ranking');
    if (!seen) setShowOnboarding(true);
  }, []);

  const closeOnboarding = () => {
    localStorage.setItem('onboarding_seen_ranking', 'true');
    setShowOnboarding(false);
    setOnboardingStep(0);
  };

  // ── Fetch rating data ─────────────────────────────────────────────────────
  const fetchRating = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let dateFrom: string | null = null;
      const now = new Date();
      if (period === 'month') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        dateFrom = d.toISOString();
      } else if (period === 'year') {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        dateFrom = d.toISOString();
      }

      const { data: profiles, error: profErr } = await supabase
        .from('user_profiles')
        .select('user_id, display_name, avatar_url, stars_balance');

      if (profErr) throw profErr;
      if (!profiles || profiles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      let refQuery = supabase
        .from('referrals')
        .select('inviter_id, created_at')
        .eq('status', 'confirmed');
      if (dateFrom) refQuery = refQuery.gte('created_at', dateFrom);
      const { data: referrals } = await refQuery;

      const refCounts: Record<string, number> = {};
      (referrals ?? []).forEach((r: { inviter_id: string }) => {
        refCounts[r.inviter_id] = (refCounts[r.inviter_id] ?? 0) + 1;
      });

      let likesQuery = supabase
        .from('post_likes')
        .select('post_id, created_at, posts!inner(user_id)');
      if (dateFrom) likesQuery = likesQuery.gte('created_at', dateFrom);
      const { data: likesRaw } = await likesQuery;

      const likesByUser: Record<string, number> = {};
      (likesRaw ?? []).forEach((l: { posts: { user_id: string } | { user_id: string }[] }) => {
        const uid = Array.isArray(l.posts) ? l.posts[0]?.user_id : (l.posts as { user_id: string })?.user_id;
        if (uid) likesByUser[uid] = (likesByUser[uid] ?? 0) + 1;
      });

      const ranked: RankedUser[] = profiles.map((p) => {
        const stars = (p as { stars_balance?: number }).stars_balance ?? 0;
        const refs = refCounts[p.user_id] ?? 0;
        const likes = likesByUser[p.user_id] ?? 0;
        return {
          id: p.user_id,
          display_name: (p as { display_name?: string }).display_name ?? 'Пользователь',
          avatar_url: (p as { avatar_url?: string }).avatar_url ?? null,
          stars_balance: stars,
          referrals_count: refs,
          likes_count: likes,
          score: stars + refs + likes,
        };
      });

      ranked.sort((a, b) =>
        sortMode === 'stars'
          ? b.stars_balance - a.stars_balance
          : b.referrals_count - a.referrals_count
      );

      setUsers(ranked);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить рейтинг. Проверьте соединение.');
    } finally {
      setLoading(false);
    }
  }, [sortMode, period]);

  useEffect(() => {
    fetchRating();
  }, [fetchRating]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const top3 = users.slice(0, 3);
  const rest = users.slice(3);

  // My position
  const myPos = user ? users.findIndex((u) => u.id === user.id) + 1 : 0;
  const myEntry = user ? users.find((u) => u.id === user.id) : null;

  // Podium order: 2nd | 1st | 3rd
  const podium: (RankedUser | null)[] = [
    top3[1] ?? null, // place 2 — left
    top3[0] ?? null, // place 1 — center
    top3[2] ?? null, // place 3 — right
  ];

  const PERIOD_LABELS: Record<TimePeriod, string> = {
    all: 'За всё время',
    year: 'За год',
    month: 'За месяц',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground">Рейтинг</h1>
        <button
          onClick={() => setShowOnboarding(true)}
          className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground text-sm font-bold"
        >
          ?
        </button>
      </div>

      {/* ── Podium ── */}
      {loading ? (
        <PodiumSkeleton />
      ) : error ? null : (
        <div className="flex items-end justify-center gap-6 px-4 py-6">
          <PodiumCard user={podium[0]} place={2} isFirst={false} onClick={() => podium[0] && navigate(`/profile/${podium[0].id}`)} sortMode={sortMode} />
          <PodiumCard user={podium[1]} place={1} isFirst onClick={() => podium[1] && navigate(`/profile/${podium[1].id}`)} sortMode={sortMode} />
          <PodiumCard user={podium[2]} place={3} isFirst={false} onClick={() => podium[2] && navigate(`/profile/${podium[2].id}`)} sortMode={sortMode} />
        </div>
      )}

      {/* ── My Stats ── */}
      <div className="grid grid-cols-3 gap-2 px-4 mb-4">
        {/* Balance */}
        <button
          onClick={() => navigate('/achievements')}
          className="bg-card rounded-2xl p-3 flex flex-col items-start border border-border/30 active:opacity-80"
        >
          <Star size={16} className="text-[hsl(var(--accent-secondary))] fill-[hsl(var(--accent-secondary))] mb-1" />
          <p className="text-xl font-bold text-[hsl(var(--accent-secondary))]">{(myEntry?.stars_balance ?? myStars).toLocaleString('ru')}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            Ваш баланс <ChevronRight size={10} />
          </p>
        </button>

        {/* Position */}
        <div className="bg-card rounded-2xl p-3 flex flex-col items-center justify-center border border-border/30">
          <p className="text-xl font-bold text-foreground">#{myPos || '—'}</p>
          <p className="text-[11px] text-muted-foreground">Ваша позиция</p>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/partner')}
          className="bg-card rounded-2xl p-3 flex flex-col items-start border border-border/30 active:opacity-80"
        >
          <Star size={16} className="text-[hsl(var(--accent-secondary))] fill-[hsl(var(--accent-secondary))] mb-1" />
          <p className="text-sm font-semibold text-[hsl(var(--accent-secondary))]">Заработать</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            Пригласить <ChevronRight size={10} />
          </p>
        </button>
      </div>

      {/* ── Sort Tabs ── */}
      <div className="px-4 mb-3">
        <div className="flex bg-muted/40 rounded-xl p-0.5 border border-border/20">
          {(['stars', 'referrals'] as SortMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                sortMode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {m === 'stars' ? 'По звёздам' : 'По рефералам'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Period Tabs ── */}
      <div className="flex gap-6 px-4 border-b border-border/30 mb-2">
        {(['all', 'year', 'month'] as TimePeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              period === p ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {PERIOD_LABELS[p]}
            {period === p && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--accent-secondary))] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Column header ── */}
      {!loading && !error && users.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2">
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Пользователь</p>
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">#</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-col items-center gap-4 py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-2xl">😕</div>
          <p className="text-center text-muted-foreground text-sm">{error}</p>
          <button
            onClick={fetchRating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"
          >
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {/* ── Loading list ── */}
      {loading && <ListSkeleton />}

      {/* ── Empty ── */}
      {!loading && !error && users.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 px-4">
          <div className="text-5xl">🏅</div>
          <p className="text-lg font-bold text-foreground">Пока нет участников</p>
          <p className="text-sm text-muted-foreground text-center">Будьте первым! Выполняйте задачи и привычки, чтобы попасть в рейтинг.</p>
          <button
            onClick={() => navigate('/habits')}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
          >
            Заработать звёзды
          </button>
        </div>
      )}

      {/* ── List (place 4+) ── */}
      {!loading && !error && rest.length > 0 && (
        <div className="px-4 space-y-1">
          {rest.map((u, idx) => {
            const isMe = user && u.id === user.id;
            const val = sortMode === 'stars' ? u.stars_balance : u.referrals_count;
            return (
              <button
                key={u.id}
                onClick={() => navigate(`/profile/${u.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all active:scale-[0.98] ${
                  isMe
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-card/50 hover:bg-card border border-transparent'
                }`}
              >
                {/* Avatar */}
                <AvatarPlaceholder
                  name={u.display_name}
                  size="sm"
                  url={u.avatar_url}
                />

                {/* Name + metric */}
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-sm font-semibold truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                    {u.display_name}
                    {isMe && <span className="ml-1 text-xs text-primary/70">(вы)</span>}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {sortMode === 'stars' ? (
                      <Star size={11} className="text-[hsl(var(--accent-secondary))] fill-[hsl(var(--accent-secondary))]" />
                    ) : (
                      <Users size={11} className="text-primary" />
                    )}
                    <span className="text-xs text-muted-foreground font-medium">
                      {val.toLocaleString('ru')}
                    </span>
                  </div>
                </div>

                {/* Place */}
                <span className="text-sm font-bold text-muted-foreground">{idx + 4}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Onboarding Overlay ── */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-card rounded-3xl border border-border/40 shadow-2xl overflow-hidden">
            {/* Close */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div className="flex gap-1.5">
                {ONBOARDING_SLIDES.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      i === onboardingStep ? 'w-6 bg-primary' : 'w-3 bg-muted'
                    }`}
                  />
                ))}
              </div>
              <button onClick={closeOnboarding} className="p-1.5 rounded-full bg-muted/50 text-muted-foreground">
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-6 text-center min-h-[200px] flex flex-col items-center justify-center">
              <div className="text-6xl mb-4">{ONBOARDING_SLIDES[onboardingStep].emoji}</div>
              <h2 className="text-xl font-bold text-foreground mb-3">
                {ONBOARDING_SLIDES[onboardingStep].title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {ONBOARDING_SLIDES[onboardingStep].text}
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              {onboardingStep < ONBOARDING_SLIDES.length - 1 ? (
                <>
                  <button
                    onClick={closeOnboarding}
                    className="flex-1 py-3 rounded-2xl border border-border/40 text-sm text-muted-foreground font-medium"
                  >
                    Пропустить
                  </button>
                  <button
                    onClick={() => setOnboardingStep((s) => s + 1)}
                    className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    Далее <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <button
                  onClick={closeOnboarding}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Понятно!
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
