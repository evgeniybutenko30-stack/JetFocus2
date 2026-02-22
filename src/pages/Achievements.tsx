import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { ArrowLeft, Lock, Star, ShoppingBag, Snowflake, Frame, User, Palette, Award, Tag } from 'lucide-react';
import { getLevelName, xpForLevel } from '@/lib/constants';

const SHOP_ITEMS = [
  { id: 'freeze', name: 'Заморозка серии', desc: 'Защитите свою серию на 1 день', price: 50, icon: '❄️', category: 'utility' },
  { id: 'frame_gold', name: 'Золотая рамка', desc: 'Эксклюзивная рамка для профиля', price: 100, icon: '🖼️', category: 'frames' },
  { id: 'frame_diamond', name: 'Алмазная рамка', desc: 'Премиум рамка для профиля', price: 300, icon: '💎', category: 'frames' },
  { id: 'frame_fire', name: 'Огненная рамка', desc: 'Анимированная рамка', price: 500, icon: '🔥', category: 'frames' },
  { id: 'avatar_wolf', name: 'Аватар «Волк»', desc: 'Символ силы и целеустремлённости', price: 200, icon: '🐺', category: 'avatars' },
  { id: 'avatar_eagle', name: 'Аватар «Орёл»', desc: 'Символ широкого видения', price: 300, icon: '🦅', category: 'avatars' },
  { id: 'avatar_lion', name: 'Аватар «Лев»', desc: 'Символ лидерства', price: 500, icon: '🦁', category: 'avatars' },
  { id: 'avatar_dragon', name: 'Аватар «Дракон»', desc: 'Легендарный аватар', price: 1000, icon: '🐉', category: 'avatars' },
  { id: 'badge_pro', name: 'Бейдж PRO', desc: 'Отображается в профиле', price: 150, icon: '⭐', category: 'badges' },
  { id: 'badge_fire', name: 'Бейдж «В огне»', desc: 'За серию 30+ дней', price: 250, icon: '🔥', category: 'badges' },
  { id: 'theme_midnight', name: 'Тема «Полночь»', desc: 'Эксклюзивная цветовая схема', price: 400, icon: '🌙', category: 'themes' },
  { id: 'discount_10', name: 'Скидка 10% на PRO', desc: 'Одноразовый купон', price: 500, icon: '🏷️', category: 'utility' },
];

const STAR_PACKS = [
  { stars: 100, price: 99, popular: false },
  { stars: 500, price: 399, popular: true },
  { stars: 1000, price: 699, popular: false },
  { stars: 5000, price: 2990, popular: false },
];

const STREAK_BONUSES = [
  { days: 7, stars: 5 },
  { days: 14, stars: 10 },
  { days: 30, stars: 35 },
  { days: 60, stars: 100 },
  { days: 100, stars: 300 },
];

export default function AchievementsPage() {
  const user = useAuthStore(s => s.user);
  const level = useAuthStore(s => s.level);
  const xp = useAuthStore(s => s.xp);
  const stars = useAuthStore(s => s.stars);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'achievements' | 'shop' | 'stars'>('achievements');
  const [achTab, setAchTab] = useState<'available' | 'earned'>('available');
  const [shopCat, setShopCat] = useState('all');

  const unlocked = useLiveQuery(() => db.userAchievements.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const unlockedCodes = new Set(unlocked.map(u => u.achievementCode));

  const earned = ACHIEVEMENTS.filter(a => unlockedCodes.has(a.code));
  const available = ACHIEVEMENTS.filter(a => !unlockedCodes.has(a.code));

  const xpNeeded = xpForLevel(level);
  const xpPercent = Math.min(Math.round((xp / xpNeeded) * 100), 100);

  const filteredShop = shopCat === 'all' ? SHOP_ITEMS : SHOP_ITEMS.filter(i => i.category === shopCat);

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Награды и магазин</h1>
      </div>
      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4 fade-in">
        {/* Level card */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--accent-secondary))]/30 flex items-center justify-center">
              <span className="text-2xl">🏆</span>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold">{getLevelName(level)}</p>
              <p className="text-xs text-muted-foreground mb-2">Уровень {level}</p>
              <div className="h-2.5 bg-accent rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-[hsl(var(--accent-secondary))] rounded-full transition-all" style={{ width: `${xpPercent}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{xp} / {xpNeeded} XP</p>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-border/30">
            <div className="text-center"><Star size={16} className="mx-auto text-[hsl(var(--accent-secondary))] mb-0.5" /><p className="text-sm font-bold">{stars}</p><p className="text-[10px] text-muted-foreground">Звёзды</p></div>
            <div className="text-center"><Award size={16} className="mx-auto text-primary mb-0.5" /><p className="text-sm font-bold">{earned.length}</p><p className="text-[10px] text-muted-foreground">Получено</p></div>
            <div className="text-center"><Lock size={16} className="mx-auto text-muted-foreground mb-0.5" /><p className="text-sm font-bold">{available.length}</p><p className="text-[10px] text-muted-foreground">Доступно</p></div>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex bg-secondary rounded-lg p-0.5">
          {[
            { k: 'achievements' as const, l: '🏅 Достижения' },
            { k: 'shop' as const, l: '🛒 Магазин' },
            { k: 'stars' as const, l: '⭐ Звёзды' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex-1 py-2 text-xs font-medium rounded-md ${tab === t.k ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* ACHIEVEMENTS TAB */}
        {tab === 'achievements' && (
          <>
            <div className="flex bg-secondary rounded-lg p-0.5">
              <button onClick={() => setAchTab('available')} className={`flex-1 py-2 text-xs font-medium rounded-md ${achTab === 'available' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
                Доступные ({available.length})
              </button>
              <button onClick={() => setAchTab('earned')} className={`flex-1 py-2 text-xs font-medium rounded-md ${achTab === 'earned' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
                Полученные ({earned.length})
              </button>
            </div>

            {/* Streak Bonuses */}
            <div className="glass-card p-3">
              <p className="text-xs font-bold mb-2">🔥 Бонусы за серии</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {STREAK_BONUSES.map(b => (
                  <div key={b.days} className="flex-shrink-0 bg-secondary rounded-xl p-2 text-center min-w-[64px]">
                    <p className="text-xs font-bold">{b.days}д</p>
                    <p className="text-[10px] text-[hsl(var(--accent-secondary))]">+{b.stars}⭐</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(achTab === 'available' ? available : earned).map(a => (
                <div key={a.code} className={`glass-card p-3 text-center ${achTab === 'earned' ? '' : 'opacity-70'}`}>
                  <span className="text-2xl block mb-1">{a.icon}</span>
                  <p className="text-xs font-medium">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground">{a.description}</p>
                  <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
                    <span className="text-primary">+{a.xpReward} XP</span>
                    <span className="text-[hsl(var(--accent-secondary))]">+{a.starsReward} ⭐</span>
                  </div>
                  {achTab === 'available' && <Lock size={12} className="mx-auto mt-1 text-muted-foreground" />}
                  {achTab === 'earned' && <span className="text-[10px] text-primary mt-1 block">✓ Получено</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* SHOP TAB */}
        {tab === 'shop' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShoppingBag size={36} className="text-primary/60" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold mb-1">Пока в разработке</h3>
              <p className="text-sm text-muted-foreground max-w-xs">Магазин скоро откроется! Здесь можно будет обменивать звёзды на рамки, аватары и бонусы.</p>
            </div>
            <span className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full">🚧 Coming Soon</span>
          </div>
        )}

        {/* STARS TAB */}
        {tab === 'stars' && (
          <>
            <div className="glass-card p-5 text-center">
              <Star size={32} className="mx-auto text-[hsl(var(--accent-secondary))] mb-2" />
              <p className="text-3xl font-bold">{stars}</p>
              <p className="text-xs text-muted-foreground">звёзд на балансе</p>
            </div>

            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--accent-secondary))]/10 flex items-center justify-center">
                <Star size={28} className="text-[hsl(var(--accent-secondary))]/60" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold mb-1">Покупка звёзд — в разработке</h3>
                <p className="text-sm text-muted-foreground max-w-xs">Скоро здесь можно будет приобрести звёзды. А пока — зарабатывайте их активностью!</p>
              </div>
              <span className="px-3 py-1.5 bg-[hsl(var(--accent-secondary))]/10 text-[hsl(var(--accent-secondary))] text-xs font-medium rounded-full">🚧 Coming Soon</span>
            </div>

            <p className="text-sm font-bold mt-2">Как заработать звёзды</p>
            <div className="space-y-2">
              {[
                { action: 'Выполнение задачи', stars: '+1 ⭐' },
                { action: 'Выполнение привычки', stars: '+1 ⭐' },
                { action: 'Выполнение цели', stars: '+50 ⭐' },
                { action: 'Шаг цели', stars: '+1 ⭐' },
                { action: 'Веха цели', stars: '+5 ⭐' },
                { action: 'Финансовая цель', stars: '+50 ⭐' },
                { action: 'Приглашение друга', stars: '+50 ⭐' },
                { action: 'Серия 7д', stars: '+10 ⭐' },
                { action: 'Серия 14д', stars: '+25 ⭐' },
                { action: 'Серия 30д', stars: '+40 ⭐' },
                { action: 'Серия 60д', stars: '+100 ⭐' },
                { action: 'Серия 100д', stars: '+300 ⭐' },
              ].map(item => (
                <div key={item.action} className="glass-card p-3 flex items-center justify-between">
                  <span className="text-sm">{item.action}</span>
                  <span className="text-xs font-bold text-[hsl(var(--accent-secondary))]">{item.stars}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
