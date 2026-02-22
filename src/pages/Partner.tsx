import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Share2, Copy, Wallet, Clock, ChevronRight, TrendingUp, Eye, CreditCard, CheckCircle } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';

export default function PartnerPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const referralCode = useAuthStore(s => s.referralCode);
  const [tab, setTab] = useState<'overview' | 'wallet' | 'history'>('overview');
  const [copied, setCopied] = useState(false);

  const refCode = referralCode ?? user?.id?.slice(0, 8) ?? 'guest000';
  const refLink = `https://test1saa.lovable.app/?ref=${refCode}`;

  function copyLink() {
    navigator.clipboard.writeText(refLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full fade-in space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <Users size={20} className="text-purple-400" />
          <h1 className="text-lg font-bold">Партнёрская программа</h1>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">25%</p>
            <p className="text-xs text-muted-foreground">1 уровень</p>
            <p className="text-[10px] text-muted-foreground mt-1">Прямые приглашения</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">2.5%</p>
            <p className="text-xs text-muted-foreground">2 уровень</p>
            <p className="text-[10px] text-muted-foreground mt-1">Приглашения ваших рефералов</p>
          </div>
        </div>

        {/* Ref link */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">🔗 Ваша реферальная ссылка</h3>
          <div className="flex gap-2 mb-3">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center">
              <div className="w-12 h-12 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iNTAiIHk9IjU1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjEyIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmaWxsPSIjMDAwIj5RUjwvdGV4dD48L3N2Zz4=')] bg-contain" />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input readOnly value={refLink} className="form-input flex-1 text-xs font-mono" />
              <button onClick={copyLink} className="p-2 text-muted-foreground hover:text-foreground">
                {copied ? <CheckCircle size={16} className="text-primary" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <button onClick={copyLink} className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2">
            <Share2 size={14} /> {copied ? 'Скопировано!' : 'Поделиться'}
          </button>
        </div>

        {/* Analytics */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><TrendingUp size={14} className="text-primary" /> Аналитика</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Перешло по ссылке', value: 0, icon: <Eye size={14} className="text-blue-400" /> },
              { label: 'Оплатили', value: 0, icon: <CreditCard size={14} className="text-green-400" /> },
              { label: 'Заработано', value: '0 ₽', icon: <TrendingUp size={14} className="text-[hsl(var(--accent-secondary))]" /> },
              { label: 'Баланс', value: '0 ₽', icon: <Wallet size={14} className="text-purple-400" /> },
            ].map(s => (
              <div key={s.label} className="bg-secondary/50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">{s.icon}<span className="text-[10px] text-muted-foreground">{s.label}</span></div>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wallet */}
        <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Доступно к выводу</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold">0 ₽</p>
            <Wallet size={24} className="text-green-400" />
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 glass-card p-3 flex items-center justify-center gap-2 text-sm font-medium">
            <Wallet size={14} /> Вывести
          </button>
          <button className="flex-1 glass-card p-3 flex items-center justify-center gap-2 text-sm font-medium">
            <Clock size={14} /> История
          </button>
        </div>

        <div className="bg-[hsl(var(--accent-secondary))]/10 border border-[hsl(var(--accent-secondary))]/30 rounded-xl p-3 text-xs text-[hsl(var(--accent-secondary))]">
          ⚠ Минимальная сумма для вывода: 1 000 ₽
        </div>

        {/* How it works */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold mb-3">Как это работает</h3>
          <div className="space-y-3">
            {[
              { step: '1', title: 'Поделитесь ссылкой', desc: 'Отправьте друзьям свою реферальную ссылку' },
              { step: '2', title: 'Друг оформляет PRO', desc: 'Когда друг оплачивает подписку, вы получаете 25%' },
              { step: '3', title: '2-й уровень', desc: 'Если ваш друг тоже приглашает людей — 2.5% с их оплат' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{s.step}</div>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
