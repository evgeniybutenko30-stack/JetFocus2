import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getSphereById, getSphereColor, getTodayStr } from '@/lib/constants';
import {
  Plus, Target, ChevronRight, TrendingUp, Calendar,
  Pin, Star, BarChart3, Search, BookOpen, Zap, Trophy, Circle, X, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { LifeBalanceWheel } from '@/components/LifeBalanceWheel';
import { GoalTour } from '@/components/goals/GoalTour';
import { GoalWizard } from '@/components/goals/GoalWizard';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell
} from 'recharts';
import type { SphereType } from '@/lib/types';
import {
  listGoals, listAllMilestones, listAllActions, listProgressLogs, updateGoal, toggleGoalAction,
  addDaysLocal, buildDailyProgress, clampProgress, daysUntil as getDaysUntil, getGoalHealth, getMomentum,
  isGoalActive, isGoalsTourCompleted, toLocalDateStr,
  type GoalRow, type MilestoneRow, type ActionRow, type ProgressLogRow,
} from '@/lib/goalsService';
import { toast } from 'sonner';

const HEALTH_CFG = {
  healthy: { label: '🟢', color: 'text-green-500', bg: 'bg-green-500/10' },
  risk: { label: '🟡', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  stalled: { label: '🔴', color: 'text-destructive', bg: 'bg-destructive/10' },
};

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Logs older than the longest window the dashboard shows (35-day heatmap) are not needed. */
const LOG_WINDOW_DAYS = 35;

function goalDeadline(g: GoalRow): string | null | undefined {
  return g.deadline || g.target_date;
}

function goalCreatedMs(g: GoalRow): number {
  const t = Date.parse(g.created_at);
  return Number.isFinite(t) ? t : 0;
}

interface TodayStep {
  id: string;
  title: string;
  goalId: string;
  estimatedMinutes: number;
  impactValue: number;
}

export default function GoalsPage() {
  const user = useAuthStore(s => s.user);
  const loadProfile = useAuthStore(s => s.loadProfile);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'calendar'>('dashboard');
  const [search, setSearch] = useState('');
  const [filterSphere, setFilterSphere] = useState<SphereType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'completed'>('active');
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalMilestones, setGoalMilestones] = useState<MilestoneRow[]>([]);
  const [goalActions, setGoalActions] = useState<ActionRow[]>([]);
  const [allProgressLogs, setAllProgressLogs] = useState<ProgressLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Id of the goal/step being saved: blocks double taps and overlapping progress writes.
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user?.id) {
      setGoals([]);
      setGoalMilestones([]);
      setGoalActions([]);
      setAllProgressLogs([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    try {
      const since = toLocalDateStr(addDaysLocal(new Date(), -LOG_WINDOW_DAYS));
      const [goalsRes, milestonesRes, actionsRes, logsRes] = await Promise.all([
        listGoals(user.id),
        listAllMilestones(user.id),
        listAllActions(user.id),
        listProgressLogs(user.id, since),
      ]);
      // A newer request (or unmount) superseded this one.
      if (requestId !== requestIdRef.current) return;
      if (goalsRes.error) {
        setLoadError(goalsRes.error.message);
        return;
      }
      setGoals(goalsRes.data);
      setGoalMilestones(milestonesRes.data);
      setGoalActions(actionsRes.data);
      // Activity history is optional: a missing table just means no history.
      setAllProgressLogs(logsRes.data);
      setLoadError(milestonesRes.error?.message ?? actionsRes.error?.message ?? null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить цели');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const today = getTodayStr();
  const tourCompleted = isGoalsTourCompleted();

  const goalsById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);
  const activeGoals = goals.filter(isGoalActive);
  const pinnedGoals = activeGoals.filter(g => g.is_pinned).slice(0, 3);
  const topGoals = pinnedGoals.length > 0 ? pinnedGoals : activeGoals.slice(0, 3);

  // Today's steps — only for goals that exist and are active (not paused/archived/completed)
  const todaySteps: TodayStep[] = useMemo(() => goalActions
    .filter(a => {
      const g = goalsById.get(a.goal_id);
      return !!g && isGoalActive(g) && a.status === 'todo' && (!a.due_date || a.due_date <= today);
    })
    .slice(0, 3)
    .map(a => ({
      id: a.id,
      title: a.title,
      goalId: a.goal_id,
      estimatedMinutes: a.estimated_minutes || 20,
      impactValue: a.impact || 2,
    })), [goalActions, goalsById, today]);

  // Upcoming milestones
  const upcomingMilestones = goalMilestones
    .filter(m => m.status === 'todo' && m.due_date && goalsById.has(m.goal_id))
    .filter(m => { const d = getDaysUntil(m.due_date, today); return d !== null && d >= 0 && d <= 14; })
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, 4);

  // Progress trend & heatmap (local calendar days)
  const progressTrend = useMemo(() => {
    let cumulative = 0;
    return buildDailyProgress(allProgressLogs, 30).map(d => {
      cumulative += d.value;
      return { day: d.date.slice(5), value: Math.round(cumulative * 10) / 10 };
    });
  }, [allProgressLogs]);
  const heatmap = useMemo(() => buildDailyProgress(allProgressLogs, LOG_WINDOW_DAYS), [allProgressLogs]);

  // Sphere donut data
  const sphereData = useMemo(() => SPHERES.map(s => ({
    name: s.name,
    value: goals.filter(g => g.sphere === s.id).length,
    color: getSphereColor(s.id),
  })).filter(d => d.value > 0), [goals]);

  // Life wheel scores
  const sphereScores: Record<string, number> = {};
  SPHERES.forEach(s => {
    const sg = activeGoals.filter(g => g.sphere === s.id);
    sphereScores[s.id] = sg.length === 0 ? 0 : Math.round(sg.reduce((sum, g) => sum + clampProgress(g.progress), 0) / sg.length / 10);
  });

  // Filtered list
  const filteredGoals = goals
    .filter(g => {
      if (filterStatus === 'active') return isGoalActive(g);
      if (filterStatus === 'paused') return g.status === 'paused';
      if (filterStatus === 'completed') return g.is_achieved || g.status === 'completed';
      return true;
    })
    .filter(g => filterSphere === 'all' || g.sphere === filterSphere)
    .filter(g => !search || (g.title ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return goalCreatedMs(b) - goalCreatedMs(a);
    });

  async function withBusy(id: string, task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    try {
      await task();
    } catch (err) {
      console.error(err);
      toast.error('Что-то пошло не так. Попробуйте ещё раз.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function patchGoal(goalId: string, patch: Partial<Pick<GoalRow, 'is_pinned' | 'status'>>): Promise<boolean> {
    if (!user?.id) return false;
    const { error } = await updateGoal(goalId, user.id, patch);
    if (error) {
      toast.error('Не удалось сохранить: ' + error.message);
      return false;
    }
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...patch } : g));
    return true;
  }

  function togglePin(goalId: string, isPinned: boolean) {
    void withBusy(goalId, async () => { await patchGoal(goalId, { is_pinned: !isPinned }); });
  }
  function pauseGoal(goalId: string, status: string) {
    const next = status === 'paused' || status === 'archived' ? 'active' : 'paused';
    void withBusy(goalId, async () => { await patchGoal(goalId, { status: next }); });
  }
  function archiveGoal(goalId: string, prevStatus: string) {
    void withBusy(goalId, async () => {
      if (!(await patchGoal(goalId, { status: 'archived' }))) return;
      toast.success('Цель перенесена в архив', {
        action: {
          label: 'Отменить',
          onClick: () => { void withBusy(goalId, async () => { await patchGoal(goalId, { status: prevStatus || 'active' }); }); },
        },
      });
    });
  }

  function completeStep(step: TodayStep) {
    const goal = goalsById.get(step.goalId);
    const action = goalActions.find(a => a.id === step.id);
    if (!goal || !action || !user?.id) return;
    const userId = user.id;
    void withBusy(step.id, async () => {
      // Same rules as the goal page: progress, completion status and stars.
      const res = await toggleGoalAction(goal, action, userId);
      if (res.error) { toast.error('Не удалось сохранить: ' + res.error.message); return; }
      setGoalActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'done' } : a));
      setGoals(prev => prev.map(g => g.id === goal.id
        ? { ...g, progress: res.progress, status: res.status, is_achieved: res.isAchieved }
        : g));
      toast.success(res.justCompleted ? '🎉 Цель достигнута! +50⭐' : `+${clampProgress(action.impact)}% к цели! 💪`);
      void loadProfile();
      void fetchData();
    });
  }

  // Calendar: get days of current month
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [calendarDate]);

  const calPadding = calendarDays[0].getDay();

  // Calendar items grouped by date (items of deleted goals are skipped)
  const calendarActions = useMemo(() => {
    const map = new Map<string, ActionRow[]>();
    goalActions.forEach(a => {
      if (!a.due_date || !goalsById.has(a.goal_id)) return;
      const list = map.get(a.due_date);
      if (list) list.push(a); else map.set(a.due_date, [a]);
    });
    return map;
  }, [goalActions, goalsById]);
  const calendarMilestones = useMemo(() => {
    const map = new Map<string, MilestoneRow[]>();
    goalMilestones.forEach(m => {
      if (!m.due_date || !goalsById.has(m.goal_id)) return;
      const list = map.get(m.due_date);
      if (list) list.push(m); else map.set(m.due_date, [m]);
    });
    return map;
  }, [goalMilestones, goalsById]);

  return (
    <>
      {showTour && <GoalTour onClose={() => setShowTour(false)} onStartWizard={() => { setShowTour(false); setShowWizard(true); }} />}
      {showWizard && <GoalWizard onClose={() => { setShowWizard(false); fetchData(); }} />}
    <div className="flex flex-col min-h-screen pb-20">

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30 flex-shrink-0">
        <h1 className="text-lg font-bold">Цели</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTour(true)}
            className="p-2 rounded-lg bg-secondary text-muted-foreground"
            title="Быстрый тур"
          >
            <BookOpen size={16} />
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="p-2 rounded-lg bg-primary text-primary-foreground"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        {(['dashboard', 'list', 'calendar'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            {t === 'dashboard' ? 'Дашборд' : t === 'list' ? 'Все цели' : 'Календарь'}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-2">
            <AlertTriangle size={14} className="text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive flex-1 min-w-0 break-words">Не удалось загрузить цели: {loadError}</p>
            <button onClick={() => { void fetchData(); }} className="p-1.5 rounded-lg bg-secondary text-muted-foreground flex-shrink-0" title="Повторить">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ===== DASHBOARD TAB ===== */}
      {!loading && activeTab === 'dashboard' && (
        <div className="flex-1 px-4 py-3 space-y-4 max-w-lg mx-auto w-full overflow-y-auto">

          {/* Tutorial card (always visible or as empty state) */}
          {(goals.length === 0 || !tourCompleted) && (
            <div className="glass-card p-4 border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Как пользоваться целями</p>
                  <p className="text-[11px] text-muted-foreground">Узнай за 2 минуты</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTour(true)}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
                >
                  Начать обучение
                </button>
                <button
                  onClick={() => setShowWizard(true)}
                  className="flex-1 py-2 bg-secondary text-foreground rounded-xl text-sm font-medium"
                >
                  🚀 Создать цель
                </button>
              </div>
            </div>
          )}

          {/* TODAY'S STEPS */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Target size={14} className="text-primary" />
              </div>
              <p className="text-sm font-semibold">Сделать сегодня</p>
              <span className="ml-auto text-xs text-muted-foreground">{todaySteps.length} шага</span>
            </div>
            {todaySteps.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">Нет шагов на сегодня</p>
                <button onClick={() => setShowWizard(true)} className="text-xs text-primary font-medium">
                  + Создать цель с планом
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySteps.map(step => {
                  const goal = goalsById.get(step.goalId);
                  const sphere = goal ? getSphereById(goal.sphere as SphereType) : null;
                  return (
                    <div key={step.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50">
                      <button
                        onClick={() => completeStep(step)}
                        disabled={busyId !== null}
                        aria-label="Отметить шаг выполненным"
                        className="w-6 h-6 rounded-full border-2 border-primary/40 flex items-center justify-center flex-shrink-0 hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        <Circle size={12} className="text-primary/50" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{step.title}</p>
                        {goal && sphere && (
                          <p className="text-[10px] text-muted-foreground">{sphere.icon} {goal.title}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-primary font-semibold">+{step.impactValue}%</span>
                        <span className="text-[10px] text-muted-foreground">{step.estimatedMinutes}м</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TOP PINNED GOALS */}
          {topGoals.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Pin size={13} className="text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Топ цели</p>
                </div>
                <button onClick={() => setActiveTab('list')} className="text-xs text-primary">Все →</button>
              </div>
              <div className="space-y-2">
                {topGoals.map(g => {
                  const sphere = getSphereById(g.sphere as SphereType);
                  const sphereColor = getSphereColor(g.sphere as SphereType);
                  const progress = clampProgress(g.progress);
                  const days = getDaysUntil(goalDeadline(g), today);
                  const goalLogs = allProgressLogs.filter(l => l.goal_id === g.id);
                  const health = getGoalHealth(goalLogs, progress);
                  const momentum = getMomentum(goalLogs);
                  const nextStep = goalActions.find(a => a.goal_id === g.id && a.status === 'todo');
                  const hcfg = HEALTH_CFG[health];

                  return (
                    <div
                      key={g.id}
                      className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all"
                      onClick={() => navigate(`/goals/${g.id}`)}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <span className="text-xl flex-shrink-0 mt-0.5">{sphere.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-tight">{g.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{sphere.name}</span>
                            {days !== null && (
                              <span className={`text-[10px] ${days < 7 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                · {days < 0 ? `просрочено ${Math.abs(days)}д` : `${days}д`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-sm font-bold" style={{ color: sphereColor }}>{progress}%</span>
                          <span className={`text-[10px] font-medium ${momentum.state === 'up' ? 'text-orange-400' : momentum.state === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {momentum.state === 'up' ? '🔥' : momentum.state === 'down' ? '⚠️' : '─'}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: sphereColor }} />
                      </div>

                      {/* Health + Next step */}
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${hcfg.bg} ${hcfg.color}`}>
                          {hcfg.label} {health === 'healthy' ? 'норм' : health === 'risk' ? 'риск' : 'стоп'}
                        </span>
                        {nextStep && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <Zap size={10} className="text-primary flex-shrink-0" />
                            <p className="text-[10px] text-primary truncate">{nextStep.title}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PROGRESS TREND LINE CHART */}
          {allProgressLogs.length > 0 && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-primary" />
                <p className="text-sm font-semibold">Прогресс за 30 дней</p>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={progressTrend}>
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    labelFormatter={v => v}
                    formatter={(v: number) => [`+${v}%`, 'Прогресс']}
                  />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ACTIVITY HEATMAP */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} className="text-primary" />
              <p className="text-sm font-semibold">Активность (35 дней)</p>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {heatmap.map(d => {
                const intensity = d.value <= 0 ? 0 : d.value < 2 ? 1 : d.value < 5 ? 2 : 3;
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: +${d.value}%`}
                    className={`aspect-square rounded-sm transition-colors ${
                      intensity === 0 ? 'bg-secondary' :
                      intensity === 1 ? 'bg-primary/20' :
                      intensity === 2 ? 'bg-primary/50' : 'bg-primary'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-1 mt-2">
              <span className="text-[10px] text-muted-foreground">Меньше</span>
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i === 0 ? 'bg-secondary' : i === 1 ? 'bg-primary/20' : i === 2 ? 'bg-primary/50' : 'bg-primary'}`} />
              ))}
              <span className="text-[10px] text-muted-foreground">Больше</span>
            </div>
          </div>

          {/* SPHERE BALANCE (Donut) */}
          {sphereData.length > 0 && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-primary" />
                <p className="text-sm font-semibold">Баланс сфер</p>
              </div>
              <div className="flex items-center gap-4">
                <PieChart width={100} height={100}>
                  <Pie data={sphereData} cx={45} cy={45} innerRadius={28} outerRadius={45} dataKey="value" paddingAngle={2}>
                    {sphereData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
                <div className="flex-1 grid grid-cols-2 gap-1">
                  {sphereData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                      <span className="font-medium ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LIFE WHEEL */}
          {Object.values(sphereScores).some(v => v > 0) && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={14} className="text-primary" />
                <p className="text-sm font-semibold">Колесо жизни по целям</p>
              </div>
              <LifeBalanceWheel values={sphereScores} size={180} />
            </div>
          )}

          {/* UPCOMING MILESTONES */}
          {upcomingMilestones.length > 0 && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star size={14} className="text-primary" />
                <p className="text-sm font-semibold">Ближайшие вехи (14 дней)</p>
              </div>
              <div className="space-y-2">
                {upcomingMilestones.map(m => {
                  const goal = goalsById.get(m.goal_id);
                  const days = getDaysUntil(m.due_date, today);
                  return (
                    <div
                      key={m.id}
                      onClick={() => goal && navigate(`/goals/${goal.id}`)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${days === 0 ? 'bg-primary/20 text-primary' : days !== null && days <= 3 ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                        {days === 0 ? '!' : days}д
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.title}</p>
                        {goal && <p className="text-[10px] text-muted-foreground truncate">{goal.title}</p>}
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {goals.length === 0 && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🎯</div>
              <h2 className="text-lg font-bold mb-1">Поставь первую цель</h2>
              <p className="text-sm text-muted-foreground mb-6">Цель — это начало. Мастер поможет разбить её на шаги.</p>
              <button
                onClick={() => setShowWizard(true)}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-semibold"
              >
                🚀 Создать цель с планом
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== LIST TAB ===== */}
      {!loading && activeTab === 'list' && (
        <div className="flex-1 px-4 py-3 space-y-3 max-w-lg mx-auto w-full overflow-y-auto">

          {/* Tour hint */}
          <button
            onClick={() => setShowTour(true)}
            className="w-full flex items-center gap-2 p-3 rounded-xl bg-secondary/50 text-left"
          >
            <BookOpen size={14} className="text-primary" />
            <p className="text-xs text-muted-foreground">Как правильно ставить цели?</p>
            <ChevronRight size={14} className="text-muted-foreground ml-auto" />
          </button>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск целей..."
              className="form-input pl-9 py-2.5 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {(['all', 'active', 'paused', 'completed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
              >
                {s === 'all' ? 'Все' : s === 'active' ? 'Активные' : s === 'paused' ? 'Пауза' : 'Завершённые'}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setFilterSphere('all')}
              className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap flex-shrink-0 ${filterSphere === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
            >
              Все сферы
            </button>
            {SPHERES.map(s => (
              <button
                key={s.id}
                onClick={() => setFilterSphere(s.id)}
                className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${filterSphere === s.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>

          {/* Goals list */}
          {filteredGoals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">🎯</p>
              <p className="text-sm text-muted-foreground mb-4">
                {goals.length === 0 ? 'Целей пока нет' : 'Нет целей по фильтрам'}
              </p>
              <button onClick={() => setShowWizard(true)} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">
                Создать цель
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGoals.map(g => {
                const sphere = getSphereById(g.sphere as SphereType);
                const sphereColor = getSphereColor(g.sphere as SphereType);
                const progress = clampProgress(g.progress);
                const days = getDaysUntil(goalDeadline(g), today);
                const goalLogs = allProgressLogs.filter(l => l.goal_id === g.id);
                const health = getGoalHealth(goalLogs, progress);
                const hcfg = HEALTH_CFG[health];
                const isBusy = busyId === g.id;

                return (
                  <div
                    key={g.id}
                    className="glass-card p-3.5 cursor-pointer hover:border-primary/30 transition-all"
                    onClick={() => navigate(`/goals/${g.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg flex-shrink-0">{sphere.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{g.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{sphere.name}</span>
                          {days !== null && (
                            <span className={`text-[10px] ${days < 0 ? 'text-destructive' : days < 7 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                              · {days < 0 ? `просрочено` : `${days}д`}
                            </span>
                          )}
                          <span className={`text-[10px] px-1 py-0.5 rounded-full ${hcfg.bg} ${hcfg.color}`}>{hcfg.label}</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: sphereColor }}>{progress}%</span>
                    </div>

                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: sphereColor }} />
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => togglePin(g.id, g.is_pinned)}
                        disabled={isBusy}
                        className={`p-1.5 rounded-lg text-[10px] flex items-center gap-1 disabled:opacity-50 ${g.is_pinned ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}
                      >
                        <Pin size={11} /> {g.is_pinned ? 'Откреп.' : 'Закреп.'}
                      </button>
                      <button
                        onClick={() => pauseGoal(g.id, g.status)}
                        disabled={isBusy}
                        className="p-1.5 rounded-lg text-[10px] bg-secondary text-muted-foreground flex items-center gap-1 disabled:opacity-50"
                      >
                        {g.status === 'paused' ? '▶ Продолжить' : g.status === 'archived' ? '▶ Вернуть' : '⏸ Пауза'}
                      </button>
                      {g.status !== 'archived' && (
                      <button
                        onClick={() => archiveGoal(g.id, g.status)}
                        disabled={isBusy}
                        className="p-1.5 rounded-lg text-[10px] bg-secondary text-muted-foreground flex items-center gap-1 ml-auto disabled:opacity-50"
                      >
                        📦 Архив
                      </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setShowWizard(true)}
            className="w-full py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Новая цель
          </button>
        </div>
      )}

      {/* ===== CALENDAR TAB ===== */}
      {!loading && activeTab === 'calendar' && (
        <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full overflow-y-auto">

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="p-2 rounded-lg bg-secondary text-muted-foreground"
            >
              ‹
            </button>
            <p className="text-sm font-bold">{MONTHS_RU[calendarDate.getMonth()]} {calendarDate.getFullYear()}</p>
            <button
              onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="p-2 rounded-lg bg-secondary text-muted-foreground"
            >
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map(d => (
              <div key={d} className="text-center text-[10px] text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calPadding }).map((_, i) => <div key={`pad-${i}`} />)}
            {calendarDays.map(date => {
              // Local calendar day: toISOString() shifted every cell a day back in UTC+ zones.
              const dateStr = toLocalDateStr(date);
              const dayActions = calendarActions.get(dateStr) ?? [];
              const dayMilestones = calendarMilestones.get(dateStr) ?? [];
              const total = dayActions.length + dayMilestones.length;
              const isToday = dateStr === today;
              const hasDone = dayActions.some(a => a.status === 'done');

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (total > 0) {
                      // Navigate to first goal that has items this day
                      const firstGoalId = dayActions[0]?.goal_id || dayMilestones[0]?.goal_id;
                      if (firstGoalId) navigate(`/goals/${firstGoalId}`);
                    }
                  }}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 transition-colors relative ${
                    isToday ? 'border border-primary bg-primary/10' :
                    total > 0 ? 'bg-secondary/60 hover:bg-secondary' : 'bg-transparent'
                  }`}
                >
                  <span className={`text-[11px] font-medium ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {date.getDate()}
                  </span>
                  {total > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dayMilestones.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                      {dayActions.length > 0 && (
                        <div className={`w-1.5 h-1.5 rounded-full ${hasDone ? 'bg-green-500' : 'bg-primary/70'}`} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 justify-center">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-yellow-400" /> Вехи
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary/70" /> Шаги
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-green-500" /> Выполнено
            </div>
          </div>

          {calendarActions.size === 0 && calendarMilestones.size === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">Нет запланированных шагов и вех</p>
              <button onClick={() => setShowWizard(true)} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">
                Создать цель с планом
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
