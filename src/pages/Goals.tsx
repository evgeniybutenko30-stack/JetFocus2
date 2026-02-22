import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getSphereById, getSphereColor, getTodayStr } from '@/lib/constants';
import {
  Plus, Target, ChevronRight, Flame, TrendingUp, Calendar,
  Pin, Star, BarChart3, Search, Filter, BookOpen, Zap, Trophy, Circle, CheckCircle2, X
} from 'lucide-react';
import { LifeBalanceWheel } from '@/components/LifeBalanceWheel';
import { GoalTour } from '@/components/goals/GoalTour';
import { GoalWizard } from '@/components/goals/GoalWizard';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell
} from 'recharts';
import type { SphereType, GoalProgressLog, GoalStep } from '@/lib/types';

function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date(getTodayStr()).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getGoalHealth(logs: GoalProgressLog[], progress: number): 'healthy' | 'risk' | 'stalled' {
  if (progress >= 100) return 'healthy';
  const now = Date.now();
  const day = 86400000;
  const last3 = logs.filter(l => now - l.createdAt < 3 * day);
  if (last3.length > 0) return 'healthy';
  const last7 = logs.filter(l => now - l.createdAt < 7 * day);
  if (last7.length > 0) return 'risk';
  return 'stalled';
}

function getMomentum(logs: GoalProgressLog[]): { state: 'up' | 'down' | 'stable'; value: number } {
  const now = Date.now();
  const day = 86400000;
  const last7 = logs.filter(l => now - l.createdAt < 7 * day).reduce((s, l) => s + l.deltaValue, 0);
  const prev7 = logs.filter(l => now - l.createdAt >= 7 * day && now - l.createdAt < 14 * day).reduce((s, l) => s + l.deltaValue, 0);
  const diff = last7 - prev7;
  if (diff > 1) return { state: 'up', value: last7 };
  if (diff < -1) return { state: 'down', value: last7 };
  return { state: 'stable', value: last7 };
}

// Build 30-day progress trend
function buildProgressTrend(logs: GoalProgressLog[]): { day: string; value: number }[] {
  const map: Record<string, number> = {};
  logs.forEach(l => { map[l.date] = (map[l.date] || 0) + l.deltaValue; });
  let cumulative = 0;
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const str = d.toISOString().split('T')[0];
    cumulative += map[str] || 0;
    result.push({ day: str.slice(5), value: Math.round(cumulative * 10) / 10 });
  }
  return result;
}

// 35-day heatmap
function buildHeatmap(logs: GoalProgressLog[]): { date: string; value: number }[] {
  const map: Record<string, number> = {};
  logs.forEach(l => { map[l.date] = (map[l.date] || 0) + l.deltaValue; });
  const result = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const str = d.toISOString().split('T')[0];
    result.push({ date: str, value: map[str] || 0 });
  }
  return result;
}

const HEALTH_CFG = {
  healthy: { label: '🟢', color: 'text-green-500', bg: 'bg-green-500/10' },
  risk: { label: '🟡', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  stalled: { label: '🔴', color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function GoalsPage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'calendar'>('dashboard');
  const [search, setSearch] = useState('');
  const [filterSphere, setFilterSphere] = useState<SphereType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'completed'>('active');
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [goals, setGoals] = useState<any[]>([]);
  const [goalMilestones, setGoalMilestones] = useState<any[]>([]);
  const [goalActions, setGoalActions] = useState<any[]>([]);
  const [allProgressLogs] = useState<any[]>([]);
  const goalSteps: any[] = [];

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    const [goalsRes, milestonesRes, actionsRes] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id),
      supabase.from('goal_milestones').select('*').eq('user_id', user.id),
      supabase.from('goal_actions').select('*').eq('user_id', user.id),
    ]);
    if (goalsRes.data) setGoals(goalsRes.data.map((g: any) => ({
      ...g,
      userId: g.user_id,
      targetDate: g.target_date,
      isPinned: g.is_pinned ?? false,
      isAchieved: g.status === 'completed',
      createdAt: new Date(g.created_at).getTime(),
      progress: g.progress ?? 0,
      deadline: g.target_date,
    })));
    if (milestonesRes.data) setGoalMilestones(milestonesRes.data.map((m: any) => ({
      ...m,
      userId: m.user_id,
      goalId: m.goal_id,
      dueDate: m.due_date,
      orderIndex: m.order_index,
    })));
    if (actionsRes.data) setGoalActions(actionsRes.data.map((a: any) => ({
      ...a,
      userId: a.user_id,
      goalId: a.goal_id,
      dueDate: a.due_date,
      estimatedMinutes: a.estimated_minutes ?? 20,
      impactValue: a.impact ?? 5,
    })));
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = getTodayStr();
  const tourCompleted = localStorage.getItem('goals_tour_completed') === 'true';

  const activeGoals = goals.filter(g => g.status === 'active' || (!g.status && !g.isAchieved));
  const pinnedGoals = goals.filter(g => g.isPinned && (g.status === 'active' || (!g.status && !g.isAchieved))).slice(0, 3);
  const topGoals = pinnedGoals.length > 0 ? pinnedGoals : activeGoals.slice(0, 3);

  // Today's steps (from goalSteps + goalActions)
  const todaySteps: { id: string; title: string; goalId: string; estimatedMinutes: number; impactValue: number; source: 'step' | 'action' }[] = useMemo(() => {
    const steps = goalSteps
      .filter(s => s.status === 'todo' && (!s.dueDate || s.dueDate <= today))
      .slice(0, 3)
      .map(s => ({ id: s.id, title: s.title, goalId: s.goalId, estimatedMinutes: s.estimatedMinutes, impactValue: s.impactValue, source: 'step' as const }));
    if (steps.length < 3) {
      const extra = goalActions
        .filter(a => a.status === 'todo' && (!a.dueDate || a.dueDate <= today))
        .slice(0, 3 - steps.length)
        .map(a => ({ id: a.id, title: a.title, goalId: a.goalId, estimatedMinutes: a.estimatedMinutes || 20, impactValue: a.impact || 2, source: 'action' as const }));
      return [...steps, ...extra];
    }
    return steps;
  }, [goalSteps, goalActions, today]);

  // Upcoming milestones
  const upcomingMilestones = goalMilestones
    .filter(m => m.status === 'todo' && m.dueDate)
    .filter(m => { const d = getDaysUntil(m.dueDate); return d !== null && d >= 0 && d <= 14; })
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 4);

  // Progress trend
  const progressTrend = useMemo(() => buildProgressTrend(allProgressLogs), [allProgressLogs]);
  const heatmap = useMemo(() => buildHeatmap(allProgressLogs), [allProgressLogs]);

  // Sphere donut data
  const sphereData = useMemo(() => SPHERES.map(s => ({
    name: s.name,
    value: goals.filter(g => g.sphere === s.id).length,
    color: getSphereColor(s.id),
  })).filter(d => d.value > 0), [goals]);

  // Life wheel scores
  const sphereScores: Record<string, number> = {};
  SPHERES.forEach(s => {
    const sg = goals.filter(g => g.sphere === s.id && (g.status === 'active' || (!g.status && !g.isAchieved)));
    sphereScores[s.id] = sg.length === 0 ? 0 : Math.round(sg.reduce((sum, g) => sum + (g.progress || 0), 0) / sg.length / 10);
  });

  // Filtered list
  const filteredGoals = goals
    .filter(g => {
      if (filterStatus === 'active') return g.status === 'active' || (!g.status && !g.isAchieved);
      if (filterStatus === 'paused') return g.status === 'paused';
      if (filterStatus === 'completed') return g.isAchieved || g.status === 'completed';
      return true;
    })
    .filter(g => filterSphere === 'all' || g.sphere === filterSphere)
    .filter(g => !search || g.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });

  async function togglePin(goalId: string, isPinned: boolean) {
    await supabase.from('goals').update({ is_pinned: !isPinned }).eq('id', goalId);
    fetchData();
  }
  async function pauseGoal(goalId: string, status: string) {
    await supabase.from('goals').update({ status: status === 'paused' ? 'active' : 'paused' }).eq('id', goalId);
    fetchData();
  }
  async function archiveGoal(goalId: string) {
    await supabase.from('goals').update({ status: 'archived' }).eq('id', goalId);
    fetchData();
  }

  async function completeStep(step: { id: string; goalId: string; impactValue: number; source: 'step' | 'action' }) {
    const goal = goals.find(g => g.id === step.goalId);
    await supabase.from('goal_actions').update({ status: 'done' }).eq('id', step.id);
    if (goal) {
      const newProgress = Math.min(100, (goal.progress || 0) + step.impactValue);
      await supabase.from('goals').update({ progress: newProgress }).eq('id', goal.id);
    }
    fetchData();
  }

  // Calendar: get days of current month
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [calendarDate]);

  const calPadding = calendarDays[0].getDay();

  const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

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

      {/* ===== DASHBOARD TAB ===== */}
      {activeTab === 'dashboard' && (
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
                  const goal = goals.find(g => g.id === step.goalId);
                  const sphere = goal ? getSphereById(goal.sphere) : null;
                  return (
                    <div key={step.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50">
                      <button
                        onClick={() => completeStep(step)}
                        className="w-6 h-6 rounded-full border-2 border-primary/40 flex items-center justify-center flex-shrink-0 hover:bg-primary/20 transition-colors"
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
                  const sphere = getSphereById(g.sphere);
                  const sphereColor = getSphereColor(g.sphere);
                  const days = getDaysUntil(g.deadline || g.targetDate);
                  const goalLogs = allProgressLogs.filter(l => l.goalId === g.id);
                  const health = getGoalHealth(goalLogs, g.progress);
                  const momentum = getMomentum(goalLogs);
                  const nextStep = goalSteps.find(s => s.goalId === g.id && s.status === 'todo')
                    || goalActions.find(a => a.goalId === g.id && a.status === 'todo');
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
                          <span className="text-sm font-bold" style={{ color: sphereColor }}>{g.progress}%</span>
                          <span className={`text-[10px] font-medium ${momentum.state === 'up' ? 'text-orange-400' : momentum.state === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {momentum.state === 'up' ? '🔥' : momentum.state === 'down' ? '⚠️' : '─'}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full transition-all" style={{ width: `${g.progress}%`, backgroundColor: sphereColor }} />
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
              {heatmap.map((d, i) => {
                const intensity = d.value === 0 ? 0 : d.value < 2 ? 1 : d.value < 5 ? 2 : 3;
                return (
                  <div
                    key={i}
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
                  const goal = goals.find(g => g.id === m.goalId);
                  const days = getDaysUntil(m.dueDate);
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
      {activeTab === 'list' && (
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
                const sphere = getSphereById(g.sphere);
                const sphereColor = getSphereColor(g.sphere);
                const days = getDaysUntil(g.deadline || g.targetDate);
                const goalLogs = allProgressLogs.filter(l => l.goalId === g.id);
                const health = getGoalHealth(goalLogs, g.progress);
                const hcfg = HEALTH_CFG[health];

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
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: sphereColor }}>{g.progress}%</span>
                    </div>

                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full" style={{ width: `${g.progress}%`, backgroundColor: sphereColor }} />
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => togglePin(g.id, g.isPinned)}
                        className={`p-1.5 rounded-lg text-[10px] flex items-center gap-1 ${g.isPinned ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}
                      >
                        <Pin size={11} /> {g.isPinned ? 'Откреп.' : 'Закреп.'}
                      </button>
                      <button
                        onClick={() => pauseGoal(g.id, g.status)}
                        className="p-1.5 rounded-lg text-[10px] bg-secondary text-muted-foreground flex items-center gap-1"
                      >
                        {g.status === 'paused' ? '▶ Продолжить' : '⏸ Пауза'}
                      </button>
                      <button
                        onClick={() => archiveGoal(g.id)}
                        className="p-1.5 rounded-lg text-[10px] bg-secondary text-muted-foreground flex items-center gap-1 ml-auto"
                      >
                        📦 Архив
                      </button>
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
      {activeTab === 'calendar' && (
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
              const dateStr = date.toISOString().split('T')[0];
              const daySteps = goalSteps.filter(s => s.dueDate === dateStr);
              const dayActions = goalActions.filter(a => a.dueDate === dateStr);
              const dayMilestones = goalMilestones.filter(m => m.dueDate === dateStr);
              const total = daySteps.length + dayActions.length + dayMilestones.length;
              const isToday = dateStr === today;
              const hasDone = daySteps.some(s => s.status === 'done') || dayActions.some(a => a.status === 'done');

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (total > 0) {
                      // Navigate to first goal that has items this day
                      const firstGoalId = daySteps[0]?.goalId || dayActions[0]?.goalId || dayMilestones[0]?.goalId;
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
                      {(daySteps.length > 0 || dayActions.length > 0) && (
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

          {goalSteps.length === 0 && goalActions.length === 0 && goalMilestones.length === 0 && (
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
