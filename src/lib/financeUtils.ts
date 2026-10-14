import type { FinanceAccount, FinanceOperation } from './types';

/**
 * Pure helpers for the Finance feature (amount parsing, local dates, balances, goal maths).
 * All money values are integer kopecks; nothing here touches Dexie or the DOM.
 */

/** Largest amount a single operation / account / goal may hold: 10 млрд ₽ (keeps sums far below MAX_SAFE_INTEGER). */
export const MAX_AMOUNT_KOPECKS = 1_000_000_000_000;
/** Currency the app's totals are expressed in. Accounts in other currencies are never mixed into the ₽ total. */
export const BASE_CURRENCY = '₽';

export const FINANCE_AMOUNT_INPUT_MAX = 20;
export const FINANCE_CATEGORY_MAX = 40;
export const FINANCE_DESCRIPTION_MAX = 200;
export const FINANCE_ACCOUNT_NAME_MAX = 40;
export const FINANCE_GOAL_TITLE_MAX = 60;

const AMOUNT_RE = /^([-+])?(\d*)(?:[.,](\d*))?$/;

export interface ParseAmountOptions {
  /** Allow values below zero (e.g. a credit-card account balance). Default false. */
  allowNegative?: boolean;
  /** Allow exactly zero (e.g. "already saved" for a goal). Default false. */
  allowZero?: boolean;
}

/**
 * Parses what a Russian-speaking user types into an amount field and returns integer kopecks,
 * or null when the input is not a valid amount.
 *
 * Accepts a comma or a dot as the decimal separator ("12,50", "12.5"), spaces / NBSP as
 * thousands separators ("300 000"), an optional leading plus ("+500" copied from a bank SMS)
 * and a leading minus (only with `allowNegative`).
 * Works on the string digits, so "1.005" is 101 kopecks (parseFloat * 100 would give 100).
 * Rejects empty input, letters, exponents, ambiguous grouping like "1.234,56" and
 * values above MAX_AMOUNT_KOPECKS.
 */
export function parseAmountToKopecks(input: string, options: ParseAmountOptions = {}): number | null {
  if (typeof input !== 'string') return null;
  const normalized = input.replace(/\s/g, '').replace(/−/g, '-');
  const match = AMOUNT_RE.exec(normalized);
  if (!match) return null;
  const [, sign, intPart = '', fracPart = ''] = match;
  const minus = sign === '-';
  if (intPart === '' && fracPart === '') return null;
  // Guard before Number(): anything this long is far above the maximum anyway.
  if (intPart.replace(/^0+/, '').length > 13) return null;

  const rubles = Number(intPart || '0');
  const firstTwo = Number((fracPart + '00').slice(0, 2));
  const roundUp = fracPart.length > 2 && fracPart[2] >= '5' ? 1 : 0;
  const abs = rubles * 100 + firstTwo + roundUp;

  if (abs > MAX_AMOUNT_KOPECKS) return null;
  if (abs === 0) return options.allowZero ? 0 : null;
  if (minus) return options.allowNegative ? -abs : null;
  return abs;
}

/** Inverse of parseAmountToKopecks for pre-filling an input: 123450 -> "1234,50", 1200 -> "12". */
export function kopecksToInputString(kopecks: number): string {
  if (!Number.isFinite(kopecks)) return '';
  const rounded = Math.round(kopecks);
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = rounded < 0 ? '-' : '';
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole},${String(frac).padStart(2, '0')}`;
}

const WHOLE_FORMAT = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const KOPECKS_FORMAT = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Money for display, ru-RU style: "1 234 ₽", "12,50 ₽", "-0,40 ₽" (groups and the gap before the
 * currency are non-breaking spaces, so "₽" never wraps onto its own line).
 * Kopecks are shown only when there are any, so the user sees exactly what they typed;
 * formatCurrency() rounds to whole rubles (12,50 -> "13 ₽", 0,40 -> "0 ₽").
 * Corrupt (non-finite) values render as 0 instead of "NaN ₽".
 */
export function formatMoney(kopecks: number, currency: string = BASE_CURRENCY): string {
  const value = Number.isFinite(kopecks) ? Math.round(kopecks) : 0;
  const abs = Math.abs(value);
  const body = abs % 100 === 0 ? WHOLE_FORMAT.format(abs / 100) : KOPECKS_FORMAT.format(abs / 100);
  return `${value < 0 ? '-' : ''}${body}\u00A0${currency || BASE_CURRENCY}`;
}

/**
 * Amount with an explicit sign ("+1 000 ₽" / "-12,50 ₽") that never renders "-0 ₽" / "+0 ₽":
 * a zero total is shown unsigned.
 */
export function formatSignedMoney(kopecks: number, sign: '+' | '-', currency: string = BASE_CURRENCY): string {
  const abs = Number.isFinite(kopecks) ? Math.abs(Math.round(kopecks)) : 0;
  return `${abs === 0 ? '' : sign}${formatMoney(abs, currency)}`;
}

/* ───────────────────────────── Local dates ───────────────────────────── */

/** YYYY-MM-DD in the user's LOCAL timezone (same format as getTodayStr / FinanceOperation.date). */
export function toLocalDateStr(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses "YYYY-MM-DD" as a LOCAL calendar date (midnight local time).
 * `new Date('2026-10-13')` is UTC midnight, which is the previous day west of Greenwich.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function isValidDateStr(value: string | null | undefined): boolean {
  return parseLocalDate(value) !== null;
}

/** "YYYY-MM" of a local date string, or of a Date in local time. */
export function monthKey(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 7) : toLocalDateStr(value).slice(0, 7);
}

/** Whole local calendar days from `from` to `to` (negative when `to` is earlier). DST-safe. */
export function daysBetweenLocal(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** Russian short date (dd.mm.yyyy) for a YYYY-MM-DD string, without the UTC off-by-one. */
export function formatLocalDateRu(value: string): string {
  const d = parseLocalDate(value);
  return d ? d.toLocaleDateString('ru-RU') : value;
}

/* ───────────────────────────── Sums & balances ───────────────────────────── */

type OpForSums = Pick<FinanceOperation, 'type' | 'amount'>;
type OpForBalance = Pick<FinanceOperation, 'type' | 'amount' | 'accountId' | 'toAccountId'>;
type AccountForBalance = Pick<FinanceAccount, 'id' | 'balance' | 'currency' | 'hideFromTotal'>;

/** Amount as a finite integer; corrupt rows (NaN / undefined) count as 0 instead of turning every total into NaN. */
function safeAmount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** +amount for income, -amount for expense, 0 for transfers (they only move money between accounts). */
export function signedAmount(op: OpForSums): number {
  if (op.type === 'INCOME') return safeAmount(op.amount);
  if (op.type === 'EXPENSE') return 0 - safeAmount(op.amount); // 0 - 0 is +0, unlike -0
  return 0;
}

export function sumByType(ops: readonly OpForSums[], type: FinanceOperation['type']): number {
  let total = 0;
  for (const op of ops) if (op.type === type) total += safeAmount(op.amount);
  return total;
}

/** Operations whose date falls in the same LOCAL calendar month as `now` (future months excluded). */
export function filterOpsInMonth<T extends Pick<FinanceOperation, 'date'>>(ops: readonly T[], now: Date): T[] {
  const key = monthKey(now);
  return ops.filter(o => typeof o.date === 'string' && monthKey(o.date) === key);
}

/** Whether an account's money is part of the "Общий баланс" (shown, and in the base currency). */
export function isAccountInTotal(account: Pick<FinanceAccount, 'currency' | 'hideFromTotal'>): boolean {
  return !account.hideFromTotal && (account.currency || BASE_CURRENCY) === BASE_CURRENCY;
}

/** Current balance of every account: the initial balance plus the operations linked to it. */
export function computeAccountBalances(
  accounts: readonly AccountForBalance[],
  ops: readonly OpForBalance[],
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) balances[acc.id] = safeAmount(acc.balance);
  for (const op of ops) {
    const amount = safeAmount(op.amount);
    if (op.type === 'TRANSFER') {
      if (op.accountId && op.accountId in balances) balances[op.accountId] -= amount;
      if (op.toAccountId && op.toAccountId in balances) balances[op.toAccountId] += amount;
    } else if (op.accountId && op.accountId in balances) {
      balances[op.accountId] += signedAmount(op);
    }
  }
  return balances;
}

/**
 * How much an operation changes the ₽ total. Operations linked to a hidden or foreign-currency
 * account do not touch it; operations without an account (or whose account is gone) count fully.
 */
export function opDeltaTowardTotal(
  op: OpForBalance,
  accountsById: ReadonlyMap<string, Pick<FinanceAccount, 'currency' | 'hideFromTotal'>>,
): number {
  const amount = safeAmount(op.amount);
  if (op.type === 'TRANSFER') {
    const from = op.accountId ? accountsById.get(op.accountId) : undefined;
    const to = op.toAccountId ? accountsById.get(op.toAccountId) : undefined;
    return (to && isAccountInTotal(to) ? amount : 0) - (from && isAccountInTotal(from) ? amount : 0);
  }
  const account = op.accountId ? accountsById.get(op.accountId) : undefined;
  if (account && !isAccountInTotal(account)) return 0;
  return signedAmount(op);
}

function indexAccounts<A extends Pick<FinanceAccount, 'id'>>(accounts: readonly A[]): Map<string, A> {
  return new Map(accounts.map(a => [a.id, a]));
}

/** Sum of the initial balances of the accounts that are part of the ₽ total. */
export function baseAccountsBalance(accounts: readonly AccountForBalance[]): number {
  let total = 0;
  for (const acc of accounts) if (isAccountInTotal(acc)) total += safeAmount(acc.balance);
  return total;
}

/**
 * "Общий баланс" in ₽ kopecks: visible ₽ accounts (with their operations) plus operations that
 * are not linked to any account. Equals the sum of computeAccountBalances over those accounts
 * plus the unlinked operations, so the account cards and the total always agree.
 */
export function computeTotalBalance(
  accounts: readonly AccountForBalance[],
  ops: readonly OpForBalance[],
): number {
  const byId = indexAccounts(accounts);
  let total = baseAccountsBalance(accounts);
  for (const op of ops) total += opDeltaTowardTotal(op, byId);
  return total;
}

export interface BalanceTrendPoint {
  date: string;
  /** Rubles (the chart axis is in ₽, not kopecks). */
  balance: number;
}

/**
 * Balance-over-time points for the last `days` days (oldest first, always ending with today),
 * using local dates. The last point matches computeTotalBalance, except for future-dated operations.
 */
export function buildBalanceTrend(
  ops: readonly (OpForBalance & Pick<FinanceOperation, 'date'>)[],
  accounts: readonly AccountForBalance[],
  days: number,
  today: Date,
  maxPoints = 16,
): BalanceTrendPoint[] {
  const span = Math.max(1, Math.floor(days));
  const step = Math.max(1, Math.floor(span / Math.max(1, maxPoints - 1)));
  const offsets: number[] = [];
  for (let i = span; i > 0; i -= step) offsets.push(i);
  offsets.push(0);

  const byId = indexAccounts(accounts);
  const sorted = ops
    .filter(o => typeof o.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = baseAccountsBalance(accounts);
  let idx = 0;
  const points: BalanceTrendPoint[] = [];
  for (const offset of offsets) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const ds = toLocalDateStr(d);
    while (idx < sorted.length && sorted[idx].date <= ds) {
      running += opDeltaTowardTotal(sorted[idx], byId);
      idx++;
    }
    points.push({ date: `${d.getDate()}.${d.getMonth() + 1}`, balance: running / 100 });
  }
  return points;
}

/* ───────────────────────────── Percentages & goals ───────────────────────────── */

/** Rounded share in percent, 0 when the whole is 0 / negative / not a number (never NaN or Infinity). */
export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Goal progress 0..100; 100 only once the goal is actually reached (99.6 % shows as 99, not 100). */
export function goalProgressPercent(current: number, target: number): number {
  const pct = Math.min(100, Math.max(0, percentOf(current, target)));
  return pct === 100 && current < target ? 99 : pct;
}

export interface SavingsPlan {
  /** All values in kopecks, rounded up to whole rubles. */
  perMonth: number;
  perWeek: number;
  perDay: number;
  months: number;
}

function ceilToRuble(kopecks: number): number {
  return Math.ceil(kopecks / 100) * 100;
}

/** How much to put aside per month / week / day to reach a goal by its deadline; null if nothing to plan. */
export function computeSavingsPlan(remainingKopecks: number, deadline: string | undefined, now: Date): SavingsPlan | null {
  if (!Number.isFinite(remainingKopecks) || remainingKopecks <= 0) return null;
  const date = parseLocalDate(deadline);
  if (!date) return null;
  const diffDays = Math.max(1, daysBetweenLocal(now, date));
  const months = Math.max(1, Math.ceil(diffDays / 30));
  const weeks = Math.max(1, Math.ceil(diffDays / 7));
  return {
    perMonth: ceilToRuble(remainingKopecks / months),
    perWeek: ceilToRuble(remainingKopecks / weeks),
    perDay: ceilToRuble(remainingKopecks / diffDays),
    months,
  };
}
