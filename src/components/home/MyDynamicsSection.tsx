import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, TrendingUp, Scale, Flower2, BarChart3 } from 'lucide-react';
import { BalanceScales } from './BalanceScales';
import { SphereFlower } from './SphereFlower';
import { DynamicsChart, DYNAMICS_MAX_DAYS } from './DynamicsChart';
import { useDashboardData } from '@/hooks/use-metrics';
import { computeSphereBalance } from '@/lib/dashboardStats';

type DynamicsTab = 'scales' | 'flower' | 'chart';

/** Sphere balance window: share of scheduled habit-days done over the last 30 days. */
const SPHERE_BALANCE_DAYS = 30;

export function MyDynamicsSection() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DynamicsTab>('scales');
  // Same query (and cache entry) as DynamicsChart: one request feeds the whole section.
  const { data, isError } = useDashboardData(DYNAMICS_MAX_DAYS);
  const sphereValues = useMemo(
    () => computeSphereBalance(data.habits, data.completions, SPHERE_BALANCE_DAYS),
    [data.habits, data.completions],
  );

  const tabs: { id: DynamicsTab; label: string; icon: typeof Scale }[] = [
    { id: 'scales', label: 'Весы', icon: Scale },
    { id: 'flower', label: 'Цветок', icon: Flower2 },
    { id: 'chart', label: 'Динамика', icon: BarChart3 },
  ];

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border) / 0.6)',
        boxShadow: '0 8px 32px hsl(0 0% 0% / 0.3), inset 0 1px 0 hsl(var(--foreground) / 0.05)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pt-5 pb-4"
        style={{ borderBottom: '1px solid hsl(var(--border) / 0.3)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(var(--primary) / 0.15)' }}
          >
            <TrendingUp size={16} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>Моя динамика</p>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'hsl(var(--primary))' }}>JetFocus</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/balance')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
          style={{
            background: 'hsl(var(--accent))',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Всё <ChevronRight size={12} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="px-5 pt-4">
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'hsl(var(--accent) / 0.5)' }}>
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{
                  background: tab === t.id ? 'hsl(var(--card))' : 'transparent',
                  color: tab === t.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  boxShadow: tab === t.id ? '0 2px 8px hsl(0 0% 0% / 0.2)' : 'none',
                }}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5 pt-4">
        {isError && <p className="text-xs text-destructive text-center mb-2">Не удалось загрузить данные динамики</p>}
        {tab === 'scales' && <BalanceScales values={sphereValues} />}
        {tab === 'flower' && (
          <SphereFlower
            values={sphereValues}
            onSphereClick={(id) => navigate(`/balance?sphere=${id}`)}
          />
        )}
        {tab === 'chart' && <DynamicsChart />}
      </div>
    </div>
  );
}
