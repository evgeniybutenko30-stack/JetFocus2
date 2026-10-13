import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Target, Zap, Flag, TrendingUp, Star, AlertTriangle } from 'lucide-react';
import { SPHERES } from '@/lib/constants';
import { markGoalsTourCompleted } from '@/lib/goalsService';

interface GoalTourProps {
  onClose: () => void;
  onStartWizard: () => void;
}

const SLIDES = [
  {
    icon: <Target size={36} className="text-primary" />,
    title: 'Что такое цель в приложении',
    text: 'Цель — это направление. Шаги — это то, что ты делаешь сегодня. Вехи — контрольные точки на пути.',
    example: (
      <div className="mt-4 p-3 rounded-xl bg-secondary/60 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Пример</p>
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <p className="text-sm font-semibold">Выучить китайский</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flag size={11} className="text-primary" />
          <span>3 вехи (HSK1, HSK2, разговор)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap size={11} className="text-orange-400" />
          <span>Шаг сегодня: повторить слова — 15 мин</span>
        </div>
      </div>
    ),
  },
  {
    icon: <span className="text-4xl">⚖️</span>,
    title: 'Сферы жизни и баланс',
    text: 'Каждая цель относится к сфере жизни. Так ты видишь баланс личного и социального.',
    example: (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">8 сфер жизни</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Личное</p>
            {SPHERES.filter(s => s.category === 'personal').map(s => (
              <div key={s.id} className="flex items-center gap-1.5 text-xs py-0.5">
                <span>{s.icon}</span><span>{s.name}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Социальное</p>
            {SPHERES.filter(s => s.category === 'social').map(s => (
              <div key={s.id} className="flex items-center gap-1.5 text-xs py-0.5">
                <span>{s.icon}</span><span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Flag size={36} className="text-primary" />,
    title: 'Вехи (Milestones)',
    text: 'Веха = этап с дедлайном. Она превращает большую цель в понятные этапы — как серии в сериале.',
    example: (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Пример вех</p>
        {[
          { title: 'Базовый словарный запас', date: '1 апр', done: true },
          { title: 'HSK1 сдан', date: '1 мая', done: false },
          { title: 'Первый разговор', date: '1 июня', done: false },
        ].map((m, i) => (
          <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${m.done ? 'bg-green-500/10' : 'bg-secondary/60'}`}>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${m.done ? 'bg-green-500 border-green-500' : 'border-muted-foreground'}`}>
              {m.done && <span className="text-[8px] text-white">✓</span>}
            </div>
            <span className="text-xs flex-1">{m.title}</span>
            <span className="text-[10px] text-muted-foreground">{m.date}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: <Zap size={36} className="text-orange-400" />,
    title: 'Шаги и Next Step',
    text: 'Шаги — маленькие действия на 10–30 минут. Самое важное — Next Step: 1 шаг, который делает тебя ближе прямо сейчас.',
    example: (
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Следующий шаг</p>
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5">
          <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-1">⚡ Next Step</p>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Повторить слова (урок 3)</p>
              <p className="text-[10px] text-muted-foreground">~15 мин · +2% прогресса</p>
            </div>
            <div className="px-3 py-1.5 bg-primary rounded-lg text-xs font-bold text-primary-foreground">
              Сделать
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <TrendingUp size={36} className="text-green-500" />,
    title: 'Прогресс и ощущение движения',
    text: 'Каждое выполненное действие добавляет прогресс к цели и начисляет звёзды. Ты всегда видишь рост.',
    example: (
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Путь к цели</span>
          <span className="text-sm font-bold text-green-500">42%</span>
        </div>
        <div className="relative flex items-center gap-1">
          <span className="text-base">🏁</span>
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: '42%' }} />
          </div>
          <span className="text-base">🎯</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-400/20 text-xs font-semibold text-yellow-500">
            <Star size={12} />
            +1⭐ начислено
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-400">
            🔥 +2.3% за неделю
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <AlertTriangle size={36} className="text-yellow-500" />,
    title: 'Как не бросить',
    text: 'Если 3 дня нет действий — цель становится «Risk». 7 дней — «Stalled». Приложение мягко напомнит о возвращении.',
    example: (
      <div className="mt-4 space-y-2">
        {[
          { icon: '🟢', label: 'Healthy', desc: 'Были действия последние 3 дня', color: 'bg-green-500/10 text-green-500' },
          { icon: '🟡', label: 'Risk', desc: 'Нет действий 3–6 дней', color: 'bg-yellow-500/10 text-yellow-500' },
          { icon: '🔴', label: 'Stalled', desc: 'Нет действий 7+ дней', color: 'bg-destructive/10 text-destructive' },
        ].map((s) => (
          <div key={s.label} className={`flex items-center gap-2 p-2 rounded-lg ${s.color.split(' ')[0]}`}>
            <span className="text-sm">{s.icon}</span>
            <div>
              <p className={`text-xs font-semibold ${s.color.split(' ')[1]}`}>{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export function GoalTour({ onClose, onStartWizard }: GoalTourProps) {
  const [current, setCurrent] = useState(0);
  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  function handleDone() {
    markGoalsTourCompleted();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={handleDone}>
      <div
        className="bg-card w-full max-w-lg rounded-3xl p-6 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`}
              />
            ))}
          </div>
          <button onClick={handleDone} className="p-1.5 rounded-full bg-secondary/80">
            <X size={16} />
          </button>
        </div>

        {/* Slide content */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-secondary/60 flex items-center justify-center flex-shrink-0">
            {slide.icon}
          </div>
          <h2 className="text-lg font-bold leading-tight">{slide.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{slide.text}</p>
        {slide.example}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 gap-3">
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            className={`p-2.5 rounded-xl bg-secondary/80 ${current === 0 ? 'opacity-40' : ''}`}
            disabled={current === 0}
          >
            <ChevronLeft size={18} />
          </button>

          {isLast ? (
            <button
              onClick={() => { handleDone(); onStartWizard(); }}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm"
            >
              🚀 Создать первую цель
            </button>
          ) : (
            <>
              <button onClick={handleDone} className="text-xs text-muted-foreground px-3">
                Пропустить
              </button>
              <button
                onClick={() => setCurrent(c => Math.min(SLIDES.length - 1, c + 1))}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-1"
              >
                Далее <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
