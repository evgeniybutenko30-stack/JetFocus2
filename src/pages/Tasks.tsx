import { useState, useMemo, useEffect, useRef } from 'react';
import { awardStars, revokeStars } from '@/lib/starsService';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { getSphereById, getSphereColor, SPHERES, TASK_CATEGORIES, getTodayStr } from '@/lib/constants';
import type { SphereType } from '@/lib/types';
import {
  listTasks, updateTask, addDaysLocal, filterTasks, groupTasks, isTaskOverdue, isoToLocalDateStr,
  nextToggleStatus, normalizeTag, parseTaskSettings, sortTasks,
  type TaskRow, type TaskSettings,
} from '@/lib/tasksService';
import { listGoals, type GoalRow } from '@/lib/goalsService';
import { buildCSV, downloadICS, downloadTextFile, openGoogleCalendar } from '@/lib/icsExport';
import {
  Check, Plus, ChevronDown, Download, Settings, Globe, Target,
  CheckSquare, Calendar, TrendingUp, ChevronLeft, ChevronRight,
  MoreVertical, Pencil, X, FileText, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, addMonths, subMonths, isSameDay, parseISO, subDays,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, type TooltipProps,
} from 'recharts';
import confetti from 'canvas-confetti';

type TabType = 'tasks' | 'calendar' | 'progress';

// ─── helpers ────────────────────────────────────────────────────────────────

function sphereOf(id: string) {
  return getSphereById(id as SphereType);
}

function sphereLabel(id: string) {
  return sphereOf(id).name;
}

function priorityLabel(p: string) {
  const m: Record<string, string> = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', URGENT: 'Срочный' };
  return m[p] ?? p;
}

function statusLabel(s: string) {
  const m: Record<string, string> = { TODO: 'Ждёт', IN_PROGRESS: 'В работе', DONE: 'Готово', CANCELLED: 'Отменено' };
  return m[s] ?? s;
}

// ─── Export helpers ──────────────────────────────────────────────────────────

function exportCSV(tasks: TaskRow[], goals: GoalRow[]) {
  const goalTitles = new Map(goals.map(g => [g.id, g.title]));
  const headers = ['Название', 'Сфера', 'Приоритет', 'Статус', 'Срок', 'Цель', 'Описание'];
  const rows = tasks.map(t => [
    t.title,
    sphereLabel(t.sphere),
    priorityLabel(t.priority),
    statusLabel(t.status),
    t.due_date ?? '',
    t.goal_id ? (goalTitles.get(t.goal_id) ?? '') : '',
    t.description ?? '',
  ]);
  downloadTextFile('\uFEFF' + buildCSV([headers, ...rows]), `tasks_${getTodayStr()}.csv`, 'text/csv;charset=utf-8');
}

function exportJSON(tasks: TaskRow[]) {
  downloadTextFile(JSON.stringify(tasks, null, 2), `tasks_${getTodayStr()}.json`, 'application/json');
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function fireConfetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, colors: ['#1BDEAC', '#10b981', '#3b82f6'] });
  setTimeout(() => confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } }), 300);
}

// ─── Settings panel ──────────────────────────────────────────────────────────

// Category keys are the ids the task form stores (TASK_CATEGORIES).
const DEFAULT_CATEGORIES = TASK_CATEGORIES.map(c => ({ val: c.id, label: c.name }));

// Tag keys are normalizeTag() of the presets the task form stores ('Срочно', 'Важно', 'Позже').
const DEFAULT_TAGS = [
  { val: 'срочно', label: '#срочно' },
  { val: 'важно', label: '#важно' },
  { val: 'позже', label: '#позже' },
];

const DEFAULT_TASK_SETTINGS: TaskSettings = {
  sortBy: 'due_date',
  hideDone: false,
  categories: DEFAULT_CATEGORIES,
  tags: DEFAULT_TAGS,
};

const TASK_SETTINGS_STORAGE_KEY = 'jf_task_settings_v1';

function loadTaskSettings(): TaskSettings {
  try {
    return parseTaskSettings(window.localStorage.getItem(TASK_SETTINGS_STORAGE_KEY), DEFAULT_TASK_SETTINGS);
  } catch {
    return DEFAULT_TASK_SETTINGS;
  }
}

function saveTaskSettings(settings: TaskSettings) {
  try {
    window.localStorage.setItem(TASK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode / quota): settings then live for this visit only.
  }
}

function SettingsPanel({ settings, onChange, onClose }: {
  settings: TaskSettings;
  onChange: (s: TaskSettings) => void;
  onClose: () => void;
}) {
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  function addCategory() {
    const trimmed = newCategory.trim().slice(0, 40);
    if (!trimmed) return;
    const val = trimmed.toLowerCase().replace(/\s+/g, '_');
    if (settings.categories.find(c => c.val === val)) return;
    onChange({ ...settings, categories: [...settings.categories, { val, label: trimmed }] });
    setNewCategory('');
  }

  function removeCategory(val: string) {
    onChange({ ...settings, categories: settings.categories.filter(c => c.val !== val) });
  }

  function addTag() {
    const trimmed = newTag.trim().replace(/^#+/, '').trim().slice(0, 40);
    if (!trimmed) return;
    const val = normalizeTag(trimmed);
    if (settings.tags.find(t => t.val === val)) return;
    onChange({ ...settings, tags: [...settings.tags, { val, label: `#${trimmed}` }] });
    setNewTag('');
  }

  function removeTag(val: string) {
    onChange({ ...settings, tags: settings.tags.filter(t => t.val !== val) });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-card rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <h3 className="text-base font-bold">Настройки задач</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Sort */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Сортировка</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { val: 'due_date', label: 'По сроку' },
                { val: 'priority', label: 'По приоритету' },
                { val: 'sphere', label: 'По категории' },
                { val: 'created_at', label: 'По дате' },
              ] as const).map(o => (
                <button
                  key={o.val}
                  onClick={() => onChange({ ...settings, sortBy: o.val })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    settings.sortBy === o.val
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hide done toggle */}
          <button
            onClick={() => onChange({ ...settings, hideDone: !settings.hideDone })}
            className="flex items-center gap-3 w-full cursor-pointer py-1"
          >
            <div className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${settings.hideDone ? 'bg-primary' : 'bg-secondary'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.hideDone ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Скрывать выполненные</span>
          </button>

          {/* Categories */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Категории</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {settings.categories.map(c => (
                <div key={c.val} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs font-medium">
                  <span>{c.label}</span>
                  <button
                    onClick={() => removeCategory(c.val)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                maxLength={40}
                placeholder="Новая категория…"
                className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={addCategory}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Теги</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {settings.tags.map(t => (
                <div key={t.val} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs font-medium">
                  <span>{t.label}</span>
                  <button
                    onClick={() => removeTag(t.val)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                maxLength={40}
                placeholder="#новый-тег…"
                className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={addTag}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export panel ────────────────────────────────────────────────────────────

function ExportPanel({ tasks, goals, onClose }: { tasks: TaskRow[]; goals: GoalRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-card rounded-t-2xl w-full max-w-lg p-6 pb-8 space-y-3 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold">Экспорт задач</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground">Будет экспортировано {tasks.length} задач с учётом фильтров</p>
        <button
          onClick={() => { exportCSV(tasks, goals); onClose(); }}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-accent transition-colors"
        >
          <FileText size={18} className="text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium">Экспорт CSV</p>
            <p className="text-xs text-muted-foreground">Таблица с русскими заголовками</p>
          </div>
        </button>
        <button
          onClick={() => { exportJSON(tasks); onClose(); }}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-accent transition-colors"
        >
          <FileText size={18} className="text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium">Экспорт JSON</p>
            <p className="text-xs text-muted-foreground">Полные данные всех задач</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Task card (expandable) ──────────────────────────────────────────────────

/** Approximate height of the 3-item task menu, used to keep it inside the viewport. */
const MENU_HEIGHT = 132;

function TaskCard({
  task,
  goals,
  onToggleDone,
  onEdit,
  onPostpone,
  onReschedule,
  busy = false,
}: {
  task: TaskRow;
  goals: GoalRow[];
  busy?: boolean;
  onToggleDone: (t: TaskRow) => void;
  onEdit: (id: string) => void;
  onPostpone?: (t: TaskRow) => void;
  onReschedule?: (t: TaskRow, days: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const sphere = sphereOf(task.sphere);
  const linkedGoal = goals.find(g => g.id === task.goal_id);
  const isOverdue = isTaskOverdue(task, getTodayStr());
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      // close if clicking outside the menu overlay
      const menuEl = document.getElementById(`task-menu-${task.id}`);
      if (menuEl && !menuEl.contains(target) && menuBtnRef.current && !menuBtnRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, task.id]);

  function openMenu() {
    if (!menuBtnRef.current) return;
    const rect = menuBtnRef.current.getBoundingClientRect();
    // Open upwards when the menu would run past the bottom of the viewport (bottom dock on phones).
    const below = rect.bottom + 4;
    const top = below + MENU_HEIGHT > window.innerHeight - 8 ? Math.max(8, rect.top - 4 - MENU_HEIGHT) : below;
    setMenuPos({
      top,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setMenuOpen(true);
  }

  const priorityColor: Record<string, string> = {
    LOW: 'bg-muted text-muted-foreground',
    MEDIUM: 'bg-[hsl(43_96%_56%/0.15)] text-[hsl(var(--accent-secondary))]',
    HIGH: 'bg-destructive/15 text-destructive',
    URGENT: 'bg-destructive/30 text-destructive',
  };

  return (
    <>
      <div className="glass-card">
        {/* Main row */}
        <div className="p-3 flex items-center gap-3">
          <button
            onClick={() => onToggleDone(task)}
            disabled={busy}
            aria-label={task.status === 'DONE' ? 'Отметить невыполненной' : 'Отметить выполненной'}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-60 ${
              task.status === 'DONE' ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
            }`}
          >
            {task.status === 'DONE' && <Check size={11} className="text-primary-foreground" />}
          </button>
          <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center flex-shrink-0">
            <span className="text-xs">{sphere.icon}</span>
          </div>
          <p
            className={`flex-1 text-sm font-medium leading-tight ${task.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}
            onClick={() => setExpanded(!expanded)}
          >
            {task.title}
          </p>
          {isOverdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold flex-shrink-0">
              Просрочено
            </span>
          )}
          {task.due_date && !isOverdue && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {format(parseISO(task.due_date), 'd MMM', { locale: ru })}
            </span>
          )}
          {task.due_date && isOverdue && (
            <span className="text-[10px] text-destructive/60 flex-shrink-0">
              {format(parseISO(task.due_date), 'd MMM', { locale: ru })}
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-muted-foreground flex-shrink-0"
          >
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="border-t border-border/40 px-3 pb-3 pt-2 bg-secondary/30 animate-fade-in">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1 min-w-0">
                {task.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {sphere.icon} {sphere.name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColor[task.priority]}`}>
                    {priorityLabel(task.priority)}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {statusLabel(task.status)}
                  </span>
                </div>
                {linkedGoal && (
                  <div className="flex items-center gap-1">
                    <Target size={10} className="text-primary" />
                    <span className="text-[10px] text-primary">{linkedGoal.title}</span>
                  </div>
                )}
                {task.due_date && (
                  <div className="flex items-center gap-1">
                    <Calendar size={10} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(task.due_date), 'd MMMM yyyy', { locale: ru })}
                    </span>
                  </div>
                )}

                {/* Overdue actions */}
                {isOverdue && (onPostpone || onReschedule) && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-border/30">
                    {onPostpone && (
                      <button
                        onClick={() => onPostpone(task)}
                        disabled={busy}
                        className="flex-1 disabled:opacity-50 py-1.5 text-[11px] font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Завтра
                      </button>
                    )}
                    {onReschedule && (
                      <>
                        <button
                          onClick={() => onReschedule(task, 3)}
                          disabled={busy}
                          className="flex-1 disabled:opacity-50 py-1.5 text-[11px] font-medium rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          +3 дня
                        </button>
                        <button
                          onClick={() => onReschedule(task, 7)}
                          disabled={busy}
                          className="flex-1 disabled:opacity-50 py-1.5 text-[11px] font-medium rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          +7 дней
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 3-dot menu button */}
              <button
                ref={menuBtnRef}
                onClick={openMenu}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent transition-colors flex-shrink-0"
              >
                <MoreVertical size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed-position dropdown rendered outside card to avoid overflow clipping */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => setMenuOpen(false)}
        >
          <div
            id={`task-menu-${task.id}`}
            className="absolute w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setMenuOpen(false); onEdit(task.id); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <Pencil size={14} className="text-muted-foreground" />
              Редактировать
            </button>
            <div className="h-px bg-border" />
            <button
              onClick={() => {
                setMenuOpen(false);
                if (!task.due_date) { alert('Добавь дату выполнения, чтобы экспортировать в Google Calendar'); return; }
                openGoogleCalendar({ uid: task.id, title: task.title, description: task.description ?? '', date: task.due_date });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <Globe size={14} className="text-muted-foreground" />
              Google Calendar
            </button>
            <div className="h-px bg-border" />
            <button
              onClick={() => {
                setMenuOpen(false);
                if (!task.due_date) { alert('Добавь дату выполнения, чтобы скачать .ics'); return; }
                downloadICS({ uid: task.id, title: task.title, description: task.description ?? '', date: task.due_date, allDay: true });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <Calendar size={14} className="text-muted-foreground" />
              Скачать .ics
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Task group ──────────────────────────────────────────────────────────────

function TaskGroup({
  label, count, expanded, onToggle, tasks, goals, onToggleDone, onEdit,
  onPostpone, onReschedule, isOverdueGroup, pendingIds,
}: {
  label: string; count: number; expanded: boolean; onToggle: () => void;
  tasks: TaskRow[]; goals: GoalRow[];
  pendingIds: Set<string>;
  onToggleDone: (t: TaskRow) => void; onEdit: (id: string) => void;
  onPostpone?: (t: TaskRow) => void;
  onReschedule?: (t: TaskRow, days: number) => void;
  isOverdueGroup?: boolean;
}) {
  return (
    <div>
      <button onClick={onToggle} className="flex items-center gap-2 py-1.5 text-sm w-full text-left">
        <ChevronDown size={14} className={`transition-transform ${isOverdueGroup ? 'text-destructive' : 'text-muted-foreground'} ${expanded ? '' : '-rotate-90'}`} />
        <span className={`font-medium ${isOverdueGroup ? 'text-destructive' : 'text-muted-foreground'}`}>{label}</span>
        <span className={`text-xs ml-1 ${isOverdueGroup ? 'text-destructive/60' : 'text-muted-foreground/60'}`}>{count}</span>
      </button>
      {expanded && (
        <div className="space-y-2 mt-1">
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} goals={goals} onToggleDone={onToggleDone} onEdit={onEdit}
              onPostpone={onPostpone} onReschedule={onReschedule} busy={pendingIds.has(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Premium Calendar ────────────────────────────────────────────────────────

function PremiumCalendar({
  tasks,
  month,
  onMonthChange,
}: {
  tasks: TaskRow[];
  month: Date;
  onMonthChange: (d: Date) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const today = new Date();

  const calendarDays = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const ws = startOfWeek(start, { weekStartsOn: 1 });
    const we = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: ws, end: we });
  }, [month]);

  const dayTasksMap = useMemo(() => {
    const map: Record<string, TaskRow[]> = {};
    tasks.forEach(t => {
      if (!t.due_date || t.status === 'CANCELLED') return;
      const key = t.due_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const selectedStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedTasks = selectedStr ? (dayTasksMap[selectedStr] ?? []) : [];

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-1 mb-1">
        <button
          onClick={() => { onMonthChange(subMonths(month, 1)); setSelectedDate(null); }}
          className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold capitalize">
          {format(month, 'LLLL yyyy', { locale: ru })}
        </span>
        <button
          onClick={() => { onMonthChange(addMonths(month, 1)); setSelectedDate(null); }}
          className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-semibold py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cards grid — like the screenshot */}
      <div className="grid grid-cols-7 gap-1.5">
        {calendarDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const dayTasks = dayTasksMap[dateStr] ?? [];
          const totalCnt = dayTasks.length;
          const doneCnt = dayTasks.filter(t => t.status === 'DONE').length;
          const allDone = totalCnt > 0 && doneCnt === totalCnt;

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(isSelected ? null : day)}
              className={[
                'relative flex flex-col items-center justify-start rounded-xl pt-2 pb-2 gap-1 transition-all select-none',
                !isCurrentMonth ? 'opacity-20 pointer-events-none' : '',
                isSelected
                  ? 'bg-primary shadow-md shadow-primary/25'
                  : isToday
                    ? 'bg-primary/15 ring-1 ring-primary/50'
                    : 'bg-card border border-border/50 hover:border-primary/30 hover:bg-card/90',
              ].filter(Boolean).join(' ')}
              style={{ minHeight: 56 }}
            >
              {/* Day number */}
              <span className={[
                'text-xs font-bold leading-none',
                isSelected
                  ? 'text-primary-foreground'
                  : isToday
                    ? 'text-primary'
                    : 'text-foreground',
              ].join(' ')}>
                {format(day, 'd')}
              </span>

              {/* Task counter */}
              {totalCnt > 0 ? (
                <span className={[
                  'text-[9px] font-semibold leading-none',
                  isSelected
                    ? 'text-primary-foreground/80'
                    : allDone
                      ? 'text-primary'
                      : 'text-muted-foreground',
                ].join(' ')}>
                  {doneCnt}/{totalCnt}
                </span>
              ) : (
                <span className="text-[9px] text-transparent leading-none select-none">·</span>
              )}

              {/* All-done indicator dot */}
              {allDone && !isSelected && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div className="mt-2 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-bold">
              {format(selectedDate, 'd MMMM', { locale: ru })}
            </p>
            <span className="text-xs text-muted-foreground">
              {selectedTasks.length > 0 ? `${selectedTasks.filter(t => t.status === 'DONE').length}/${selectedTasks.length} выполнено` : ''}
            </span>
          </div>
          {selectedTasks.length === 0 ? (
            <div className="glass-card p-5 text-center">
              <Calendar size={22} className="text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">Нет задач на этот день</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map(t => {
                const sphere = sphereOf(t.sphere);
                const isDone = t.status === 'DONE';
                return (
                  <div key={t.id} className="glass-card p-3 flex items-center gap-3">
                    <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${isDone ? 'bg-primary' : 'bg-muted-foreground/25'}`} />
                    <span className="text-sm flex-shrink-0">{sphere.icon}</span>
                    <p className={`flex-1 text-sm font-medium leading-tight ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                      {t.title}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      isDone ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {statusLabel(t.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progress tab ────────────────────────────────────────────────────────────

const SPHERE_LABELS: Record<string, string> = {
  health: 'Тело',
  career: 'Дело',
  finance: 'Деньги',
  relationships: 'Связи',
  family: 'Семья',
  development: 'Разум',
  leisure: 'Отдых',
  spirituality: 'Дух',
};

function ProgressTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-medium text-primary">Выполнено: {payload[0]?.value ?? 0}</p>
    </div>
  );
}

function ProgressTab({ tasks: allTasks }: { tasks: TaskRow[] }) {
  // Cancelled tasks are excluded everywhere so every share below is out of the same total.
  const tasks = useMemo(() => allTasks.filter(t => t.status !== 'CANCELLED'), [allTasks]);
  const totalCount = tasks.length;
  const doneCnt = tasks.filter(t => t.status === 'DONE').length;
  const activeCnt = tasks.filter(t => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;
  const donePercent = totalCount > 0 ? Math.round((doneCnt / totalCount) * 100) : 0;

  const progressData = useMemo(() => {
    // completed_at is a UTC timestamp: bucket it by the user's local day, like due_date.
    const doneByDay = new Map<string, number>();
    tasks.forEach(t => {
      if (t.status !== 'DONE') return;
      const day = isoToLocalDateStr(t.completed_at);
      if (day) doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
    });
    const data: { label: string; done: number; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const ds = format(d, 'yyyy-MM-dd');
      const dayTotal = tasks.filter(t => t.due_date === ds).length;
      data.push({ label: format(d, 'dd.MM'), done: doneByDay.get(ds) ?? 0, total: dayTotal });
    }
    return data;
  }, [tasks]);

  const sphereData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const key = t.sphere || 'other';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([id, value]) => ({
      id,
      name: SPHERE_LABELS[id] ?? id,
      value,
      color: getSphereColor(id as SphereType),
    }));
  }, [tasks]);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 text-center">
          <p className="text-xl font-bold">{totalCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Всего задач</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xl font-bold text-primary">{donePercent}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Выполнено</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xl font-bold">{activeCnt}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Активных</p>
        </div>
      </div>

      {/* Line chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-bold mb-4">Ежедневный прогресс (14 дней)</h3>
        {progressData.every(d => d.done === 0) ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Пока нет выполненных задач
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={progressData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ProgressTooltip />} />
              <Line
                type="monotone"
                dataKey="done"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                name="Выполнено"
                dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Sphere pie */}
      {sphereData.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold mb-4">По сферам жизни</h3>
          {sphereData.every(d => d.value === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={110} height={110}>
                  <PieChart>
                    <Pie
                      data={sphereData}
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={50}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {sphereData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                {sphereData.map(d => (
                  <div key={d.id} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-muted-foreground truncate flex-1">{d.name}</span>
                    <span className="text-xs font-bold flex-shrink-0">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Priority breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-3">
          <p className="text-xs font-bold mb-3">По приоритету</p>
          <div className="space-y-2">
            {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => {
              const cnt = tasks.filter(t => t.priority === p).length;
              const pct = totalCount > 0 ? (cnt / totalCount) : 0;
              return (
                <div key={p}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{priorityLabel(p)}</span>
                    <span className="text-[10px] font-bold">{cnt}</span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs font-bold mb-3">По статусу</p>
          <div className="space-y-2">
            {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map(s => {
              const cnt = tasks.filter(t => t.status === s).length;
              const pct = totalCount > 0 ? (cnt / totalCount) : 0;
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{statusLabel(s)}</span>
                    <span className="text-[10px] font-bold">{cnt}</span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sphere filter popover ───────────────────────────────────────────────────

function SphereFilterPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        className="absolute top-32 left-4 bg-card border border-border rounded-xl shadow-xl p-2 min-w-[160px] animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => { onChange(''); onClose(); }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm ${value === '' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          Все сферы
        </button>
        {SPHERES.map(s => (
          <button
            key={s.id}
            onClick={() => { onChange(s.id); onClose(); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${value === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalFilterPopover({
  goals,
  value,
  onChange,
  onClose,
}: {
  goals: GoalRow[];
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        className="absolute top-32 left-24 bg-card border border-border rounded-xl shadow-xl p-2 min-w-[180px] max-h-60 overflow-y-auto animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => { onChange(''); onClose(); }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm ${value === '' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          Все цели
        </button>
        {goals.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Нет целей</p>
        )}
        {goals.map(g => (
          <button
            key={g.id}
            onClick={() => { onChange(g.id); onClose(); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${value === g.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {g.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TasksPage() {
  const user = useAuthStore(s => s.user);
  const userId = user?.id ?? null;
  const loadProfile = useAuthStore(s => s.loadProfile);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Filters
  const [sphereFilter, setSphereFilter] = useState('');
  const [goalFilter, setGoalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showSpherePopover, setShowSpherePopover] = useState(false);
  const [showGoalPopover, setShowGoalPopover] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [taskSettings, setTaskSettings] = useState<TaskSettings>(loadTaskSettings);

  // Data
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overdue: true, today: true, later: false, done: false,
  });
  // Tasks with a write in flight. The ref is the synchronous double-tap guard,
  // the state drives the disabled look of the buttons.
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Keyed by user id (not the user object, which changes on every token refresh).
    let cancelled = false;
    async function load() {
      if (!userId) {
        setTasks([]);
        setGoals([]);
        setLoadError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const [tasksRes, goalsRes] = await Promise.all([listTasks(userId), listGoals(userId)]);
        if (cancelled) return;
        if (tasksRes.error) {
          // Keep whatever is on screen instead of showing a false "no tasks" state.
          setLoadError(tasksRes.error.message);
        } else {
          setTasks(tasksRes.data);
        }
        setGoals(goalsRes.data);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  function updateSettings(next: TaskSettings) {
    setTaskSettings(next);
    saveTaskSettings(next);
    // A removed category/tag must not stay applied as an invisible filter.
    if (categoryFilter && !next.categories.some(c => c.val === categoryFilter)) setCategoryFilter('');
    if (tagFilter && !next.tags.some(t => t.val === tagFilter)) setTagFilter('');
  }

  const today = getTodayStr();

  // Filtered & sorted tasks
  const filteredTasks = useMemo(
    () => sortTasks(
      filterTasks(tasks, {
        sphere: sphereFilter,
        goalId: goalFilter,
        status: statusFilter,
        category: categoryFilter,
        tag: tagFilter,
        hideDone: taskSettings.hideDone,
      }),
      taskSettings.sortBy,
    ),
    [tasks, sphereFilter, goalFilter, statusFilter, categoryFilter, tagFilter, taskSettings],
  );

  const {
    overdue: overdueTasks, today: todayTasks, later: laterTasks, done: doneTasks,
  } = groupTasks(filteredTasks, today);
  const totalCount = filteredTasks.length;

  function markPending(taskId: string, pending: boolean) {
    if (pending) pendingRef.current.add(taskId);
    else pendingRef.current.delete(taskId);
    setPendingIds(new Set(pendingRef.current));
  }

  function patchTask(taskId: string, patch: Partial<TaskRow>) {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  async function handleToggleDone(task: TaskRow) {
    if (!userId || pendingRef.current.has(task.id)) return;
    const wasDone = task.status === 'DONE';
    const newStatus = nextToggleStatus(task.status);
    const completedAt = newStatus === 'DONE' ? new Date().toISOString() : null;
    const rollback = () => patchTask(task.id, { status: task.status, completed_at: task.completed_at ?? null });

    markPending(task.id, true);
    // Optimistic update (rolled back below if the write fails)
    patchTask(task.id, { status: newStatus, completed_at: completedAt });
    if (!wasDone) fireConfetti();

    try {
      const { error } = await updateTask(task.id, userId, { status: newStatus, completed_at: completedAt });
      if (error) {
        rollback();
        toast.error('Не удалось сохранить задачу: ' + error.message);
        return;
      }

      // Stars only follow a persisted status change (awardStars de-duplicates by key).
      const sourceKey = `task_${task.id}`;
      try {
        if (!wasDone) {
          await awardStars(userId, 1, 'task_completion', sourceKey);
        } else {
          await revokeStars(userId, sourceKey);
        }
        // Refresh stars in UI from DB
        await loadProfile();
      } catch (err) {
        console.warn('[tasks] stars update failed:', err);
      }
    } catch (err) {
      rollback();
      toast.error('Не удалось сохранить задачу: ' + (err instanceof Error ? err.message : 'ошибка сети'));
    } finally {
      markPending(task.id, false);
    }
  }

  async function handleRescheduleTask(task: TaskRow, days: number) {
    if (!userId || pendingRef.current.has(task.id)) return;
    // Local calendar date: toISOString() would give the UTC day (wrong around midnight).
    const newDateStr = addDaysLocal(days);
    markPending(task.id, true);
    try {
      const { error } = await updateTask(task.id, userId, { due_date: newDateStr });
      if (error) {
        toast.error('Не удалось перенести задачу: ' + error.message);
        return;
      }
      patchTask(task.id, { due_date: newDateStr });
      toast.success(days === 1 ? 'Задача перенесена на завтра' : `Задача перенесена на ${days} дн.`);
    } catch (err) {
      toast.error('Не удалось перенести задачу: ' + (err instanceof Error ? err.message : 'ошибка сети'));
    } finally {
      markPending(task.id, false);
    }
  }

  function handlePostponeTask(task: TaskRow) {
    return handleRescheduleTask(task, 1);
  }

  const hasActiveFilters = sphereFilter || goalFilter || statusFilter || categoryFilter || tagFilter;


  return (
    <div className="flex flex-col min-h-screen pb-24 bg-background">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CheckSquare size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Мои задачи</h1>
              <p className="text-xs text-muted-foreground">{totalCount} задач</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowExport(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
            >
              <Download size={17} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
            >
              <Settings size={17} />
            </button>
            <button
              onClick={() => navigate('/tasks/new')}
              className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters row 1: sphere + goal + reset */}
      <div className="px-4 pb-1.5 flex gap-2 flex-wrap">
        <button
          onClick={() => setShowSpherePopover(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            sphereFilter ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          <Globe size={12} />
          {sphereFilter ? sphereLabel(sphereFilter) : 'Сфера'}
        </button>
        <button
          onClick={() => setShowGoalPopover(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            goalFilter ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          <Target size={12} />
          {goalFilter ? (goals.find(g => g.id === goalFilter)?.title ?? 'Цель') : 'Цель'}
        </button>
        {hasActiveFilters && (
          <button
            onClick={() => { setSphereFilter(''); setGoalFilter(''); setStatusFilter(''); setCategoryFilter(''); setTagFilter(''); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-destructive/15 text-destructive text-xs font-medium"
          >
            <X size={10} /> Сбросить
          </button>
        )}
      </div>

      {/* Filters row 2: categories */}
      <div className="px-4 pb-1.5 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setCategoryFilter('')}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            categoryFilter === '' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          Все
        </button>
        {taskSettings.categories.map(c => (
          <button
            key={c.val}
            onClick={() => setCategoryFilter(categoryFilter === c.val ? '' : c.val)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === c.val ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filters row 3: tags */}
      <div className="px-4 pb-1.5 flex gap-2 overflow-x-auto no-scrollbar">
        {taskSettings.tags.map(tag => (
          <button
            key={tag.val}
            onClick={() => setTagFilter(tagFilter === tag.val ? '' : tag.val)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              tagFilter === tag.val ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      {/* Filters row 4: status pills */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {([
          { val: '', label: 'Все статусы' },
          { val: 'TODO', label: 'Не начато' },
          { val: 'IN_PROGRESS', label: 'В процессе' },
          { val: 'DONE', label: 'Готово' },
        ] as const).map(s => (
          <button
            key={s.val}
            onClick={() => setStatusFilter(s.val)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s.val
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-4 pb-3">
        <div className="flex bg-secondary rounded-xl p-1">
          {([
            { id: 'tasks' as TabType, icon: CheckSquare, label: 'Задачи' },
            { id: 'calendar' as TabType, icon: Calendar, label: 'Календарь' },
            { id: 'progress' as TabType, icon: TrendingUp, label: 'Прогресс' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {loadError && (
              <div className="glass-card p-4 mb-3 flex items-start gap-3">
                <AlertCircle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-medium">Не удалось загрузить задачи</p>
                  <p className="text-xs text-muted-foreground break-words">{loadError}</p>
                  <button
                    onClick={() => setReloadKey(k => k + 1)}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
                  >
                    Повторить
                  </button>
                </div>
              </div>
            )}

            {/* TASKS TAB */}
            {activeTab === 'tasks' && (
              <div className="space-y-3">
                {loadError && tasks.length === 0 ? null : !userId ? (
                  <div className="glass-card p-8 text-center space-y-3">
                    <CheckSquare size={32} className="text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Войдите, чтобы вести задачи</p>
                    <p className="text-xs text-muted-foreground">Задачи сохраняются в вашем аккаунте</p>
                    <button
                      onClick={() => navigate('/auth')}
                      className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"
                    >
                      Войти
                    </button>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="glass-card p-8 text-center space-y-3">
                    <CheckSquare size={32} className="text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Нет задач</p>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveFilters ? 'Попробуй изменить фильтры' : 'Создай первую задачу, нажав +'}
                    </p>
                    {!hasActiveFilters && (
                      <button
                        onClick={() => navigate('/tasks/new')}
                        className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"
                      >
                        Создать задачу
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {overdueTasks.length > 0 && (
                      <TaskGroup
                        label="🔴 Просрочено"
                        count={overdueTasks.length}
                        expanded={expandedGroups.overdue}
                        onToggle={() => setExpandedGroups(p => ({ ...p, overdue: !p.overdue }))}
                        tasks={overdueTasks}
                        goals={goals}
                        onToggleDone={handleToggleDone}
                        pendingIds={pendingIds}
                        onEdit={id => navigate(`/tasks/${id}/edit`)}
                        onPostpone={handlePostponeTask}
                        onReschedule={handleRescheduleTask}
                        isOverdueGroup
                      />
                    )}
                    {todayTasks.length > 0 && (
                      <TaskGroup
                        label="Сегодня"
                        count={todayTasks.length}
                        expanded={expandedGroups.today}
                        onToggle={() => setExpandedGroups(p => ({ ...p, today: !p.today }))}
                        tasks={todayTasks}
                        goals={goals}
                        onToggleDone={handleToggleDone}
                        pendingIds={pendingIds}
                        onEdit={id => navigate(`/tasks/${id}/edit`)}
                      />
                    )}
                    {laterTasks.length > 0 && (
                      <TaskGroup
                        label="Позже"
                        count={laterTasks.length}
                        expanded={expandedGroups.later}
                        onToggle={() => setExpandedGroups(p => ({ ...p, later: !p.later }))}
                        tasks={laterTasks}
                        goals={goals}
                        onToggleDone={handleToggleDone}
                        pendingIds={pendingIds}
                        onEdit={id => navigate(`/tasks/${id}/edit`)}
                      />
                    )}
                    {!taskSettings.hideDone && doneTasks.length > 0 && (
                      <TaskGroup
                        label="Выполнено"
                        count={doneTasks.length}
                        expanded={expandedGroups.done}
                        onToggle={() => setExpandedGroups(p => ({ ...p, done: !p.done }))}
                        tasks={doneTasks}
                        goals={goals}
                        onToggleDone={handleToggleDone}
                        pendingIds={pendingIds}
                        onEdit={id => navigate(`/tasks/${id}/edit`)}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* CALENDAR TAB */}
            {activeTab === 'calendar' && (
              <PremiumCalendar
                tasks={tasks}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
              />
            )}

            {/* PROGRESS TAB */}
            {activeTab === 'progress' && <ProgressTab tasks={tasks} />}
          </>
        )}
      </div>

      {/* Popovers / Panels */}
      {showSpherePopover && (
        <SphereFilterPopover
          value={sphereFilter}
          onChange={setSphereFilter}
          onClose={() => setShowSpherePopover(false)}
        />
      )}
      {showGoalPopover && (
        <GoalFilterPopover
          goals={goals}
          value={goalFilter}
          onChange={setGoalFilter}
          onClose={() => setShowGoalPopover(false)}
        />
      )}
      {showSettings && (
        <SettingsPanel
          settings={taskSettings}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showExport && (
        <ExportPanel
          tasks={filteredTasks}
          goals={goals}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
