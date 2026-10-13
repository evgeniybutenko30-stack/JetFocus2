import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '@/lib/constants';
import { ArrowLeft, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { computeTotalBalance, sumByType } from '@/lib/financeUtils';
import type { FinanceAccount, FinanceOperation } from '@/lib/types';

const NO_OPS: FinanceOperation[] = [];
const NO_ACCOUNTS: FinanceAccount[] = [];

export default function BalancePage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const ops = useLiveQuery(() => db.financeOperations.where('userId').equals(user?.id ?? '').toArray(), [user?.id], NO_OPS);
  const accounts = useLiveQuery(() => db.financeAccounts.where('userId').equals(user?.id ?? '').toArray(), [user?.id], NO_ACCOUNTS);
  const totalIncome = sumByType(ops, 'INCOME');
  const totalExpense = sumByType(ops, 'EXPENSE');
  // Same "Общий баланс" as the Finance page (accounts + operations), not just income minus expense.
  const balance = computeTotalBalance(accounts, ops);

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border/30">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Финансовый обзор</h1>
      </div>
      <div className="px-4 py-6 space-y-4 max-w-lg mx-auto w-full">
        <div className="glass-card p-6 text-center">
          <Wallet size={32} className="mx-auto text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Общий баланс</p>
          <p className={`text-3xl font-bold mt-1 break-words ${balance < 0 ? 'text-destructive' : ''}`}>{formatCurrency(balance)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4 text-center">
            <TrendingUp size={20} className="mx-auto text-sphere-finance mb-1" />
            <p className="text-xs text-muted-foreground">Все доходы</p>
            <p className="text-lg font-bold text-sphere-finance break-words">+{formatCurrency(totalIncome)}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <TrendingDown size={20} className="mx-auto text-destructive mb-1" />
            <p className="text-xs text-muted-foreground">Все расходы</p>
            <p className="text-lg font-bold text-destructive break-words">-{formatCurrency(totalExpense)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
