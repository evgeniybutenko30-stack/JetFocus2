import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CheckCircle, ListTodo, TrendingUp, TrendingDown, Target } from 'lucide-react';

const actions = [
  { icon: CheckCircle, label: 'Добавить привычку', path: '/habits/new', color: 'text-sphere-health' },
  { icon: ListTodo, label: 'Добавить задачу', path: '/tasks/new', color: 'text-sphere-career' },
  { icon: Target, label: 'Добавить цель', path: '/goals/new', color: 'text-[hsl(var(--accent-tertiary))]' },
  { icon: TrendingUp, label: 'Добавить доход', path: '/finance/new?type=income', color: 'text-sphere-finance' },
  { icon: TrendingDown, label: 'Добавить расход', path: '/finance/new?type=expense', color: 'text-destructive' },
];

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function CreateSheet({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-2xl">
        <SheetHeader><SheetTitle className="text-foreground">Создать</SheetTitle></SheetHeader>
        <div className="grid gap-1 py-4">
          {actions.map(a => (
            <button
              key={a.path}
              onClick={() => { onOpenChange(false); navigate(a.path); }}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors"
            >
              <a.icon size={20} className={a.color} />
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
