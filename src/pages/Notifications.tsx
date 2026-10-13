import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { ArrowLeft, Bell, Heart, CheckCircle, Settings } from 'lucide-react';
import type { NotificationItem } from '@/lib/types';

type TabType = 'all' | 'social' | 'task' | 'system';

const NO_NOTIFICATIONS: NotificationItem[] = [];

type DisplayNotification = Pick<NotificationItem, 'id' | 'type' | 'title' | 'body' | 'isRead' | 'createdAt'>;

function demoNotifications(now: number): DisplayNotification[] {
  return [
    { id: 'demo-1', type: 'system', title: 'Добро пожаловать!', body: 'Добро пожаловать в JetFocus. Начните с создания первой привычки.', isRead: false, createdAt: now - 300000 },
    { id: 'demo-2', type: 'task', title: 'Напоминание', body: 'Задача «Написать контент план» истекает сегодня', isRead: false, createdAt: now - 3600000 },
    { id: 'demo-3', type: 'social', title: 'Новый лайк', body: 'Пользователь оценил вашу публикацию', isRead: true, createdAt: now - 86400000 },
    { id: 'demo-4', type: 'system', title: 'Обновление v1.1', body: 'Добавлен раздел финансовой аналитики по сферам жизни', isRead: true, createdAt: now - 172800000 },
  ];
}

export default function NotificationsPage() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('all');

  const notifications = useLiveQuery(
    () => (userId
      ? db.notifications.where('userId').equals(userId).reverse().sortBy('createdAt')
      : Promise.resolve(NO_NOTIFICATIONS)),
    [userId],
    NO_NOTIFICATIONS,
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  async function markAllRead() {
    if (!userId) return;
    try {
      // One atomic write, scoped to this user (no per-row loop racing with live updates).
      await db.notifications.where('userId').equals(userId).filter(n => !n.isRead).modify({ isRead: true });
    } catch (e) {
      console.error('Notifications update error:', e);
      toast.error('Не удалось отметить уведомления');
    }
  }

  async function markRead(id: string) {
    try {
      await db.notifications.update(id, { isRead: true });
    } catch (e) {
      console.error('Notification update error:', e);
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case 'social': return <Heart size={16} className="text-pink-400" />;
      case 'task': return <CheckCircle size={16} className="text-primary" />;
      case 'system': return <Bell size={16} className="text-[hsl(var(--accent-secondary))]" />;
      default: return <Bell size={16} className="text-muted-foreground" />;
    }
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    const days = Math.floor(hrs / 24);
    return `${days} д назад`;
  }

  const TABS: { key: TabType; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'social', label: 'Социальные' },
    { key: 'task', label: 'Задачи' },
    { key: 'system', label: 'Система' },
  ];

  // Demo notifications only for a user who has none at all (never mixed into real ones of another tab).
  const isDemo = notifications.length === 0;
  const displayNotifications: DisplayNotification[] = (isDemo ? demoNotifications(Date.now()) : notifications)
    .filter(n => tab === 'all' || n.type === tab);

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Уведомления</h1>
          {unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary font-medium">Прочитать все</button>
          )}
          <button onClick={() => navigate('/profile-settings')} className="p-1.5" aria-label="Настройки">
            <Settings size={16} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2">
        <div className="flex bg-secondary rounded-lg p-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-[11px] font-medium rounded-md transition-colors ${
                tab === t.key ? 'bg-card text-foreground' : 'text-muted-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 space-y-2 fade-in">
        {displayNotifications.length === 0 && (
          <div className="text-center py-16">
            <Bell size={40} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Нет уведомлений</p>
          </div>
        )}
        {displayNotifications.map(n => (
          <button key={n.id} onClick={() => { if (!isDemo && !n.isRead) void markRead(n.id); }}
            className={`glass-card p-3 w-full text-left flex items-start gap-3 transition-all ${
              !n.isRead ? 'border-primary/20 bg-primary/5' : ''
            }`}>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
              {getIcon(n.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">{formatTime(n.createdAt)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
