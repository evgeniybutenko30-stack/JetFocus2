import { useNavigate } from 'react-router-dom';
import { Crown, Star, Users, TrendingUp, Zap, Shield, ArrowLeft } from 'lucide-react';

const BENEFITS = [
  { icon: Users, text: 'Каталог пользователей — находи людей по интересам и статусу' },
  { icon: TrendingUp, text: 'Рейтинг — видь своё место среди всех участников JetFocus' },
  { icon: Zap, text: 'Расширенная аналитика — глубокая статистика прогресса' },
  { icon: Star, text: 'Приоритетная поддержка и ранний доступ к новым функциям' },
  { icon: Shield, text: 'Продвинутые фильтры и персонализация рабочего пространства' },
];

export function ProPaywall() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <span className="text-sm text-muted-foreground">Назад</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Crown glow */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gold-light border border-gold-border flex items-center justify-center shadow-2xl">
            <Crown size={40} className="text-gold" />
          </div>
          <div className="absolute inset-0 rounded-3xl bg-gold-light blur-xl -z-10" />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          PRO доступ
        </h1>
        <p className="text-muted-foreground text-center text-sm leading-relaxed mb-8 max-w-xs">
          Каталог и рейтинг открывают доступ к сильному окружению, социальной мотивации и глубокой аналитике
        </p>

        {/* Benefits */}
        <div className="w-full max-w-sm space-y-2.5 mb-8">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border/40"
            >
              <div className="w-8 h-8 rounded-lg bg-gold-light border border-gold-border flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={14} className="text-gold" />
              </div>
              <p className="text-sm text-foreground leading-snug">{text}</p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => navigate('/pro')}
            className="w-full py-3.5 rounded-2xl bg-gold text-primary-foreground font-semibold text-base shadow-lg active:scale-[0.98] transition-transform"
          >
            Оформить PRO
          </button>
          <button
            onClick={() => navigate('/pro')}
            className="w-full py-3 rounded-2xl border border-border text-foreground text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            Что входит в PRO?
          </button>
        </div>
      </div>
    </div>
  );
}
