import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { getSphereById, getSphereColor, getTodayStr } from '@/lib/constants';
import type { SphereType } from '@/lib/types';
import {
  ArrowLeft, Edit3, Plus, CheckCircle2, Circle, Target, Flag,
  Calendar, Pin, Trash2, TrendingUp, TrendingDown, Minus,
  AlertTriangle, RefreshCw, Link2, Activity, BarChart3,
} from 'lucide-react';
import {
  getGoalById, listMilestones, listActions,
  addMilestone, deleteMilestone as svcDeleteMilestone,
  addAction, deleteAction as svcDeleteAction,
  updateGoal, deleteGoal, toggleGoalAction, toggleGoalMilestone,
  clampProgress, compareActions, daysUntil as getDaysUntil, nextOrderIndex, parseBoundedInt,
  GOAL_ITEM_TITLE_MAX, MILESTONE_POINTS_MAX, STEP_IMPACT_MAX, STEP_MINUTES_MAX,
  type GoalRow, type MilestoneRow, type ActionRow, type GoalProgressUpdate,
} from '@/lib/goalsService';
import { toast } from 'sonner';

// ─── Error / Loading / Not-Found UI ─────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-muted-foreground">Загружаем цель…</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center flex-col gap-4 px-8 text-center">
      <AlertTriangle size={40} className="text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-3">
        <button onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
          <RefreshCw size={14} /> Повторить
        </button>
        <button onClick={onBack} className="px-4 py-2 bg-secondary rounded-xl text-sm">← Назад</button>
      </div>
    </div>
  );
}

function NotFoundScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center flex-col gap-4 px-8 text-center">
      <Target size={40} className="text-muted-foreground/40" />
      <p className="font-semibold">Цель не найдена</p>
      <p className="text-xs text-muted-foreground">Возможно, она была удалена или у вас нет доступа.</p>
      <button onClick={onBack} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">← К списку целей</button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const loadProfile = useAuthStore(s => s.loadProfile);

  // Data state
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'links' | 'analytics'>('plan');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // One mutation at a time: progress is computed from the current value, so overlapping
  // toggles (double tap, two steps in a row) would overwrite each other's progress.
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Form state
  const [showAddStep, setShowAddStep] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepMinutes, setNewStepMinutes] = useState('15');
  const [newStepImpact, setNewStepImpact] = useState('5');
  const [newStepDate, setNewStepDate] = useState(getTodayStr());
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestonePoints, setNewMilestonePoints] = useState('25');

  // Race-condition guard: only the latest request may update state
  const requestIdRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!id || !user?.id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const [goalRes, milestonesRes, actionsRes] = await Promise.all([
        getGoalById(id, user.id),
        listMilestones(id, user.id),
        listActions(id, user.id),
      ]);

      // Guard against stale responses (id/user changed, retry clicked, unmounted)
      if (requestId !== requestIdRef.current) return;

      if (goalRes.error) {
        setError(goalRes.error.message);
        return;
      }
      if (!goalRes.data) {
        setGoal(null);
        setNotFound(true);
        return;
      }
      // An empty plan must not be shown when it simply failed to load.
      const listError = milestonesRes.error ?? actionsRes.error;
      if (listError) {
        setError(listError.message);
        return;
      }

      setGoal(goalRes.data);
      setMilestones(milestonesRes.data);
      setActions(actionsRes.data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Не удалось загрузить цель');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => () => {
    // Invalidate in-flight requests and pending timers on unmount.
    requestIdRef.current += 1;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  function showMsg(msg: string) {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback(msg);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2800);
  }

  async function runExclusive(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } catch (err) {
      console.error(err);
      toast.error('Что-то пошло не так. Попробуйте ещё раз.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function applyProgress(res: GoalProgressUpdate) {
    setGoal(prev => prev ? { ...prev, progress: res.progress, status: res.status, is_achieved: res.isAchieved } : prev);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  function toggleAction(action: ActionRow) {
    if (!goal || !user?.id) return;
    const userId = user.id;
    const currentGoal = goal;
    void runExclusive(async () => {
      const res = await toggleGoalAction(currentGoal, action, userId);
      if (res.error) { toast.error('Не удалось сохранить: ' + res.error.message); return; }
      const newStatus = action.status === 'done' ? 'todo' : 'done';
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: newStatus } : a));
      applyProgress(res);
      if (newStatus === 'done') {
        showMsg(res.justCompleted ? '🎉 Цель достигнута! +50⭐' : `+${clampProgress(action.impact)}% к цели! 💪`);
      }
      void loadProfile();
    });
  }

  function toggleMilestone(m: MilestoneRow) {
    if (!goal || !user?.id) return;
    const userId = user.id;
    const currentGoal = goal;
    const currentMilestones = milestones;
    void runExclusive(async () => {
      const res = await toggleGoalMilestone(currentGoal, currentMilestones, m, userId);
      if (res.error) { toast.error('Не удалось сохранить: ' + res.error.message); return; }
      setMilestones(res.milestones);
      applyProgress(res);
      if (m.status !== 'done') {
        showMsg(res.justCompleted ? '🎉 Цель достигнута! +50⭐' : `🏁 Веха выполнена! +${m.reward_points}⭐`);
      }
      void loadProfile();
    });
  }

  function handleAddStep() {
    const title = newStepTitle.trim().slice(0, GOAL_ITEM_TITLE_MAX);
    if (!title || !goal || !user?.id) return;
    const goalId = goal.id;
    const userId = user.id;
    void runExclusive(async () => {
      const { data, error: err } = await addAction({
        goal_id: goalId,
        user_id: userId,
        title,
        type: 'one_time',
        due_date: newStepDate || null,
        status: 'todo',
        estimated_minutes: parseBoundedInt(newStepMinutes, 15, 1, STEP_MINUTES_MAX),
        impact: parseBoundedInt(newStepImpact, 5, 1, STEP_IMPACT_MAX),
      });
      if (err || !data) { toast.error(err?.message ?? 'Шаг не сохранился'); return; }
      setActions(prev => [...prev, data].sort(compareActions));
      setNewStepTitle('');
      setNewStepDate(getTodayStr());
      setNewStepMinutes('15');
      setNewStepImpact('5');
      setShowAddStep(false);
      showMsg('Шаг добавлен!');
    });
  }

  function handleAddMilestone() {
    const title = newMilestoneTitle.trim().slice(0, GOAL_ITEM_TITLE_MAX);
    if (!title || !goal || !user?.id) return;
    const goalId = goal.id;
    const userId = user.id;
    const orderIndex = nextOrderIndex(milestones);
    void runExclusive(async () => {
      const { data, error: err } = await addMilestone({
        goal_id: goalId,
        user_id: userId,
        title,
        due_date: newMilestoneDate || null,
        order_index: orderIndex,
        status: 'todo',
        reward_points: parseBoundedInt(newMilestonePoints, 25, 1, MILESTONE_POINTS_MAX),
      });
      if (err || !data) { toast.error(err?.message ?? 'Веха не сохранилась'); return; }
      setMilestones(prev => [...prev, data]);
      setNewMilestoneTitle('');
      setNewMilestoneDate('');
      setNewMilestonePoints('25');
      setShowAddMilestone(false);
      showMsg('Веха добавлена!');
    });
  }

  function handleDeleteAction(actionId: string) {
    if (!user?.id) return;
    const userId = user.id;
    void runExclusive(async () => {
      const { error: err } = await svcDeleteAction(actionId, userId);
      if (err) { toast.error(err.message); return; }
      setActions(prev => prev.filter(a => a.id !== actionId));
    });
  }

  function handleDeleteMilestone(milestoneId: string) {
    if (!user?.id) return;
    const userId = user.id;
    void runExclusive(async () => {
      const { error: err } = await svcDeleteMilestone(milestoneId, userId);
      if (err) { toast.error(err.message); return; }
      setMilestones(prev => prev.filter(m => m.id !== milestoneId));
    });
  }

  function handleDeleteGoal() {
    if (!goal || !user?.id) return;
    const goalId = goal.id;
    const userId = user.id;
    void runExclusive(async () => {
      const { error: err } = await deleteGoal(goalId, userId);
      if (err) { toast.error('Ошибка удаления: ' + err.message); return; }
      toast.success('Цель удалена');
      navigate('/goals');
    });
  }

  function handleTogglePin() {
    if (!goal || !user?.id) return;
    const goalId = goal.id;
    const userId = user.id;
    const newPinned = !goal.is_pinned;
    void runExclusive(async () => {
      const { error: err } = await updateGoal(goalId, userId, { is_pinned: newPinned });
      if (err) { toast.error('Не удалось сохранить: ' + err.message); return; }
      setGoal(prev => prev ? { ...prev, is_pinned: newPinned } : prev);
    });
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={() => { void fetchData(); }} onBack={() => navigate('/goals')} />;
  if (notFound || !goal) return <NotFoundScreen onBack={() => navigate('/goals')} />;

  // ─── Derived ─────────────────────────────────────────────────────────────

  const sphere = getSphereById(goal.sphere as SphereType);
  const sphereColor = getSphereColor(goal.sphere as SphereType);
  const progress = clampProgress(goal.progress);
  const days = getDaysUntil(goal.target_date ?? goal.deadline);
  const completedMilestones = milestones.filter(m => m.status === 'done').length;
  const todoActions = actions.filter(a => a.status === 'todo').sort(compareActions);
  const nextStep = todoActions[0];

  return (
    <div className="flex flex-col min-h-screen pb-20">

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-primary-foreground" style={{ backgroundColor: sphereColor }}>
            {feedback}
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-card rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2">Удалить цель?</h3>
            <p className="text-sm text-muted-foreground mb-5">Будут удалены все вехи и шаги. Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 bg-secondary rounded-xl text-sm">Отмена</button>
              <button onClick={handleDeleteGoal} disabled={busy} className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold disabled:opacity-50">{busy ? 'Удаление…' : 'Удалить'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="relative px-4 pt-4 pb-5" style={{ background: `linear-gradient(135deg, ${sphereColor}22 0%, transparent 70%)` }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/goals')} className="p-1.5 rounded-lg bg-secondary/80">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handleTogglePin} disabled={busy} className={`p-1.5 rounded-lg ${goal.is_pinned ? 'bg-primary/20 text-primary' : 'bg-secondary/80'}`}>
              <Pin size={15} />
            </button>
            <button onClick={() => navigate(`/goals/${goal.id}/edit`)} className="p-1.5 rounded-lg bg-secondary/80">
              <Edit3 size={15} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-lg bg-destructive/20 text-destructive">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Goal info */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: `${sphereColor}22` }}>
            {sphere.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{sphere.name}</p>
            <h1 className="text-lg font-bold leading-tight">{goal.title}</h1>
            {goal.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{goal.description}</p>}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {days !== null && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${days < 0 ? 'bg-destructive/20 text-destructive' : days < 7 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-secondary text-muted-foreground'}`}>
              <Calendar size={9} />
              {days < 0 ? `просрочено ${Math.abs(days)}д` : days === 0 ? 'сегодня!' : `${days} дн`}
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
            <Flag size={9} className="inline mr-0.5" />{completedMilestones}/{milestones.length} вех
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${goal.status === 'active' ? 'bg-green-500/10 text-green-500' : goal.status === 'paused' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-secondary text-muted-foreground'}`}>
            {goal.status === 'active' ? '● Активна' : goal.status === 'paused' ? '⏸ Пауза' : goal.status === 'completed' ? '✓ Завершена' : goal.status === 'archived' ? '📦 В архиве' : goal.status}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Прогресс</span>
            <span className="text-sm font-bold" style={{ color: sphereColor }}>{progress}%</span>
          </div>
          <div className="relative flex items-center gap-1">
            <span className="text-base flex-shrink-0">🏁</span>
            <div className="flex-1 relative h-3 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, backgroundColor: sphereColor }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background shadow-md -translate-x-1/2 transition-all duration-700"
                style={{ left: `${Math.max(4, Math.min(96, progress))}%`, backgroundColor: sphereColor }}
              />
            </div>
            <span className="text-base flex-shrink-0">🎯</span>
          </div>
        </div>
      </div>

      {/* ===== NEXT STEP CTA ===== */}
      {nextStep && (
        <div className="mx-4 -mt-1 mb-3 glass-card p-4 border border-primary/30">
          <p className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-2">⚡ Следующий шаг</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{nextStep.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {nextStep.estimated_minutes ? `~${nextStep.estimated_minutes} мин` : ''} · +{nextStep.impact}%
                {nextStep.due_date ? ` · ${nextStep.due_date.slice(5)}` : ''}
              </p>
            </div>
            <button
              onClick={() => toggleAction(nextStep)}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-bold text-primary-foreground shadow-md transition-all active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: sphereColor }}
            >
              Сделать
            </button>
          </div>
        </div>
      )}

      {/* ===== TABS ===== */}
      <div className="flex gap-1 px-4 mb-3 flex-shrink-0">
        {(['plan', 'links', 'analytics'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-colors ${activeTab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            {t === 'plan' ? 'План' : t === 'links' ? 'Связи' : 'Аналитика'}
          </button>
        ))}
      </div>

      {/* ===== PLAN TAB ===== */}
      {activeTab === 'plan' && (
        <div className="flex-1 px-4 space-y-4 max-w-lg mx-auto w-full">

          {/* MILESTONES */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flag size={14} className="text-primary" />
                <p className="text-sm font-semibold">Вехи ({completedMilestones}/{milestones.length})</p>
              </div>
              <button onClick={() => setShowAddMilestone(s => !s)} className="text-[11px] text-primary flex items-center gap-0.5">
                <Plus size={13} /> Добавить
              </button>
            </div>

            {showAddMilestone && (
              <div className="mb-3 p-3 rounded-xl bg-secondary/50 space-y-2">
                <input
                  value={newMilestoneTitle}
                  onChange={e => setNewMilestoneTitle(e.target.value)}
                  placeholder="Название вехи"
                  maxLength={GOAL_ITEM_TITLE_MAX}
                  className="form-input text-sm py-2"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={newMilestoneDate} onChange={e => setNewMilestoneDate(e.target.value)} className="form-input text-xs py-2" />
                  <div className="flex items-center gap-1">
                    <input type="number" min={1} max={MILESTONE_POINTS_MAX} value={newMilestonePoints} onChange={e => setNewMilestonePoints(e.target.value)} className="form-input text-xs py-2 flex-1" placeholder="25" />
                    <span className="text-xs text-muted-foreground">⭐</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddMilestone} disabled={!newMilestoneTitle.trim() || busy} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50">Создать</button>
                  <button onClick={() => setShowAddMilestone(false)} className="px-3 py-2 bg-secondary rounded-lg text-xs">Отмена</button>
                </div>
              </div>
            )}

            {milestones.length === 0 && !showAddMilestone ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">Нет вех — добавь этапы с дедлайнами</p>
                <button onClick={() => setShowAddMilestone(true)} className="text-xs text-primary">+ Добавить веху</button>
              </div>
            ) : (
              <div className="space-y-2">
                {milestones.map(m => {
                  const mDays = getDaysUntil(m.due_date);
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/40 group">
                      <button onClick={() => toggleMilestone(m)} disabled={busy} className="flex-shrink-0">
                        {m.status === 'done'
                          ? <CheckCircle2 size={18} className="text-green-500" />
                          : <Circle size={18} className="text-muted-foreground/50" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${m.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{m.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {m.due_date && (
                            <span className={`text-[10px] ${mDays !== null && mDays < 0 ? 'text-destructive' : mDays !== null && mDays <= 3 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                              {mDays !== null && mDays < 0 ? 'просрочено' : mDays === 0 ? 'сегодня' : m.due_date.slice(5)}
                            </span>
                          )}
                          <span className="text-[10px] text-yellow-500">+{m.reward_points}⭐</span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteMilestone(m.id)} disabled={busy} aria-label="Удалить веху" className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 text-muted-foreground/50 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ACTIONS (STEPS) */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-primary" />
                <p className="text-sm font-semibold">Шаги ({actions.filter(a => a.status === 'done').length}/{actions.length})</p>
              </div>
              <button onClick={() => setShowAddStep(s => !s)} className="text-[11px] text-primary flex items-center gap-0.5">
                <Plus size={13} /> Добавить
              </button>
            </div>

            {showAddStep && (
              <div className="mb-3 p-3 rounded-xl bg-secondary/50 space-y-2">
                <input
                  value={newStepTitle}
                  onChange={e => setNewStepTitle(e.target.value)}
                  placeholder="Название шага"
                  maxLength={GOAL_ITEM_TITLE_MAX}
                  className="form-input text-sm py-2"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Дата</label>
                    <input type="date" value={newStepDate} onChange={e => setNewStepDate(e.target.value)} className="form-input text-xs py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Мин</label>
                    <input type="number" min={1} max={STEP_MINUTES_MAX} value={newStepMinutes} onChange={e => setNewStepMinutes(e.target.value)} className="form-input text-xs py-1.5" placeholder="15" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">+%</label>
                    <input type="number" min={1} max={STEP_IMPACT_MAX} value={newStepImpact} onChange={e => setNewStepImpact(e.target.value)} className="form-input text-xs py-1.5" placeholder="5" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddStep} disabled={!newStepTitle.trim() || busy} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50">Создать</button>
                  <button onClick={() => setShowAddStep(false)} className="px-3 py-2 bg-secondary rounded-lg text-xs">Отмена</button>
                </div>
              </div>
            )}

            {actions.length === 0 && !showAddStep ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">Нет шагов — добавь конкретные действия</p>
                <button onClick={() => setShowAddStep(true)} className="text-xs text-primary">+ Добавить шаг</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {actions.map(a => {
                  const aDays = getDaysUntil(a.due_date);
                  return (
                    <div key={a.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl group ${a.status === 'done' ? 'bg-secondary/20' : 'bg-secondary/40'}`}>
                      <button onClick={() => toggleAction(a)} disabled={busy} className="flex-shrink-0">
                        {a.status === 'done'
                          ? <CheckCircle2 size={17} className="text-green-500" />
                          : <Circle size={17} className="text-muted-foreground/50" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${a.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{a.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {a.due_date && (
                            <span className={`text-[10px] ${aDays !== null && aDays < 0 ? 'text-destructive' : aDays === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                              {aDays === 0 ? 'сегодня' : aDays !== null && aDays < 0 ? 'просрочено' : a.due_date.slice(5)}
                            </span>
                          )}
                          {a.estimated_minutes ? <span className="text-[10px] text-muted-foreground">{a.estimated_minutes}м</span> : null}
                          <span className="text-[10px] text-primary font-medium">+{a.impact}%</span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteAction(a.id)} disabled={busy} aria-label="Удалить шаг" className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 text-muted-foreground/50 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== LINKS TAB ===== */}
      {activeTab === 'links' && (
        <div className="flex-1 px-4 space-y-4 max-w-lg mx-auto w-full">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={14} className="text-primary" />
              <p className="text-sm font-semibold">Связанные задачи</p>
            </div>
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">Создай задачу и привяжи её к этой цели</p>
              <button onClick={() => navigate('/tasks/new')} className="text-xs text-primary">+ Создать задачу</button>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-primary" />
              <p className="text-sm font-semibold">Связанные привычки</p>
            </div>
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">Создай привычку и привяжи её к этой цели</p>
              <button onClick={() => navigate('/habits')} className="text-xs text-primary">+ Создать привычку</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ANALYTICS TAB ===== */}
      {activeTab === 'analytics' && (
        <div className="flex-1 px-4 space-y-4 max-w-lg mx-auto w-full">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-primary" />
              <p className="text-sm font-semibold">Статистика</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-secondary/50 text-center">
                <p className="text-2xl font-bold" style={{ color: sphereColor }}>{progress}%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Прогресс</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/50 text-center">
                <p className="text-2xl font-bold">{actions.filter(a => a.status === 'done').length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Шагов выполнено</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/50 text-center">
                <p className="text-2xl font-bold">{completedMilestones}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Вех закрыто</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/50 text-center">
                <p className="text-2xl font-bold">{actions.filter(a => a.status === 'todo').length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Шагов осталось</p>
              </div>
            </div>
            {days !== null && days > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2">
                  {progress >= 50 ? <TrendingUp size={14} className="text-primary" /> : progress >= 20 ? <Minus size={14} className="text-yellow-500" /> : <TrendingDown size={14} className="text-destructive" />}
                  <p className="text-xs font-medium">
                    {days} дней до дедлайна · нужно ещё {100 - progress}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
