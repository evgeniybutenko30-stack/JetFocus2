// Run in a UTC+3 zone (the app's main audience): between 00:00 and 03:00 local time
// toISOString().slice(0, 10) still returns "yesterday" there.
process.env.TZ = 'Europe/Moscow';

import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_KOPECKS,
  buildBalanceTrend,
  computeAccountBalances,
  computeSavingsPlan,
  computeTotalBalance,
  daysBetweenLocal,
  filterOpsInMonth,
  formatLocalDateRu,
  formatMoney,
  goalProgressPercent,
  isAccountInTotal,
  isValidDateStr,
  kopecksToInputString,
  monthKey,
  parseAmountToKopecks,
  parseLocalDate,
  percentOf,
  signedAmount,
  sumByType,
  toLocalDateStr,
} from './financeUtils';
import type { FinanceAccount, FinanceOperation } from './types';

function op(partial: Partial<FinanceOperation>): FinanceOperation {
  return {
    id: partial.id ?? crypto.randomUUID(),
    userId: 'u1',
    type: 'EXPENSE',
    amount: 0,
    category: 'Еда',
    tags: [],
    date: '2026-10-13',
    sphere: 'finance',
    createdAt: 0,
    ...partial,
  };
}

function account(partial: Partial<FinanceAccount>): FinanceAccount {
  return {
    id: partial.id ?? crypto.randomUUID(),
    userId: 'u1',
    name: 'Карта',
    type: 'CARD',
    balance: 0,
    currency: '₽',
    icon: '💳',
    color: '#000',
    isDefault: false,
    hideFromTotal: false,
    createdAt: 0,
    ...partial,
  };
}

describe('parseAmountToKopecks', () => {
  it('accepts a comma decimal separator (Russian keyboard)', () => {
    expect(parseAmountToKopecks('12,50')).toBe(1250);
    expect(parseAmountToKopecks('0,5')).toBe(50);
    expect(parseAmountToKopecks(',99')).toBe(99);
  });

  it('accepts a dot decimal separator and integers', () => {
    expect(parseAmountToKopecks('12.5')).toBe(1250);
    expect(parseAmountToKopecks('1500')).toBe(150000);
    expect(parseAmountToKopecks('7.')).toBe(700);
  });

  it('ignores spaces and NBSP used as thousands separators', () => {
    expect(parseAmountToKopecks('300 000')).toBe(30000000);
    expect(parseAmountToKopecks(' 1\u00A0234,56 ')).toBe(123456);
  });

  it('rounds on the digits instead of float maths', () => {
    // Math.round(parseFloat('1.005') * 100) === 100
    expect(parseAmountToKopecks('1.005')).toBe(101);
    expect(parseAmountToKopecks('1.004')).toBe(100);
    expect(parseAmountToKopecks('0.29')).toBe(29);
  });

  it('accepts an explicit plus sign', () => {
    expect(parseAmountToKopecks('+500')).toBe(50000);
    expect(parseAmountToKopecks('+ 1 500,5')).toBe(150050);
  });

  it('rejects empty, garbage, exponent and ambiguous inputs', () => {
    for (const bad of ['', '   ', '-', '+', ',', 'abc', '12a', '1e5', '1.234,56', '1,234.56', '12,5,0', 'NaN', 'Infinity', '+-1', '-+1', '++1']) {
      expect(parseAmountToKopecks(bad)).toBeNull();
    }
  });

  it('rejects zero unless allowed', () => {
    expect(parseAmountToKopecks('0')).toBeNull();
    expect(parseAmountToKopecks('0,00')).toBeNull();
    expect(parseAmountToKopecks('0', { allowZero: true })).toBe(0);
  });

  it('rejects negatives unless allowed', () => {
    expect(parseAmountToKopecks('-100')).toBeNull();
    expect(parseAmountToKopecks('-100,5', { allowNegative: true })).toBe(-10050);
    expect(parseAmountToKopecks('−100', { allowNegative: true })).toBe(-10000);
    expect(Object.is(parseAmountToKopecks('-0', { allowNegative: true, allowZero: true }), 0)).toBe(true);
  });

  it('rejects absurdly large values', () => {
    expect(parseAmountToKopecks(String(MAX_AMOUNT_KOPECKS / 100))).toBe(MAX_AMOUNT_KOPECKS);
    expect(parseAmountToKopecks(String(MAX_AMOUNT_KOPECKS / 100 + 1))).toBeNull();
    expect(parseAmountToKopecks('9'.repeat(40))).toBeNull();
  });
});

describe('kopecksToInputString', () => {
  it('round-trips through the parser', () => {
    for (const k of [1, 50, 1250, 150000, 123456, 99999999]) {
      expect(parseAmountToKopecks(kopecksToInputString(k))).toBe(k);
    }
  });

  it('formats whole rubles without a fraction and pads kopecks', () => {
    expect(kopecksToInputString(1200)).toBe('12');
    expect(kopecksToInputString(1205)).toBe('12,05');
    expect(kopecksToInputString(-1250)).toBe('-12,50');
    expect(kopecksToInputString(Number.NaN)).toBe('');
  });
});

describe('formatMoney', () => {
  // Intl ru-RU groups digits with NBSP; formatMoney also puts NBSP before the currency sign.
  const plain = (s: string) => s.replace(/\u00A0/g, ' ');

  it('shows kopecks only when there are any (no 12,50 -> "13 ₽" rounding)', () => {
    expect(plain(formatMoney(1250))).toBe('12,50 ₽');
    expect(plain(formatMoney(40))).toBe('0,40 ₽');
    expect(plain(formatMoney(150000))).toBe('1 500 ₽');
    expect(plain(formatMoney(123456789))).toBe('1 234 567,89 ₽');
    expect(plain(formatMoney(0))).toBe('0 ₽');
  });

  it('formats negatives with a leading minus and never "-0"', () => {
    expect(plain(formatMoney(-40))).toBe('-0,40 ₽');
    expect(plain(formatMoney(-150000))).toBe('-1 500 ₽');
    expect(plain(formatMoney(-0))).toBe('0 ₽');
    expect(plain(formatMoney(-0.4))).toBe('0 ₽');
  });

  it('uses the account currency and survives corrupt values', () => {
    expect(plain(formatMoney(1999, '$'))).toBe('19,99 $');
    expect(plain(formatMoney(100, ''))).toBe('1 ₽');
    expect(plain(formatMoney(Number.NaN))).toBe('0 ₽');
    expect(plain(formatMoney(Number.POSITIVE_INFINITY))).toBe('0 ₽');
  });

  it('keeps the currency on the same line as the number', () => {
    expect(formatMoney(150000)).toBe('1\u00A0500\u00A0₽');
  });

  it('round-trips with the parser', () => {
    for (const k of [1, 99, 1250, 150000, 123456]) {
      expect(parseAmountToKopecks(plain(formatMoney(k)).replace(' ₽', ''))).toBe(k);
    }
  });
});

describe('local dates', () => {
  it('toLocalDateStr uses the local calendar day, not UTC', () => {
    // 01:30 in Moscow on 13 Oct is still 12 Oct in UTC.
    const lateNight = new Date(2026, 9, 13, 1, 30);
    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(toLocalDateStr(lateNight)).toBe('2026-10-13');
  });

  it('parseLocalDate parses YYYY-MM-DD as local midnight and validates', () => {
    const d = parseLocalDate('2026-03-01');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(1);
    expect(d?.getHours()).toBe(0);
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('13.10.2026')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(isValidDateStr('2026-10-13')).toBe(true);
    expect(isValidDateStr('')).toBe(false);
  });

  it('formatLocalDateRu shows the stored day', () => {
    expect(formatLocalDateRu('2026-12-31')).toBe('31.12.2026');
    expect(formatLocalDateRu('garbage')).toBe('garbage');
  });

  it('monthKey and daysBetweenLocal', () => {
    expect(monthKey('2026-10-13')).toBe('2026-10');
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    expect(daysBetweenLocal(new Date(2026, 9, 13, 23, 0), new Date(2026, 9, 14, 0, 30))).toBe(1);
    expect(daysBetweenLocal(new Date(2026, 9, 14), new Date(2026, 9, 13))).toBe(-1);
  });
});

describe('sums', () => {
  const ops = [
    op({ type: 'INCOME', amount: 10000 }),
    op({ type: 'EXPENSE', amount: 2500 }),
    op({ type: 'TRANSFER', amount: 7000 }),
    op({ type: 'EXPENSE', amount: Number.NaN }),
  ];

  it('signedAmount treats transfers as neutral and corrupt amounts as 0', () => {
    expect(ops.map(signedAmount)).toEqual([10000, -2500, 0, 0]);
    expect(Object.is(signedAmount(ops[3]), 0)).toBe(true);
  });

  it('sumByType never returns NaN', () => {
    expect(sumByType(ops, 'INCOME')).toBe(10000);
    expect(sumByType(ops, 'EXPENSE')).toBe(2500);
  });

  it('filterOpsInMonth keeps only the current local month (no future months)', () => {
    const now = new Date(2026, 9, 13);
    const list = [
      op({ id: 'a', date: '2026-10-01' }),
      op({ id: 'b', date: '2026-10-31' }),
      op({ id: 'c', date: '2026-09-30' }),
      op({ id: 'd', date: '2026-11-01' }),
      op({ id: 'e', date: '2027-10-05' }),
    ];
    expect(filterOpsInMonth(list, now).map(o => o.id)).toEqual(['a', 'b']);
  });
});

describe('balances', () => {
  const card = account({ id: 'card', balance: 50000 });
  const hidden = account({ id: 'hidden', balance: 100000, hideFromTotal: true });
  const usd = account({ id: 'usd', balance: 30000, currency: '$' });
  const accounts = [card, hidden, usd];

  it('isAccountInTotal excludes hidden and foreign-currency accounts', () => {
    expect(isAccountInTotal(card)).toBe(true);
    expect(isAccountInTotal(hidden)).toBe(false);
    expect(isAccountInTotal(usd)).toBe(false);
  });

  it('account balances follow the operations linked to them', () => {
    const ops = [
      op({ type: 'INCOME', amount: 20000, accountId: 'card' }),
      op({ type: 'EXPENSE', amount: 5000, accountId: 'card' }),
      op({ type: 'EXPENSE', amount: 1000, accountId: 'hidden' }),
      op({ type: 'TRANSFER', amount: 3000, accountId: 'card', toAccountId: 'hidden' }),
      op({ type: 'INCOME', amount: 999, accountId: 'deleted' }),
      op({ type: 'INCOME', amount: 777 }),
    ];
    expect(computeAccountBalances(accounts, ops)).toEqual({
      card: 50000 + 20000 - 5000 - 3000,
      hidden: 100000 - 1000 + 3000,
      usd: 30000,
    });
  });

  it('total = visible ₽ accounts with their ops + unlinked ops', () => {
    const ops = [
      op({ type: 'INCOME', amount: 20000, accountId: 'card' }),
      op({ type: 'EXPENSE', amount: 1000, accountId: 'hidden' }),
      op({ type: 'EXPENSE', amount: 500, accountId: 'usd' }),
      op({ type: 'TRANSFER', amount: 3000, accountId: 'card', toAccountId: 'hidden' }),
      op({ type: 'INCOME', amount: 999, accountId: 'deleted' }),
      op({ type: 'EXPENSE', amount: 700 }),
    ];
    const total = computeTotalBalance(accounts, ops);
    expect(total).toBe(50000 + 20000 - 3000 + 999 - 700);
    // Matches the visible account card plus the unlinked operations.
    const balances = computeAccountBalances(accounts, ops);
    expect(total).toBe(balances.card + 999 - 700);
  });

  it('total with no accounts is income minus expense', () => {
    const ops = [op({ type: 'INCOME', amount: 10000 }), op({ type: 'EXPENSE', amount: 4000 })];
    expect(computeTotalBalance([], ops)).toBe(6000);
    expect(computeTotalBalance([], [])).toBe(0);
  });
});

describe('buildBalanceTrend', () => {
  it('uses local dates, includes today and ends at the total balance', () => {
    // 01:30 local: the UTC date is still yesterday.
    const today = new Date(2026, 9, 13, 1, 30);
    const accounts = [account({ id: 'card', balance: 100000 })];
    const ops = [
      op({ type: 'INCOME', amount: 50000, date: '2026-08-01' }),
      op({ type: 'EXPENSE', amount: 2000, date: '2026-10-01', accountId: 'card' }),
      op({ type: 'EXPENSE', amount: 3000, date: '2026-10-13' }),
    ];
    const points = buildBalanceTrend(ops, accounts, 30, today);
    expect(points[points.length - 1]).toEqual({ date: '13.10', balance: (100000 + 50000 - 2000 - 3000) / 100 });
    expect(points[0]).toEqual({ date: '13.9', balance: 1500 });
    expect(points.length).toBeLessThanOrEqual(17);
    expect(computeTotalBalance(accounts, ops) / 100).toBe(points[points.length - 1].balance);
  });

  it('always ends on today even when the step does not divide the span', () => {
    const today = new Date(2026, 9, 13, 12);
    const points = buildBalanceTrend([], [], 90, today, 16);
    expect(points[points.length - 1].date).toBe('13.10');
    expect(points[0].date).toBe('15.7');
  });

  it('treats transfers as neutral for unlinked accounts', () => {
    const today = new Date(2026, 9, 13, 12);
    const points = buildBalanceTrend([op({ type: 'TRANSFER', amount: 5000, date: '2026-10-10' })], [], 30, today);
    expect(points.every(p => p.balance === 0)).toBe(true);
  });
});

describe('percentages and goals', () => {
  it('percentOf never returns NaN or Infinity', () => {
    expect(percentOf(1, 0)).toBe(0);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, -10)).toBe(0);
    expect(percentOf(Number.NaN, 10)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
  });

  it('goalProgressPercent clamps to 0..100', () => {
    expect(goalProgressPercent(50, 100)).toBe(50);
    expect(goalProgressPercent(500, 100)).toBe(100);
    expect(goalProgressPercent(-10, 100)).toBe(0);
    expect(goalProgressPercent(10, 0)).toBe(0);
    expect(goalProgressPercent(Number.NaN, 100)).toBe(0);
  });

  it('goalProgressPercent shows 100% only when the goal is reached', () => {
    // 99 600 of 100 000 kopecks rounds to 100 %, but 4 ₽ are still missing.
    expect(goalProgressPercent(99600, 100000)).toBe(99);
    expect(goalProgressPercent(99999, 100000)).toBe(99);
    expect(goalProgressPercent(100000, 100000)).toBe(100);
    expect(goalProgressPercent(99400, 100000)).toBe(99);
  });

  it('computeSavingsPlan splits the remainder by local days, rounded up to rubles', () => {
    const now = new Date(2026, 9, 13, 23, 30);
    const plan = computeSavingsPlan(3000000, '2026-11-12', now); // 30 000 ₽ in 30 days
    expect(plan).toEqual({ perMonth: 3000000, perWeek: 600000, perDay: 100000, months: 1 });
    expect(computeSavingsPlan(10001, '2026-10-16', now)).toEqual({ perMonth: 10100, perWeek: 10100, perDay: 3400, months: 1 });
    expect(computeSavingsPlan(0, '2026-11-12', now)).toBeNull();
    expect(computeSavingsPlan(1000, undefined, now)).toBeNull();
  });
});
