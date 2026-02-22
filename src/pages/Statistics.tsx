import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { ArrowLeft, BarChart3, TrendingDown, TrendingUp, Scale } from 'lucide-react';

import { SPHERES, getSphereColor, PERSONAL_SPHERES, SOCIAL_SPHERES } from '@/lib/constants';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { subDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function StatisticsPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<'stats' | 'spheres' | 'balance'>('stats');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('week');

  const habits = useLiveQuery(() => db.habits.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const habitLogs = useLiveQuery(() => db.habitLogs.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const goals = useLiveQuery(() => db.goals.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const ops = useLiveQuery(() => db.financeOperations.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];

  const days = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;

  // Trend data
  const trendData = useMemo(() => {
    const data: { date: string; label: string; habits: number; tasks: number }[] = [];
    const step = days > 30 ? Math.ceil(days / 20) : 1;
    for (let i = days - 1; i >= 0; i -= step) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayHabitsDone = habitLogs.filter(l => l.date === dateStr && l.status === 'DONE').length;
      const dayTasksDone = tasks.filter(t => t.completedAt && format(new Date(t.completedAt), 'yyyy-MM-dd') === dateStr).length;
      data.push({
        date: dateStr,
        label: format(d, days > 30 ? 'd MMM' : 'dd.MM', { locale: ru }),
        habits: dayHabitsDone,
        tasks: dayTasksDone,
      });
    }
    return data;
  }, [habitLogs, tasks, days]);

  const totalHabitsDone = habitLogs.filter(l => l.status === 'DONE').length;
  const totalTasksDone = tasks.filter(t => t.status === 'DONE').length;
  const activeHabits = habits.filter(h => !h.isArchived).length;

  const avgProductivity = useMemo(() => {
    if (trendData.length === 0 || activeHabits === 0) return 0;
    const totalDone = trendData.reduce((s, d) => s + d.habits, 0);
    return Math.round((totalDone / (trendData.length * activeHabits)) * 100);
  }, [trendData, activeHabits]);

  // Sphere scores
  const sphereScores = useMemo(() => {
    return SPHERES.map(s => {
      const sHabits = habitLogs.filter(l => {
        const h = habits.find(h => h.id === l.habitId);
        return h?.sphere === s.id && l.status === 'DONE';
      }).length;
      const sTasks = tasks.filter(t => t.sphere === s.id && t.status === 'DONE').length;
      const sGoalsProg = goals.filter(g => g.sphere === s.id).reduce((sum, g) => sum + g.progress, 0);
      const sGoalsCount = goals.filter(g => g.sphere === s.id).length;
      const score = sHabits * 2 + sTasks * 3 + (sGoalsCount > 0 ? sGoalsProg / sGoalsCount : 0);
      return { ...s, score: Math.min(Math.round(score), 100), color: getSphereColor(s.id) };
    });
  }, [habits, habitLogs, tasks, goals]);

  // Balance: personal vs social
  const personalScore = sphereScores.filter(s => s.category === 'personal').reduce((sum, s) => sum + s.score, 0);
  const socialScore = sphereScores.filter(s => s.category === 'social').reduce((sum, s) => sum + s.score, 0);
  const totalScore = personalScore + socialScore || 1;
  const personalPercent = Math.round((personalScore / totalScore) * 100);
  const socialPercent = 100 - personalPercent;

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full fade-in space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <BarChart3 size={20} className="text-primary" />
          <div><h1 className="text-lg font-bold">Статистика</h1><p className="text-xs text-muted-foreground">Аналитика продуктивности</p></div>
        </div>

        {/* Main tabs */}
        <div className="flex bg-secondary rounded-lg p-0.5">
          {[
            { k: 'stats' as const, l: '📊 Обзор' },
            { k: 'spheres' as const, l: '🎯 Сферы' },
            { k: 'balance' as const, l: '⚖️ Баланс' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex-1 py-2 text-xs font-medium rounded-md ${tab === t.k ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {(['week', 'month', 'quarter', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`pill-btn ${period === p ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : p === 'quarter' ? 'Квартал' : 'Год'}
            </button>
          ))}
        </div>

        {/* STATS TAB */}
        {tab === 'stats' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card p-3">
                <p className="text-2xl font-bold text-primary">{totalHabitsDone}</p>
                <p className="text-[10px] text-muted-foreground">Привычек выполнено</p>
                <p className="text-[10px] text-muted-foreground">{activeHabits} активных</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-2xl font-bold">{totalTasksDone}</p>
                <p className="text-[10px] text-muted-foreground">Задач выполнено</p>
                <p className="text-[10px] text-muted-foreground">{tasks.length} всего</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-2xl font-bold text-primary">{avgProductivity}%</p>
                <p className="text-[10px] text-muted-foreground">Продуктивность</p>
                <p className="text-[10px] text-muted-foreground">в среднем</p>
              </div>
            </div>

            <div className="glass-card p-4">
              <h3 className="text-sm font-bold mb-3">Тренд продуктивности</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225,12%,18%)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ background: 'hsl(225,20%,10%)', border: '1px solid hsl(225,12%,18%)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="habits" stroke="hsl(162,85%,49%)" strokeWidth={2} name="Привычки" dot={false} />
                  <Line type="monotone" dataKey="tasks" stroke="#3b82f6" strokeWidth={2} name="Задачи" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-sm font-bold mb-1">{goals.filter(g => g.isAchieved).length}/{goals.length}</p>
                <p className="text-xs text-muted-foreground">Целей достигнуто</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-sm font-bold mb-1">{ops.length}</p>
                <p className="text-xs text-muted-foreground">Финансовых операций</p>
              </div>
            </div>
          </>
        )}

        {/* SPHERES TAB */}
        {tab === 'spheres' && (
          <>
            <div className="glass-card p-4">
              <h3 className="text-sm font-bold mb-3">Активность по сферам</h3>
              <div className="flex justify-center mb-4">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={sphereScores.filter(s => s.score > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="score" paddingAngle={3}>
                      {sphereScores.filter(s => s.score > 0).map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {sphereScores.sort((a, b) => b.score - a.score).map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-sm">{s.icon}</span>
                    <span className="text-xs w-12">{s.name}</span>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.score}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="text-[10px] font-bold w-8 text-right">{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* BALANCE TAB */}
        {tab === 'balance' && (
          <>
            {/* Balance scales visualization */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-bold mb-4 text-center flex items-center justify-center gap-2">
                <Scale size={16} className="text-primary" /> Баланс жизни
              </h3>
              <div className="flex items-end justify-center gap-6 mb-4 h-32">
                {/* Personal */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 bg-primary/20 rounded-t-xl transition-all" style={{ height: `${personalPercent * 1.2}px` }}>
                    <div className="w-full h-full bg-gradient-to-t from-primary/40 to-primary/10 rounded-t-xl flex items-end justify-center pb-2">
                      <span className="text-xs font-bold text-primary">{personalPercent}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium">Личное</span>
                </div>

                {/* Scale icon */}
                <div className="flex flex-col items-center pb-6">
                  <Scale size={32} className={`${Math.abs(personalPercent - 50) <= 10 ? 'text-primary' : 'text-[hsl(var(--accent-secondary))]'}`} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {Math.abs(personalPercent - 50) <= 5 ? '✨ Идеальный баланс!' :
                     Math.abs(personalPercent - 50) <= 10 ? '👍 Хороший баланс' :
                     personalPercent > socialPercent ? '⚠️ Перекос в личное' : '⚠️ Перекос в социальное'}
                  </p>
                </div>

                {/* Social */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 bg-blue-500/20 rounded-t-xl transition-all" style={{ height: `${socialPercent * 1.2}px` }}>
                    <div className="w-full h-full bg-gradient-to-t from-blue-500/40 to-blue-500/10 rounded-t-xl flex items-end justify-center pb-2">
                      <span className="text-xs font-bold text-blue-400">{socialPercent}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium">Социальное</span>
                </div>
              </div>
            </div>

            {/* Personal spheres */}
            <div className="glass-card p-4">
              <h3 className="text-xs font-bold mb-2 text-primary">🧘 Личное</h3>
              <div className="grid grid-cols-2 gap-2">
                {sphereScores.filter(s => s.category === 'personal').map(s => (
                  <div key={s.id} className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.name}</p>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold" style={{ color: s.color }}>{s.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social spheres */}
            <div className="glass-card p-4">
              <h3 className="text-xs font-bold mb-2 text-blue-400">🌐 Социальное</h3>
              <div className="grid grid-cols-2 gap-2">
                {sphereScores.filter(s => s.category === 'social').map(s => (
                  <div key={s.id} className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.name}</p>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold" style={{ color: s.color }}>{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
