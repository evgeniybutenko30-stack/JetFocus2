import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ScrollText, ChevronDown } from 'lucide-react';

import { useState } from 'react';

const NEWS = [
  'План на день — новая PRO-функция!',
  'Итоги дня с метрикой продуктивности!',
  'Новые фильтры рейтинга и лента!',
  'Push-уведомления о сроках!',
  'Перенос сроков привычек и задач!',
  'Синхронизация с Google Calendar и экспорт .ics!',
  'Архив с календарным просмотром!',
];

export default function NewsPage() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full fade-in">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <ScrollText size={20} className="text-primary" />
          <div><h1 className="text-lg font-bold">Новости Top-Focus</h1><p className="text-xs text-muted-foreground">Обновления и новые функции</p></div>
        </div>
        <div className="space-y-2">
          {NEWS.map((n, i) => (
            <button key={i} onClick={() => setExpanded(expanded === i ? null : i)} className="w-full glass-card p-4 text-left">
              <div className="flex items-center justify-between">
                <div><span className="inline-block px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded mb-1">Функция</span><p className="text-sm">{n}</p></div>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${expanded === i ? 'rotate-180' : ''}`} />
              </div>
              {expanded === i && <p className="text-xs text-muted-foreground mt-2">Подробное описание обновления будет доступно в следующей версии.</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
