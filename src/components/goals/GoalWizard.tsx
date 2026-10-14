import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getTodayStr } from '@/lib/constants';
import type { SphereType } from '@/lib/types';
import {
  addActions, addDaysLocal, addMilestones, createGoal, markGoalsWizardCompleted,
  planMilestoneDates, planStepDates, toLocalDateStr,
  GOAL_DESCRIPTION_MAX, GOAL_TITLE_MAX,
} from '@/lib/goalsService';
import { toast } from 'sonner';

interface GoalWizardProps {
  onClose: () => void;
}

type ProgressMode = 'milestones' | 'numeric' | 'binary';
type Intensity = 'easy' | 'normal' | 'sprint';

const EXAMPLE_GOALS = ['Накопить 200 000₽', 'Выучить основы английского', 'Похудеть на 5 кг'];
const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function generateStepTitles(goalTitle: string): string[] {
  const lower = goalTitle.toLowerCase();
  if (lower.match(/язык|английск|китайск|испанск|французск|немецк|японск/)) {
    return [
      '📖 Повторить слова урока — 15 мин',
      '🎧 Послушать подкаст — 20 мин',
      '✍️ Написать 10 предложений — 15 мин',
      '📱 Практика приложение — 10 мин',
      '🗣️ Практика произношения — 15 мин',
      '📚 Читать текст на языке — 20 мин',
      '🎯 Повторение прошлого урока — 15 мин',
      '🔤 Грамматика — 20 мин',
      '💬 Диалог с носителем — 30 мин',
      '📝 Словарный диктант — 10 мин',
    ];
  }
  if (lower.match(/похудеть|фитнес|спорт|трениров|кг|вес|бег|плавани/)) {
    return [
      '🏃 Кардио тренировка — 20 мин',
      '💪 Силовые упражнения — 30 мин',
      '🧘 Растяжка и йога — 15 мин',
      '🚶 Прогулка 5 000 шагов',
      '💪 Тренировка дома — 20 мин',
      '🏊 Плавание — 30 мин',
      '🏋️ Зал — по плану — 45 мин',
      '🌿 Разминка и заминка — 10 мин',
      '🎽 Интервальная тренировка — 20 мин',
      '📏 Измерить прогресс',
    ];
  }
  if (lower.match(/накопить|₽|деньг|бюджет|сбережени|откладыва/)) {
    return [
      '💰 Отложить деньги на цель',
      '📊 Проверить бюджет за неделю',
      '🛒 Записать расходы дня',
      '📈 Анализ трат за неделю',
      '💳 Настроить автосбережения',
      '🎯 Найти способ сэкономить',
      '📱 Обновить финансовый план',
      '🏦 Пополнить копилку',
      '📉 Сократить лишние расходы',
      '✅ Ревью финансовых целей',
    ];
  }
  if (lower.match(/запустить|проект|бизнес|стартап|продукт|приложени/)) {
    return [
      '📝 Написать концепт — 20 мин',
      '🔍 Анализ конкурентов — 30 мин',
      '💡 Брейншторм идей — 15 мин',
      '🎨 Прототип или скетч — 20 мин',
      '📞 Консультация с ментором',
      '📣 Разработать pitch — 15 мин',
      '✅ Выполнить следующий шаг',
      '🗂️ Обновить план проекта',
      '📤 Отправить письмо/заявку',
      '🔧 Техническая задача — 30 мин',
    ];
  }
  return [
    '🎯 Работа над целью — 20 мин',
    '📚 Изучить материал — 15 мин',
    '✍️ Записать прогресс',
    '🔍 Исследование — 20 мин',
    '💡 Применить на практике — 30 мин',
    '📊 Оценить результат',
    '🚀 Следующий шаг по плану',
    '📌 Отметить прогресс',
    '🔄 Повторение и закрепление — 15 мин',
    '✅ Сделать одно важное действие',
  ];
}

function generateMilestones(goalTitle: string, count: number, targetDate: string) {
  const lower = goalTitle.toLowerCase();
  let titles: string[] = [];

  if (lower.match(/язык|английск|китайск/)) {
    titles = ['Базовый словарный запас', 'Первые фразы и грамматика', 'Чтение простых текстов', 'Сдать тест / экзамен', 'Свободное общение'];
  } else if (lower.match(/похудеть|фитнес|спорт|кг/)) {
    titles = ['Войти в ритм (1 неделя)', 'Первые ощутимые результаты', 'Стабильный режим', 'Финальный рывок', 'Цель достигнута 🎯'];
  } else if (lower.match(/накопить|₽|деньг/)) {
    titles = ['Накоплено 25%', 'Накоплено 50%', 'Накоплено 75%', 'Финальный этап', '💰 Цель выполнена'];
  } else if (lower.match(/запустить|проект|бизнес/)) {
    titles = ['Исследование и концепт', 'MVP / прототип', 'Первые пользователи', 'Монетизация', '🚀 Запуск'];
  } else {
    titles = ['Старт и первые шаги', 'Первый промежуточный итог', 'На полпути', 'Финальный рывок', '🏆 Достижение цели'];
  }

  const picked = titles.slice(0, count);
  // Local calendar days, spread up to (and never past) the deadline.
  const dates = planMilestoneDates(picked.length, targetDate);
  return picked.map((title, i) => ({ title, dueDate: dates[i] }));
}

const PLAN_DAYS_AHEAD = 14;

function stepsPerWeekFor(intensity: Intensity): number {
  return intensity === 'easy' ? 3 : intensity === 'normal' ? 5 : 7;
}

function getStepDates(selectedDays: number[], intensity: Intensity, targetDate: string): string[] {
  return planStepDates(selectedDays, PLAN_DAYS_AHEAD, stepsPerWeekFor(intensity) * 2, targetDate || null);
}

export function GoalWizard({ onClose }: GoalWizardProps) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const addStars = useAuthStore(s => s.addStars);

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [progressMode, setProgressMode] = useState<ProgressMode>('milestones');
  const [targetValue, setTargetValue] = useState('100');
  const [startValue, setStartValue] = useState('0');
  const [unitLabel, setUnitLabel] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [sphere, setSphere] = useState<SphereType | null>(null);
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);
  const [firstStepTitle, setFirstStepTitle] = useState('');
  const [createdPlan, setCreatedPlan] = useState({ milestones: 0, steps: 0, impactPerStep: 0, failed: false });

  const TOTAL_STEPS = 6;
  const todayStr = getTodayStr();
  const plannedStepCount = getStepDates(selectedDays, intensity, targetDate).length;

  const canNext: Record<number, boolean> = {
    1: title.trim().length >= 2,
    2: true,
    3: progressMode === 'binary' || (parseFloat(targetValue) > 0),
    4: !!targetDate && targetDate >= todayStr,
    5: !!sphere,
    6: selectedDays.length > 0,
  };

  async function handleCreate() {
    if (creatingRef.current) return; // double tap must not create a second goal
    if (!user?.id) {
      toast.error('Войдите в аккаунт, чтобы создать цель', {
        action: { label: 'Войти', onClick: () => { onClose(); navigate('/auth'); } },
      });
      return;
    }
    if (!sphere) { toast.error('Выберите сферу жизни'); return; }
    if (!targetDate || targetDate < getTodayStr()) { toast.error('Укажите целевой срок'); setStep(4); return; }
    creatingRef.current = true;
    setIsCreating(true);
    try {
      const cleanTitle = title.trim().slice(0, GOAL_TITLE_MAX);
      const numeric = progressMode === 'numeric';
      const tv = parseFloat(targetValue);
      const sv = parseFloat(startValue);

      // 1. Create goal (the metric chosen on step 3 is stored with it)
      const { data: goalData, error: goalError } = await createGoal({
        user_id: user.id,
        title: cleanTitle,
        description: why.trim().slice(0, GOAL_DESCRIPTION_MAX) || null,
        sphere,
        status: 'active',
        target_date: targetDate,
        progress: 0,
        is_pinned: false,
        progress_mode: progressMode,
        ...(numeric ? {
          start_value: Number.isFinite(sv) ? sv : 0,
          target_value: Number.isFinite(tv) && tv > 0 ? tv : 100,
          current_value: Number.isFinite(sv) ? sv : 0,
        } : {}),
      });

      if (goalError || !goalData) {
        const msg = goalError?.message ?? 'нет данных';
        console.error('Goal create error:', goalError);
        toast.error('Ошибка создания цели: ' + msg);
        return;
      }

      const goalId = goalData.id;

      // 2. Create milestones
      const milestoneData = generateMilestones(cleanTitle, 4, targetDate);
      const { error: milestonesError } = await addMilestones(
        milestoneData.map((m, i) => ({
          goal_id: goalId,
          user_id: user.id,
          title: m.title,
          due_date: m.dueDate,
          order_index: i,
          status: 'todo' as const,
        }))
      );
      if (milestonesError) console.warn('Milestones error:', milestonesError);

      // 3. Create steps — таблица называется 'goal_actions'
      const stepTitles = generateStepTitles(cleanTitle);
      const stepDates = getStepDates(selectedDays, intensity, targetDate);
      const impactPerStep = stepDates.length > 0 ? Math.ceil(30 / stepDates.length) : 2;
      const mins = [10, 15, 15, 20, 20, 25, 30];
      const { error: actionsError } = await addActions(
        stepDates.map((date, i) => ({
          goal_id: goalId,
          user_id: user.id,
          title: stepTitles[i % stepTitles.length],
          type: 'one_time',
          due_date: date,
          status: 'todo' as const,
          estimated_minutes: mins[i % mins.length],
          impact: impactPerStep,
        }))
      );
      if (actionsError) console.warn('Actions error:', actionsError);

      const planFailed = !!(milestonesError || actionsError);
      if (planFailed) {
        // The goal exists; say honestly that the generated plan did not fully save.
        toast.warning('Цель создана, но план сохранился не полностью — добавь вехи и шаги вручную.');
      }

      addStars(10);
      setFirstStepTitle(actionsError || stepDates.length === 0 ? '' : stepTitles[0]);
      setCreatedPlan({
        milestones: milestonesError ? 0 : milestoneData.length,
        steps: actionsError ? 0 : stepDates.length,
        impactPerStep,
        failed: planFailed,
      });
      setCreatedGoalId(goalId);
      markGoalsWizardCompleted();
      setStep(7);
    } catch (err) {
      toast.error('Произошла ошибка. Попробуйте снова.');
      console.error(err);
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  }

  function toggleDay(d: number) {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  }

  if (step === 7 && createdGoalId) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card w-full max-w-lg rounded-3xl p-6 pb-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold mb-1">{createdPlan.failed ? 'Цель создана' : 'План создан!'}</h2>
            <p className="text-sm text-muted-foreground">
              {createdPlan.failed
                ? 'План сохранился не полностью — добавь вехи и шаги на странице цели.'
                : createdPlan.steps > 0
                  ? `Цель, ${createdPlan.milestones} вехи и ${createdPlan.steps} шагов на ближайшие 2 недели готовы.`
                  : `Цель и ${createdPlan.milestones} вехи готовы.`}
            </p>
          </div>

          {firstStepTitle && (
            <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 mb-5">
              <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-2">⚡ Следующий шаг</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{firstStepTitle}</p>
                  <p className="text-[10px] text-muted-foreground">+{createdPlan.impactPerStep}% к цели</p>
                </div>
                <button
                  onClick={() => { onClose(); navigate(`/goals/${createdGoalId}`); }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >
                  Сделать
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => { onClose(); navigate(`/goals/${createdGoalId}`); }}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
            >
              Открыть цель
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-muted-foreground text-sm"
            >
              Вернуться к списку целей
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stepTitles: Record<number, string> = {
    1: 'Название цели',
    2: 'Зачем тебе это?',
    3: 'Метрика успеха',
    4: 'Целевой срок',
    5: 'Сфера жизни',
    6: 'Автоплан',
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-3xl p-6 pb-8 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">Шаг {step} из {TOTAL_STEPS}</p>
          <button onClick={onClose} className="p-1.5 rounded-full bg-secondary/80">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-secondary rounded-full mb-5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <h2 className="text-lg font-bold mb-4">{stepTitles[step]}</h2>

        {/* Step 1: Title */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Начни с глагола: "Сдать…", "Накопить…", "Запустить…", "Выучить…"</p>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={GOAL_TITLE_MAX}
                placeholder="Например: Выучить испанский"
                className="form-input"
                autoFocus
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Примеры для вдохновения:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_GOALS.map(eg => (
                  <button
                    key={eg}
                    onClick={() => setTitle(eg)}
                    className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {eg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Why */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Зачем тебе это? 1–2 предложения. Это твоя личная мотивация.</p>
            <textarea
              value={why}
              onChange={e => setWhy(e.target.value)}
              maxLength={GOAL_DESCRIPTION_MAX}
              rows={3}
              placeholder="Чтобы чувствовать уверенность и расширить возможности карьеры..."
              className="form-input resize-none"
            />
            <div className="p-3 rounded-xl bg-secondary/50">
              <p className="text-[11px] text-muted-foreground italic">
                💡 Исследования показывают: когда записываешь "зачем", шанс достичь цели вырастает на 42%
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Metric */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground mb-1">Как ты поймёшь, что цель достигнута?</p>
            <div className="space-y-2">
              {([
                { id: 'milestones', label: '🏁 Этапы', desc: 'Выполнить серию вех и шагов' },
                { id: 'numeric', label: '📊 Число', desc: 'Достичь конкретного показателя' },
                { id: 'binary', label: '✅ Факт', desc: 'Сделано / не сделано' },
              ] as { id: ProgressMode; label: string; desc: string }[]).map(pm => (
                <button
                  key={pm.id}
                  onClick={() => setProgressMode(pm.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors border ${progressMode === pm.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40'}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{pm.label}</p>
                    <p className="text-[11px] text-muted-foreground">{pm.desc}</p>
                  </div>
                  {progressMode === pm.id && <Check size={16} className="text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>

            {progressMode === 'numeric' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Начальное значение</label>
                    <input
                      type="number"
                      value={startValue}
                      onChange={e => setStartValue(e.target.value)}
                      className="form-input"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Цель</label>
                    <input
                      type="number"
                      value={targetValue}
                      onChange={e => setTargetValue(e.target.value)}
                      className="form-input"
                      placeholder="100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Единица измерения</label>
                  <input
                    value={unitLabel}
                    onChange={e => setUnitLabel(e.target.value)}
                    className="form-input"
                    placeholder="кг, ₽, часов, страниц…"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Deadline */}
        {step === 4 && (
          <div className="space-y-4">
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="form-input"
              min={todayStr}
            />
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-secondary/50">
                <p className="text-[11px] text-muted-foreground">💡 Оптимально: <strong>4–12 недель</strong> для первой цели. Слишком далёкий срок снижает мотивацию.</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/50">
                <p className="text-[11px] text-muted-foreground">📌 Если срок дальний — мастер автоматически разобьёт цель на вехи.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '4 недели', weeks: 4 },
                { label: '8 недель', weeks: 8 },
                { label: '3 месяца', weeks: 12 },
                { label: '6 месяцев', weeks: 26 },
              ].map(opt => {
                const val = toLocalDateStr(addDaysLocal(new Date(), opt.weeks * 7));
                return (
                  <button
                    key={opt.label}
                    onClick={() => setTargetDate(val)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${targetDate === val ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border'}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 5: Sphere */}
        {step === 5 && (
          <div className="space-y-3">
            {(['personal', 'social'] as const).map(cat => (
              <div key={cat}>
                <p className="text-xs text-muted-foreground font-medium mb-2">{cat === 'personal' ? '👤 Личное' : '🌍 Социальное'}</p>
                <div className="grid grid-cols-4 gap-2">
                  {SPHERES.filter(s => s.category === cat).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSphere(s.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-colors border ${sphere === s.id ? 'border-primary bg-primary/10' : 'border-transparent bg-secondary hover:bg-secondary/80'}`}
                    >
                      <span className="text-xl">{s.icon}</span>
                      <span className="truncate w-full text-center text-[10px]">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 6: Auto-plan */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Интенсивность</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'easy', label: 'Легко', sub: '3 шага/нед', icon: '🌱' },
                  { id: 'normal', label: 'Нормально', sub: '5 шагов/нед', icon: '⚡' },
                  { id: 'sprint', label: 'Спринт', sub: '7 шагов/нед', icon: '🔥' },
                ] as { id: Intensity; label: string; sub: string; icon: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setIntensity(opt.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-colors ${intensity === opt.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40'}`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Дни недели</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_RU.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${selectedDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-secondary/50">
              <p className="text-[11px] text-muted-foreground">
                🤖 Мастер создаст <strong>4 вехи</strong> и <strong>{plannedStepCount} шагов</strong> на ближайшие 2 недели с реалистичными дедлайнами.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 gap-3">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            className={`p-2.5 rounded-xl bg-secondary/80 ${step === 1 ? 'opacity-40' : ''}`}
            disabled={step === 1}
          >
            <ChevronLeft size={18} />
          </button>

          {step === TOTAL_STEPS ? (
            <button
              onClick={handleCreate}
              disabled={!canNext[step] || isCreating}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCreating ? <><Loader2 size={16} className="animate-spin" /> Создаю план…</> : '🚀 Создать план'}
            </button>
          ) : (
            <>
              <button onClick={onClose} className="text-xs text-muted-foreground px-3">Пропустить</button>
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext[step]}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-50"
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
