import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { ArrowLeft, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getSphereById } from '@/lib/constants';

type SectionType = 'habits' | 'tasks' | 'goals' | 'finance';

export default function ArchivePage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionType>('tasks');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const archivedHabits = useLiveQuery(() => db.habits.where('userId').equals(user?.id ?? '').filter(h => h.isArchived).toArray(), [user?.id]) ?? [];
  const allTasks = useLiveQuery(() => db.tasks.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const allGoals = useLiveQuery(() => db.goals.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const allOps = useLiveQuery(() => db.financeOperations.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const allHabitLogs = useLiveQuery(() => db.habitLogs.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];

  const doneTasks = allTasks.filter(t => t.status === 'DONE' || t.status === 'CANCELLED');
  const achievedGoals = allGoals.filter(g => g.isAchieved);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [calendarMonth]);

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Get items for selected date
  function getDateItems(dateStr: string) {
    switch (section) {
      case 'tasks':
        return allTasks.filter(t => t.dueDate === dateStr || format(new Date(t.createdAt), 'yyyy-MM-dd') === dateStr);
      case 'habits':
        return allHabitLogs.filter(l => l.date === dateStr);
      case 'goals':
        return allGoals.filter(g => g.deadline === dateStr || format(new Date(g.createdAt), 'yyyy-MM-dd') === dateStr);
      case 'finance':
        return allOps.filter(o => o.date === dateStr);
      default:
        return [];
    }
  }

  function hasDataForDate(dateStr: string): boolean {
    return getDateItems(dateStr).length > 0;
  }

  const selectedItems = selectedDate ? getDateItems(selectedDate) : [];

  async function restoreTask(id: string) { await db.tasks.update(id, { status: 'TODO', updatedAt: Date.now() }); }
  async function deleteTask(id: string) { await db.tasks.delete(id); }
  async function restoreHabit(id: string) { await db.habits.update(id, { isArchived: false }); }
  async function deleteHabit(id: string) { await db.habits.delete(id); await db.habitLogs.where('habitId').equals(id).delete(); }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">📦 Архив</h1>
      </div>

      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full space-y-4 fade-in">
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {([
            { k: 'tasks' as const, l: '✅ Задачи' },
            { k: 'habits' as const, l: '🔄 Привычки' },
            { k: 'goals' as const, l: '🎯 Цели' },
            { k: 'finance' as const, l: '💰 Финансы' },
          ]).map(t => (
            <button key={t.k} onClick={() => { setSection(t.k); setSelectedDate(null); }}
              className={`pill-btn whitespace-nowrap ${section === t.k ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Calendar */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1"><ChevronLeft size={18} /></button>
            <span className="text-sm font-semibold capitalize">{format(calendarMonth, 'LLLL yyyy', { locale: ru })}</span>
            <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1"><ChevronRight size={18} /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map(d => (
              <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
              const isSelected = dateStr === selectedDate;
              const hasData = hasDataForDate(dateStr);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`py-2 rounded-lg text-xs relative transition-all ${
                    !isCurrentMonth ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'ring-1 ring-primary' : ''} ${
                    hasData && !isSelected ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="font-medium">{format(day, 'd')}</span>
                  {hasData && !isSelected && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected date items */}
        {selectedDate && (
          <div>
            <p className="text-sm font-semibold mb-2">
              {format(new Date(selectedDate + 'T12:00:00'), 'd MMMM yyyy', { locale: ru })}
              <span className="text-muted-foreground ml-2">({selectedItems.length} записей)</span>
            </p>
            {selectedItems.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Нет записей за этот день</p>}

            <div className="space-y-2">
              {section === 'tasks' && selectedItems.map((t: any) => (
                <div key={t.id} className="glass-card p-3 flex items-center gap-3">
                  <span className="text-sm">{getSphereById(t.sphere).icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm ${t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">{t.status === 'DONE' ? 'Выполнено' : t.status === 'CANCELLED' ? 'Отменено' : 'В работе'}</p>
                  </div>
                  <button onClick={() => restoreTask(t.id)} className="p-1.5 text-primary"><RotateCcw size={14} /></button>
                  <button onClick={() => deleteTask(t.id)} className="p-1.5 text-destructive"><Trash2 size={14} /></button>
                </div>
              ))}
              {section === 'habits' && selectedItems.map((l: any) => (
                <div key={l.id} className="glass-card p-3 flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${l.status === 'DONE' ? 'bg-primary' : 'bg-secondary'}`} />
                  <span className="text-sm flex-1">{l.habitId.slice(0, 8)}...</span>
                  <span className="text-xs text-muted-foreground">{l.status === 'DONE' ? '✓' : '−'}</span>
                </div>
              ))}
              {section === 'goals' && selectedItems.map((g: any) => (
                <div key={g.id} className="glass-card p-3 flex items-center gap-3">
                  <span className="text-sm">{getSphereById(g.sphere).icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{g.title}</p>
                    <p className="text-[10px] text-muted-foreground">{g.progress}%</p>
                  </div>
                </div>
              ))}
              {section === 'finance' && selectedItems.map((o: any) => (
                <div key={o.id} className="glass-card p-3 flex items-center gap-3">
                  <span className="text-sm">{getSphereById(o.sphere).icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{o.category}</p>
                    <p className="text-[10px] text-muted-foreground">{o.description || ''}</p>
                  </div>
                  <span className={`text-sm font-bold ${o.type === 'INCOME' ? 'text-primary' : 'text-destructive'}`}>
                    {o.type === 'INCOME' ? '+' : '-'}{(o.amount / 100).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary when no date selected */}
        {!selectedDate && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{doneTasks.length}</p>
                <p className="text-xs text-muted-foreground">Завершённых задач</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{archivedHabits.length}</p>
                <p className="text-xs text-muted-foreground">Архивных привычек</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{achievedGoals.length}</p>
                <p className="text-xs text-muted-foreground">Достигнуто целей</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{allOps.length}</p>
                <p className="text-xs text-muted-foreground">Финансовых операций</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Нажмите на дату в календаре для просмотра</p>
          </div>
        )}
      </div>
    </div>
  );
}
