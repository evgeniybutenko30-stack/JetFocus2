import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Trophy, Users, Crown, BarChart3, Archive, Mail, Send } from 'lucide-react';


const cards = [
  { icon: SettingsIcon, title: 'Профиль и Настройки', subtitle: 'Аккаунт, синхронизация', path: '/profile-settings', gradient: 'from-cyan-400 to-blue-500' },
  { icon: Trophy, title: 'Награды', subtitle: 'Достижения и бейджи', path: '/achievements', gradient: 'from-yellow-400 to-orange-500' },
  { icon: Users, title: 'Партнёрская программа', subtitle: 'Приглашай и зарабатывай', path: '/partner', gradient: 'from-pink-400 to-purple-500' },
  { icon: Crown, title: 'Тарифы', subtitle: 'PRO подписка', path: '/pro', gradient: 'from-orange-400 to-orange-600' },
  { icon: BarChart3, title: 'Статистика', subtitle: 'Аналитика и прогресс', path: '/statistics', gradient: 'from-violet-400 to-purple-600' },
  { icon: Archive, title: 'Архив', subtitle: 'История привычек и задач', path: '/archive', gradient: 'from-gray-400 to-gray-600' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full space-y-4 fade-in">
        {/* Universal access */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={16} className="text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Универсальный доступ</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Привяжите почту, чтобы входить в аккаунт через браузер и сохранять прогресс вне Telegram.</p>
          <div className="flex gap-2">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="example@mail.com" className="form-input flex-1" />
            <button className="p-3 bg-primary rounded-xl text-primary-foreground"><Send size={16} /></button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => (
            <button key={c.path} onClick={() => navigate(c.path)} className={`relative overflow-hidden rounded-2xl p-4 pt-5 pb-4 text-left bg-gradient-to-br ${c.gradient} min-h-[140px] flex flex-col justify-between group transition-transform active:scale-[0.97]`}>
              <c.icon size={28} className="text-white/80 mb-3" />
              <div>
                <p className="text-sm font-bold text-white leading-tight">{c.title}</p>
                <p className="text-[11px] text-white/70 mt-0.5">{c.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
