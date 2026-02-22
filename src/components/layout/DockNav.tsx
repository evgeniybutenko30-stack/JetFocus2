import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, Target, CheckSquare, Plus, CreditCard, Circle, Wrench } from 'lucide-react';

const DOCK_ITEMS = [
  { icon: LayoutGrid, path: '/today', label: 'Главная' },
  { icon: Target, path: '/goals', label: 'Цели' },
  { icon: CheckSquare, path: '/tasks', label: 'Задачи' },
  { icon: null, path: '/create', label: '' },
  { icon: CreditCard, path: '/finance', label: 'Финансы' },
  { icon: Circle, path: '/habits', label: 'Привычки' },
  { icon: Wrench, path: '/settings', label: 'Настройки' },
];

export function DockNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[hsl(225,20%,8%)]/95 backdrop-blur-xl border-t border-border/30 pb-safe">
      <div className="flex items-end justify-around px-1 pt-1.5 pb-2 max-w-lg mx-auto">
        {DOCK_ITEMS.map((item) => {
          if (!item.icon) {
            return (
              <button key="create" onClick={() => navigate('/create')} className="dock-btn-center">
                <Plus size={24} />
              </button>
            );
          }
          const active = pathname === item.path || pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`dock-btn ${active ? 'dock-btn-active' : ''}`}
            >
              <item.icon size={20} />
              <span className="text-[9px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
