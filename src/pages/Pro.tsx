import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, Crown, Zap, CreditCard, Building, Infinity as InfinityIcon } from 'lucide-react';

const PROMO_CODE_MAX = 32;

const FREE_FEATURES = [
  { text: 'До 3 привычек', limited: true },
  { text: 'До 5 задач (без подзадач, вложений)', limited: true },
  { text: 'До 15 финансовых операций/мес', limited: true },
  { text: 'Локальное хранение данных', limited: false },
  { text: 'Базовая статистика', limited: false },
  { text: '3 мини-приложения', limited: false },
];

const PRO_FEATURES = [
  'Неограниченно привычек, задач, операций',
  'Облачная синхронизация',
  'Экспорт в PDF/CSV',
  'Бэкап на 7 дней',
  'До 3 устройств',
  'Все 10 мини-приложений',
  'Реферальная программа (30% + 3%)',
  'Все 8 сфер жизни',
  'Расширенная аналитика',
];

const pricing = [
  { period: '1 месяц', price: 299, perMonth: 299, save: '' },
  { period: '3 месяца', price: Math.round(299 * 3 * 0.85), perMonth: Math.round(299 * 0.85), save: '-15%' },
  { period: '6 месяцев', price: Math.round(299 * 6 * 0.75), perMonth: Math.round(299 * 0.75), save: '-25%' },
  { period: '12 месяцев', price: Math.round(299 * 12 * 0.62), perMonth: Math.round(299 * 0.62), save: '-38%' },
  { period: '24 месяца', price: Math.round(299 * 24 * 0.50), perMonth: Math.round(299 * 0.50), save: '-50%' },
];

export default function ProPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(2); // 6 months default
  const [promoCode, setPromoCode] = useState('');

  // There is no payment provider / promo validation endpoint yet. PRO is granted only on the
  // server (admin console), so the page must not pretend a code was applied or a payment made.
  function applyPromo() {
    const code = promoCode.trim();
    if (code.length < 3) {
      toast.error('Введите промокод');
      return;
    }
    toast.info('Промокод будет проверен при оплате. Онлайн-оплата скоро станет доступна.');
  }

  function handlePurchase() {
    toast.info('Онлайн-оплата скоро станет доступна. Для подключения PRO напишите в поддержку.');
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">PRO подписка</h1>
      </div>
      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4 fade-in">
        <div className="text-center">
          <Crown size={40} className="mx-auto text-[hsl(var(--accent-secondary))] mb-2" />
          <h2 className="text-xl font-bold">JetFocus PRO</h2>
          <p className="text-xs text-muted-foreground">Разблокируйте все возможности</p>
        </div>

        {/* Plan comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <p className="text-sm font-bold mb-1">FREE</p>
            <p className="text-lg font-bold mb-3">0 ₽</p>
            <div className="space-y-1.5">
              {FREE_FEATURES.map(f => (
                <div key={f.text} className="flex items-start gap-1.5">
                  {f.limited ? <span className="text-[hsl(var(--accent-secondary))] text-xs">⚠️</span> : <Check size={12} className="text-primary mt-0.5" />}
                  <span className="text-[10px] text-muted-foreground">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card p-4 border-primary/50">
            <p className="text-sm font-bold mb-1 text-primary">PRO</p>
            <p className="text-lg font-bold mb-3">от 149 ₽/мес</p>
            <div className="space-y-1.5">
              {PRO_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-1.5">
                  <Check size={12} className="text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing options */}
        <p className="text-sm font-semibold">Выберите план</p>
        {pricing.map((p, i) => (
          <button key={p.period} onClick={() => setSelected(i)}
            className={`glass-card p-3 w-full flex items-center justify-between transition-all ${
              selected === i ? 'border-primary/50 bg-primary/5' : ''
            }`}>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selected === i ? 'border-primary' : 'border-muted-foreground/40'
              }`}>
                {selected === i && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{p.period}</p>
                <p className="text-xs text-muted-foreground">{p.perMonth} ₽/мес</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.save && <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] rounded-full font-medium">{p.save}</span>}
              <span className="text-sm font-bold">{p.price.toLocaleString('ru-RU')} ₽</span>
            </div>
          </button>
        ))}

        {/* Forever plan */}
        <button onClick={() => setSelected(99)}
          className={`glass-card p-4 w-full flex items-center justify-between transition-all ${
            selected === 99 ? 'border-primary/50 bg-primary/5' : ''
          }`}>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              selected === 99 ? 'border-primary' : 'border-muted-foreground/40'
            }`}>
              {selected === 99 && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">НАВСЕГДА</p>
                <InfinityIcon size={14} className="text-[hsl(var(--accent-secondary))]" />
              </div>
              <p className="text-xs text-muted-foreground">Одноразовый платёж</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[hsl(var(--accent-secondary))]/20 text-[hsl(var(--accent-secondary))] text-[10px] rounded-full font-medium">BEST</span>
            <span className="text-sm font-bold">5 990 ₽</span>
          </div>
        </button>

        {/* Promo code */}
        <div className="glass-card p-3">
          <p className="text-xs font-medium mb-2">Промокод</p>
          <div className="flex gap-2">
            <input value={promoCode} onChange={e => setPromoCode(e.target.value)} maxLength={PROMO_CODE_MAX}
              autoComplete="off" placeholder="Введите промокод" className="form-input flex-1 min-w-0" />
            <button onClick={applyPromo}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground shrink-0">
              Применить
            </button>
          </div>
        </div>

        {/* Payment methods */}
        <div className="glass-card p-4">
          <p className="text-xs font-medium mb-3">Способы оплаты</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary rounded-xl p-3 flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <div>
                <p className="text-xs font-medium">Банковская карта</p>
                <p className="text-[10px] text-muted-foreground">Visa, Mastercard, Мир</p>
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-3 flex items-center gap-2">
              <Building size={16} className="text-primary" />
              <div>
                <p className="text-xs font-medium">СБП</p>
                <p className="text-[10px] text-muted-foreground">Быстрые платежи</p>
              </div>
            </div>
          </div>
        </div>

        <button onClick={handlePurchase} className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center justify-center gap-2 text-sm">
          <Zap size={16} />
          {selected === 99 ? 'Купить навсегда за 5 990 ₽' : `Оформить PRO за ${pricing[selected]?.price?.toLocaleString('ru-RU') ?? ''} ₽`}
        </button>

        <p className="text-[10px] text-muted-foreground text-center">
          Оплачивая подписку, вы соглашаетесь с условиями использования и политикой конфиденциальности
        </p>
      </div>
    </div>
  );
}
