---
name: debts
description: Специфікація і порядок реалізації фічі боргів (кредитні картки як рахунки, розстрочки, позики МФО та банків; ставка, строк, щомісячний платіж, дострокове погашення, погашення з рахунку, статус платежу за місяць, прогноз погашення). Використовуй для будь-якої задачі про борги, кредити, кредитні картки, платежі по боргах або прогноз виходу з боргів.
---

# Борги

Перед роботою прочитай CLAUDE.md (правила щодо грошей, дат і доступу до даних), docs/domain.md
та скіл `monthly-budget` (обмеження за періодом і звʼязок з бюджетом).

## 1. Що робить фіча

Користувач веде список своїх боргів. Для кожного боргу задаються:
- **назва** і **опис**;
- **тип**: кредитна картка, розстрочка, позика МФО, позика банку;
- **сума боргу** (на момент видачі або на момент внесення в застосунок);
- **відсоткова ставка** і її період (річна, місячна, денна);
- **дата, до якої виданий** (кінцевий строк погашення);
- **щомісячний платіж** і **день щомісячного платежу**;
- **чи можливе дострокове погашення**.

Борг гаситься платежами з одного з рахунків користувача. Платіж зменшує баланс рахунку і залишок боргу.

**Кредитна картка — це одночасно борг і рахунок.** З неї, як з будь-якого рахунку, записуються видатки
(у модалці видатку її можна вибрати як рахунок). Кожна покупка по картці збільшує борг,
кожне поповнення картки з іншого рахунку — зменшує.

Для кожного боргу показується: поточний залишок, статус платежу цього місяця
(сплачено / частково / очікується / скоро / прострочено), скільки місяців лишилось,
прогнозована дата погашення і чи встигає борг погаситись до кінцевого строку.
Для кредитки додатково — кредитний ліміт і доступні кошти.

## 2. Доменна модель

### Два способи обліку залишку

| Тип боргу | Джерело правди для залишку | Як збільшується борг | Як гаситься |
|---|---|---|---|
| `credit_card` | баланс повʼязаного рахунку-картки | видатки з картки, нарахування відсотків/комісій | переказ з іншого рахунку на картку |
| `installment`, `mfo_loan`, `bank_loan` | записи `DebtEntry` | нарахування (`charge`) | платіж (`payment`) з рахунку |

Код, що рахує залишок, статус чи прогноз, завжди йде через одну функцію `getDebtBalance(debt)`,
яка всередині вибирає спосіб за типом. Не дублюй цю розвилку в інших місцях.

### Account (розширення наявної сутності)
- `type`: `card | cash | deposit | credit_card`. Рахунок `credit_card` створюється лише разом із боргом.
- `isArchived` — архівний рахунок лишається в історії, але нових транзакцій не приймає.
- `creditLimit` (копійки, > 0) — лише для `credit_card`, для інших `NULL`.
- Баланс рахунку обчислюється з транзакцій (як і раніше). Для `credit_card` баланс може бути відʼємним:
  відʼємний баланс — це борг, додатний — власні кошти на картці.
- `availableAmount = creditLimit + balance` (для `credit_card`).

### Debt
- `id`, `householdId`, `name`, `description` (необовʼязково), `currency` (поки лише `UAH`).
- `type`: `credit_card | installment | mfo_loan | bank_loan`.
- `accountId` — **лише для `credit_card`, обовʼязковий і унікальний**: рахунок-картка, з яким повʼязаний борг.
  Для інших типів `NULL`.
- `initialAmount` (копійки, >= 0) — сума боргу на `startDate`. Для кредитки створює початковий баланс рахунку
  `-initialAmount` (див. «Звірка та початковий баланс»).
- `startDate` — дата видачі або дата, з якої борг ведеться в застосунку.
- `maturityDate` — дата, до якої борг виданий. Обовʼязкова для всіх типів, крім `credit_card`.
- `interestRate` — ставка у відсотках (`numeric(9,4)`, наприклад `24.9900`), `>= 0`.
- `ratePeriod`: `year | month | day`. Ставка зберігається так, як її вказав користувач;
  для розрахунків нормалізується в місячну функцією `toMonthlyRate(rate, period)`.
- `monthlyPayment` (копійки, > 0) — запланований щомісячний платіж (для кредитки — мінімальний).
- `paymentDay` (1–31); якщо в місяці менше днів — останній день місяця.
- `firstPaymentMonth` (`YYYY-MM`, необовʼязково) — місяць першого платежу, не раніший за місяць `startDate`.
  Потрібен, коли борг вносять у застосунок посеред місяця, а платіж цього місяця вже зроблено
  або ще не настав. Можна змінити пізніше.
- `earlyRepaymentAllowed` (boolean). Для `credit_card` завжди `true`.
- `defaultAccountId` — рахунок, з якого зазвичай гаситься борг (необовʼязково; не може дорівнювати `accountId`).
- `status`: `active | closed`.
  - Позики й розстрочки закриваються автоматично, коли залишок стає 0, і відкриваються знову при новому нарахуванні.
  - Кредитка при нульовому залишку лишається `active` (по ній можна знову витрачати).
    Закривається лише вручну, разом з архівацією рахунку-картки.

Типові значення в формі за типом (лише підказки, усе редагується):
| Тип | Строк | Ставка | Примітка |
|---|---|---|---|
| `credit_card` | необовʼязковий | річна | створюється рахунок-картка з кредитним лімітом; платіж — мінімальний |
| `installment` | обовʼязковий | часто 0% | платіж зазвичай фіксований |
| `mfo_loan` | обовʼязковий | денна | короткий строк, висока ставка |
| `bank_loan` | обовʼязковий | річна | ануїтет або класична схема |

### Кредитна картка: рухи по рахунку
Окремих записів боргу немає, усе — звичайні транзакції рахунку-картки:
- **покупка** — `Transaction` `type = expense`, `accountId` = картка, звичайна категорія видатку;
- **відсотки й комісії банку** — `type = expense`, `accountId` = картка, системна категорія «Відсотки та комісії»;
- **погашення** — `type = transfer` з іншого рахунку на картку;
- **повернення коштів / кешбек на картку** — `type = income` на картку;
- **звірка** — `type = balance_adjustment` на картку (див. нижче).

```
cardDebt = max(0, -accountBalance)
```

### Позики й розстрочки: DebtEntry
- `kind`:
  - `payment` — платіж (повʼязаний з транзакцією з рахунку);
  - `charge` — збільшення боргу: комісія, штраф, нараховані відсотки;
  - `adjustment` — звірка з банком: користувач вводить фактичний залишок, запис зберігає різницю.
- `amount` (копійки, > 0 для payment/charge; для adjustment — знакова різниця).
- Для `payment`: `principalPart` і `interestPart` (копійки, сума частин = `amount`).
- `occurredAt`, `note`, `transactionId` (для payment).

```
loanDebt = initialAmount
         + Σ charge.amount
         - Σ payment.principalPart
         + Σ adjustment.amount
```
Відсотки не нараховуються автоматично щодня. Відсоткова частина платежу і нарахування додаються записами,
а неточності виправляються звіркою. Так застосунок не розходиться з банком через різні методи нарахування.

### Платіж по позиці з рахунку
Платіж створює в одній транзакції БД:
1. `Transaction` з `type = debt_payment`, `accountId`, `debtId`, `amount`, `occurredAt`
   (зменшує баланс рахунку);
2. `DebtEntry` з `kind = payment` і посиланням на цю транзакцію.
Видалення платежу видаляє обидва.

### Звірка та початковий баланс
- `balance_adjustment` — службовий тип транзакції. Він змінює баланс рахунку, але **не враховується**
  у бюджеті, аналітиці доходів/витрат і порадах.
- При створенні кредитки з `initialAmount > 0` створюється `balance_adjustment` на `-initialAmount`
  з датою `startDate`.
- Звірка кредитки: користувач вводить фактичний борг з банку, застосунок створює `balance_adjustment`
  на різницю поточною датою.

### Загальні правила для платежів
- Валюта рахунку має збігатися з валютою боргу.
- Якщо на рахунку недостатньо коштів, показується попередження, але платіж не блокується
  (застосунок фіксує факт, а не проводить оплату).
- Гасити кредитку з самої себе не можна (`from = to` → 422).

## 3. Розрахунки (чисті функції в packages/shared/debts)

### Залишок
`getDebtBalance(debt, data)` — повертає залишок боргу за правилами з розділу 2 (картка або записи).

### Розбивка платежу (лише позики й розстрочки)
`suggestPaymentSplit(balance, monthlyRate, amount)`:
```
interestPart  = min(amount, round(balance * monthlyRate))
principalPart = amount - interestPart
```
У формі платежу це лише пропозиція. Користувач може ввести суми з виписки банку.
Для ставки 0% уся сума — тіло боргу.

Для кредитки розбивки немає: погашення — це переказ, а відсотки окремо записуються як видаток
у категорії «Відсотки та комісії».

### Статус платежу за місяць
Для місяця `[periodStart, periodEnd)` і дати платежу `dueDate` у цьому місяці:
```
required = min(monthlyPayment, залишок на початок місяця + нарахування місяця)
paid     = позики: Σ payment.amount у місяці
           кредитка: Σ переказів на картку у місяці
```
`getPaymentStatus(required, paid, dueDate, today)`:
```
if required == 0                       → "none"      (нема що платити)
else if paid >= required               → "paid"      (зелений ✓)
else if today > dueDate                → "overdue"   (червоний !, «Прострочено на N дн.»)
else if paid > 0                       → "partial"   (жовтий ◐, «Сплачено X з Y»)
else if dueDate - today <= 3 дні        → "due_soon"  (помаранчевий ⏰, «Платіж через N дн.»)
else                                   → "pending"   (нейтральний ○, «Платіж DD.MM»)
```
`today` — дата в таймзоні household. У день `dueDate` платіж ще не прострочений.
Якщо `startDate` пізніше за `dueDate` поточного місяця, перший платіж — наступного місяця.
Якщо задано `firstPaymentMonth`, у місяцях до нього `required = 0` і статус `none`; прогноз погашення
починається з платежу цього місяця. Залишок боргу рахується в підсумках одразу.

### Прогноз погашення
`projectPayoff(balance, monthlyRate, monthlyPayment, fromDate)` — помісячна симуляція:
```
balance_{n+1} = balance_n + round(balance_n * monthlyRate) - monthlyPayment
```
Повертає: кількість місяців, дату останнього платежу, загальну суму відсотків, що ще буде сплачена.
Обмеження симуляції — 600 місяців.
- Якщо `monthlyPayment <= balance * monthlyRate` → результат `never` і попередження
  «Платіж не покриває відсотки, борг не зменшується».
- Якщо прогнозована дата пізніше `maturityDate` → попередження
  «За поточного платежу борг не буде погашено до DD.MM.YYYY» і мінімальний платіж,
  потрібний для погашення вчасно (`requiredPaymentForMaturity`).
- Для кредитки прогноз припускає, що нових покупок не буде; UI показує це підказкою.

### Дострокове погашення (лише позики й розстрочки)
Платіж вважається достроковим, якщо після нього сума платежів за місяць перевищує `required`.
- `earlyRepaymentAllowed = true` — без обмежень; у прогнозі показується, скільки відсотків заощаджено.
- `earlyRepaymentAllowed = false` — платіж не блокується (бо фіксується факт), але API вимагає
  `confirmEarly: true`, інакше повертає `422 EARLY_REPAYMENT_NOT_ALLOWED`.
  UI показує попередження й просить підтвердження.
  Майбутні поради й стратегії (avalanche/snowball) не пропонують додаткових платежів по такому боргу.

### Кредитний ліміт
`getCardLimitState(creditLimit, balance)`:
```
available = creditLimit + balance
usage     = max(0, -balance) / creditLimit
```
- Видаток, після якого `available < 0`, не блокується, але модалка видатку показує попередження
  «Перевищення кредитного ліміту на X ₴».
- `usage >= 0.9` — індикатор «Ліміт майже вичерпано».

### Огляд усіх боргів
```
totalBalance          = Σ getDebtBalance активних боргів
totalMonthlyPayments  = Σ monthlyPayment активних боргів із залишком > 0
weightedAnnualRate    = Σ(balance * річна ставка) / totalBalance
dueThisMonth          = Σ (required - paid) для боргів зі статусом pending/due_soon/partial/overdue
debtFreeDate          = найпізніша прогнозована дата погашення серед активних боргів
totalCreditAvailable  = Σ available по кредитках
```

## 4. Обмеження за датою

Як і для видатків (див. `monthly-budget`, розділ 4): платежі, нарахування, покупки по картці
й перекази на картку можна внести на сьогодні або будь-яку минулу дату, але не на майбутню
(`422 EXPENSE_DATE_IN_FUTURE`). Записи минулих періодів можна видаляти.
Платіж і нарахування по позиці не можуть бути раніше за `startDate` боргу.

Звірку (`adjustment`, `balance_adjustment`) можна внести лише поточною датою; вона не змінює минулі записи.

Початкові дані боргу (`initialAmount`, `startDate`) можна вказати в минулому — це стан на момент
внесення боргу в застосунок, а не запис руху. `startDate` у майбутньому заборонена.

## 5. Звʼязок з бюджетом і аналітикою

Головне правило — **жодних подвійних витрат**: гроші рахуються як видаток один раз.

| Рух | Потрапляє в `spent` бюджету? | Категорія |
|---|---|---|
| Покупка з кредитки | так (це і є витрата) | категорія покупки |
| Відсотки й комісії по кредитці | так | «Відсотки та комісії» |
| Погашення кредитки (переказ) | **ні** (покупки вже враховані) | — |
| Платіж по позиці/розстрочці (`debt_payment`) | так | «Погашення боргів» |
| Звірка (`balance_adjustment`, `adjustment`) | ні | — |
| Нарахування по позиці (`charge`) | ні (гроші з рахунку не йдуть) | — |

- «Погашення боргів» і «Відсотки та комісії» — системні категорії, їх не можна видалити.
- При створенні бюджету ліміт «Погашення боргів» за замовчуванням = сума `monthlyPayment`
  активних позик і розстрочок (без кредиток і без боргів, у яких `firstPaymentMonth` пізніше
  за місяць бюджету).
- Видатки з кредитки підпадають під ті самі правила бюджету, що й з будь-якого іншого рахунку.

Це потребує змін у скілі `monthly-budget`: агрегація `spent` враховує `debt_payment` і не враховує
`transfer` та `balance_adjustment`. Зроби це окремим кроком (розділ 10).

## 6. API

```
GET    /debts?month=2026-10                 → огляд: підсумки + список боргів зі статусом платежу за місяць
POST   /debts                               { name, type, description?, currency, initialAmount, startDate,
                                              maturityDate?, interestRate, ratePeriod, monthlyPayment,
                                              paymentDay, firstPaymentMonth?, earlyRepaymentAllowed,
                                              defaultAccountId?,
                                              creditLimit?,              // обовʼязково для credit_card
                                              existingAccountId? }       // привʼязати наявний рахунок-картку
                                            → для credit_card атомарно створює рахунок (або привʼязує наявний)
                                              і початковий balance_adjustment
GET    /debts/:id                           → деталі, історія рухів, прогноз погашення, стан ліміту (для кредитки)
PATCH  /debts/:id                           (зміна умов не змінює історію; для кредитки можна змінити creditLimit)
POST   /debts/:id/close                     (кредитка: лише при нульовому залишку; архівує рахунок)
DELETE /debts/:id                           (разом із рухами: у позики зникають записи й платежі;
                                             кредитка з рухами лишає рахунок звичайним з усіма транзакціями,
                                             кредитка без рухів видаляється разом із рахунком)

# позики й розстрочки
POST   /debts/:id/payments                  { accountId, amount, date, principalPart?, interestPart?, confirmEarly? }
POST   /debts/:id/charges                   { amount, date, note? }
DELETE /debts/:id/entries/:entryId          (лише поточний період; для payment видаляє і транзакцію)

# кредитки
POST   /debts/:id/card-payments             { fromAccountId, amount, date }  → переказ на рахунок-картку
POST   /debts/:id/card-fees                 { amount, date, note? }          → видаток «Відсотки та комісії» з картки

# обидва типи
POST   /debts/:id/adjustments               { actualBalance, note? }   → звірка поточною датою
GET    /debts/:id/payment-preview?amount=…  → розбивка (для позик), чи платіж достроковий, новий прогноз
```
Покупки по кредитці створюються через звичайний endpoint видатків (`POST /transactions`, `type = expense`)
з `accountId` картки. `card-payments` — тонка обгортка над створенням переказу, щоб UI боргів не знав
про внутрішню модель рахунків.

Приклад відповіді `GET /debts?month=2026-10`:
```json
{
  "month": "2026-10", "currency": "UAH",
  "summary": { "totalBalance": 8540000, "totalMonthlyPayments": 390000, "weightedAnnualRate": 31.2,
               "dueThisMonth": 120000, "debtFreeDate": "2029-04-25", "totalCreditAvailable": 2660000 },
  "debts": [
    { "id": "...", "name": "Кредитка Mono", "type": "credit_card", "accountId": "...", "balance": 2340000,
      "card": { "creditLimit": 5000000, "available": 2660000, "usage": 0.468 },
      "interestRate": 3.1, "ratePeriod": "month", "monthlyPayment": 120000, "paymentDay": 25,
      "maturityDate": null, "earlyRepaymentAllowed": true,
      "month": { "dueDate": "2026-10-25", "required": 120000, "paid": 0, "status": "pending" },
      "projection": { "months": 31, "payoffDate": "2029-04-25", "totalInterest": 1410000,
                      "maturityWarning": null, "paymentCoversInterest": true, "assumesNoNewPurchases": true } },
    { "id": "...", "name": "Розстрочка на ноутбук", "type": "installment", "accountId": null, "balance": 1200000,
      "interestRate": 0, "ratePeriod": "year", "monthlyPayment": 270000, "paymentDay": 10,
      "maturityDate": "2027-02-10", "earlyRepaymentAllowed": false,
      "month": { "dueDate": "2026-10-10", "required": 270000, "paid": 270000, "status": "paid" },
      "projection": { "months": 5, "payoffDate": "2027-03-10",
                      "maturityWarning": { "requiredPayment": 300000 }, "paymentCoversInterest": true } }
  ]
}
```

Правила:
- Кожен запит перевіряє, що борг і рахунки належать household поточного користувача.
- Вхідні дані валідуються zod-схемами з packages/shared; порушення схеми — `400 VALIDATION_ERROR`,
  як і в решті API (`422` лишається для правил із власним кодом: `CURRENCY_MISMATCH`,
  `DEBT_TYPE_MISMATCH`, `SAME_ACCOUNT`, `EARLY_REPAYMENT_NOT_ALLOWED`, `EXPENSE_DATE_IN_FUTURE`):
  `maturityDate` обовʼязкова для всіх типів, крім `credit_card`; `maturityDate > startDate`;
  `creditLimit` обовʼязковий тоді й лише тоді, коли тип `credit_card`;
  `principalPart + interestPart = amount`.
- Створення кредитки (рахунок + борг + початковий баланс) і платіж по позиці (транзакція + запис) — атомарні.
- Валюта рахунку ≠ валюта боргу → 422. Переказ з картки на неї ж → 422.
- Рахунок-картка, привʼязаний до боргу, не можна видалити окремо від боргу.

## 7. База даних (міграція)

```sql
-- рахунки
-- до наявного enum account_type ('card','cash','deposit') додається 'credit_card'
ALTER TABLE accounts
  ADD COLUMN credit_limit bigint,
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT accounts_credit_limit_chk
    CHECK ((type = 'credit_card') = (credit_limit IS NOT NULL) AND (credit_limit IS NULL OR credit_limit > 0));

CREATE TABLE debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('credit_card','installment','mfo_loan','bank_loan')),
  account_id uuid UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL DEFAULT 'UAH',
  initial_amount bigint NOT NULL CHECK (initial_amount >= 0),
  start_date date NOT NULL,
  maturity_date date,
  interest_rate numeric(9,4) NOT NULL CHECK (interest_rate >= 0),
  rate_period text NOT NULL CHECK (rate_period IN ('year','month','day')),
  monthly_payment bigint NOT NULL CHECK (monthly_payment > 0),
  payment_day smallint NOT NULL CHECK (payment_day BETWEEN 1 AND 31),
  early_repayment_allowed boolean NOT NULL DEFAULT true,
  default_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'credit_card') = (account_id IS NOT NULL)),
  CHECK (type = 'credit_card' OR maturity_date IS NOT NULL),
  CHECK (maturity_date IS NULL OR maturity_date > start_date),
  CHECK (type <> 'credit_card' OR early_repayment_allowed),
  CHECK (default_account_id IS NULL OR default_account_id IS DISTINCT FROM account_id)
);

-- лише для позик і розстрочок
CREATE TABLE debt_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('payment','charge','adjustment')),
  amount bigint NOT NULL,
  principal_part bigint,
  interest_part bigint,
  transaction_id uuid UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'adjustment' OR amount > 0),
  CHECK (kind <> 'payment' OR (transaction_id IS NOT NULL
         AND principal_part >= 0 AND interest_part >= 0
         AND principal_part + interest_part = amount))
);
CREATE INDEX ON debt_entries (debt_id, occurred_at);

-- transactions:
--   нові типи 'debt_payment' і 'balance_adjustment';
--   debt_id uuid NULL REFERENCES debts(id), CHECK: (type = 'debt_payment') = (debt_id IS NOT NULL);
--   balance_adjustment: amount знаковий, категорії немає.
-- categories: system_key text NULL ('debt_repayment' | 'interest_fees'), UNIQUE (household_id, system_key)
-- індекс: transactions (account_id, occurred_at)
```
Тригер або перевірка в сервісі: `debt_entries` і `debt_payment` не можуть посилатися на борг типу `credit_card`.
Залишки й сплачене за місяць — одним запитом з агрегацією, а не циклом у коді.

## 8. UI

### Екран «Борги» (apps/web/src/features/debts)
- картка підсумку: загальний борг, щомісячні платежі, середня ставка, до сплати цього місяця,
  прогнозована дата виходу з боргів, доступний кредитний ліміт;
- список боргів, відсортований за датою найближчого платежу. У рядку: назва, тип (іконка),
  залишок, ставка, платіж і дата, індикатор статусу місяця, прогрес погашення;
  для кредитки — смуга використання ліміту «X з Y ₴»;
- у кожному рядку меню дій «⋯»: «Змінити умови», «Видалити»;
- кнопка «+ Борг».

### Форма боргу
- усі поля з розділу 1; при виборі типу підставляються типові значення;
- для `credit_card`: поле «Кредитний ліміт», вибір «Створити новий рахунок-картку» або
  «Привʼязати наявний рахунок», строк необовʼязковий, перемикача дострокового погашення немає;
- превʼю прогнозу погашення в реальному часі.

### Сторінка боргу
- умови, залишок, прогноз (місяці, дата, сума відсотків), попередження про строк
  і про платіж, що не покриває відсотки;
- позики: історія записів (платежі з розбивкою, нарахування, звірки);
  дії «Сплатити», «Нарахування», «Звірити залишок»;
- кредитка: ліміт і доступні кошти, історія транзакцій рахунку-картки (покупки, погашення, відсотки, звірки);
  дії «Погасити», «Відсотки / комісія», «Звірити залишок», посилання на рахунок.

### Модалка видатку (спільна, `features/expenses/components/ExpenseFormModal`)
- у виборі рахунку кредитки показуються з доступним лімітом;
- якщо сума перевищує доступний ліміт — попередження (не блокування).

### Модалки платежу
- позика: рахунок (за замовчуванням `defaultAccountId`) з балансом, сума (за замовчуванням —
  несплачений `required`), дата (не пізніше сьогодні), розбивка з `payment-preview`,
  попередження й чекбокс для забороненого дострокового погашення;
- кредитка: рахунок-джерело (без самої картки), сума з підказками «Мінімальний платіж» і «Весь борг», дата.

Стилі статусів: `paid` — зелений, `partial` — жовтий, `due_soon` — помаранчевий, `overdue` — червоний,
`pending` і `none` — нейтральний. Колір ніколи не є єдиним індикатором: завжди є іконка й текст.
Кольори з токенів теми з підтримкою темної теми.

Після будь-якої зміни інвалідуються запити боргів, рахунків, видатків, бюджету й аналітики (React Query).

## 9. Тести (обовʼязкові)

Unit:
- `toMonthlyRate`: 36% річних → 3% місячних; денна 1% → 30.4167% місячних (365/12 днів)
- `suggestPaymentSplit`: ставка 0 → усе в тіло; платіж менший за відсотки → усе у відсотки
- `getPaymentStatus`: paid, partial, overdue наступного дня після dueDate, due_soon за 3 дні,
  pending, none при нульовому залишку; paymentDay 31 у лютому → останній день місяця
- `projectPayoff`: ставка 0 → `ceil(balance / payment)` місяців; платіж не покриває відсотки → `never`;
  попередження про строк і `requiredPaymentForMaturity`
- `getDebtBalance`: позика (initial + charges − principal ± adjustments); кредитка (`max(0, -accountBalance)`),
  додатний баланс картки → борг 0
- `getCardLimitState`: доступно, перевищення, usage ≥ 0.9

API (Supertest):
- створення кредитки створює рахунок, борг і початковий баланс атомарно; помилка відкочує все
- видаток з картки збільшує борг; переказ на картку зменшує борг і зараховується в `paid` місяця
- видаток з картки понад ліміт → 201 (не блокується)
- переказ з картки на неї ж → 422
- платіж по позиці створює транзакцію рахунку і запис боргу атомарно; видалення відновлює баланс рахунку
- `debt_entries` / `debt_payment` для кредитки → 422
- достроковий платіж при `earlyRepaymentAllowed = false` без `confirmEarly` → 422
- рух з майбутньою датою → 422; з датою минулого місяця → 201
- рахунок іншої валюти або чужий рахунок → 422/404
- позика: залишок 0 → `closed`; нове нарахування → знову `active`. Кредитка при 0 лишається `active`
- `bank_loan` без `maturityDate` → 400; `credit_card` без `creditLimit` → 400
- видалення позики з рухами прибирає записи й платежі та відновлює баланс рахунку
- видалення кредитки з рухами лишає рахунок звичайним з усіма транзакціями
- видалення рахунку-картки окремо від боргу → 409

Бюджет (Supertest, разом з `monthly-budget`):
- покупка з кредитки потрапляє у `spent` своєї категорії
- погашення кредитки (переказ) у `spent` не потрапляє
- відсотки по кредитці → «Відсотки та комісії»; платіж по позиці → «Погашення боргів»
- `balance_adjustment` не впливає на бюджет і аналітику

E2E (Playwright):
- створити кредитку з лімітом 50 000 ₴ → додати видаток з картки на сторінці бюджету → борг і використання
  ліміту зросли, категорія видатку в бюджеті зросла → погасити картку з дебетового рахунку → борг зменшився,
  статус місяця `paid`, бюджет не змінився;
- створити «Позика банку» → сплатити місячний платіж → статус `paid`, баланс рахунку зменшився,
  у бюджеті зросла «Погашення боргів».

## 10. Порядок реалізації

1. Чисті функції: ставки, розбивка, статус, прогноз, `getDebtBalance`, ліміт картки + unit-тести.
2. Міграція рахунків (`type`, `credit_limit`) і транзакцій (`debt_payment`, `balance_adjustment`, `debt_id`);
   переконатися, що наявні розрахунки балансів рахунків працюють з відʼємним балансом.
3. Міграція боргів (`debts`, `debt_entries`).
4. CRUD боргів, включно з атомарним створенням кредитки + API-тести.
5. Рухи позик: платежі, нарахування, звірка + API-тести.
6. Рухи кредиток: погашення-переказ, відсотки, звірка; кредитки у виборі рахунку модалки видатку + API-тести.
7. Звʼязок з бюджетом: системні категорії, правила `spent` з розділу 5, оновлення скіла `monthly-budget`.
8. UI: огляд → форма боргу → сторінка боргу (позика і кредитка) → модалки платежу.
9. E2E, оновлення docs/api.md і docs/domain.md.

Кожен крок — окремий коміт. Перед кроком 4 покажи план endpoint-ів і чекай погодження.

## 11. Поза межами цієї фічі
- стратегії виходу з боргів (avalanche/snowball) і поради — окремий скіл;
- автоматичне щоденне нарахування відсотків і точні графіки ануїтету/класичної схеми банку;
- пільговий (грейс) період кредитки й розрахунок відсотків за ним;
- розстрочка, оформлена з кредитки (частина балансу картки переходить в окремий борг);
- нагадування про платежі;
- мультивалютні борги та погашення з рахунку в іншій валюті;
- борги, які винні користувачу (позичив комусь).
