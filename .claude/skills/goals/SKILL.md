---
name: goals
description: Специфікація і порядок реалізації фічі цілей (ціль накопичення, привʼязана до рахунку, з прогресом, потрібним внеском і прогнозом; ціль виходу з боргів з прогресом, потрібним платежем і планом погашення за стратегіями «лавина» та «сніжна куля»). Використовуй для будь-якої задачі про цілі, накопичення, план виходу з боргів або стратегії погашення.
---

# Цілі

Перед роботою прочитай CLAUDE.md (правила щодо грошей, дат, доступу до даних і тону порад),
docs/domain.md та скіл `debts` (залишки, ставки й платежі боргів).

## 1. Що робить фіча

Розділ «Цілі» з двома видами цілей:
1. **Накопичення** (`savings`) — зібрати суму на рахунку, за бажанням до дати.
2. **Вихід із боргів** (`debt_payoff`) — погасити вибрані борги до дати.

Для кожної цілі показується прогрес, скільки лишилося, чи встигає користувач до дати і скільки
треба відкладати або платити щомісяця. Для цілі виходу з боргів додатково будується план погашення
з додатковим платежем за однією з двох стратегій.

Цілі нічого не дублюють: гроші й борги беруться з рахунків і боргів. Валюта — лише `UAH`.

## 2. Доменна модель

### Goal
- `id`, `householdId`, `kind`: `savings | debt_payoff`, `name`, `description` (необовʼязково), `currency`.
- `targetDate` — необовʼязкова для `savings`, обовʼязкова для `debt_payoff`.
- `status`: `active | archived`. Архівна ціль лишається в списку окремо й не рахується активною.
  Досягнення цілі не зберігається, а обчислюється.

Лише для `savings`:
- `accountId` — рахунок, на якому збираються гроші. Обовʼязковий; не кредитна картка й не архівний.
  Один рахунок — одна активна ціль.
- `targetAmount` (копійки, > 0).
- `monthlyContribution` (копійки, > 0, необовʼязково) — плановий щомісячний внесок.

Лише для `debt_payoff`:
- борги цілі — таблиця `goal_debts` (`goalId`, `debtId`); щонайменше один борг.
- `startBalance` (копійки) — сумарний залишок боргів цілі на момент створення.
- `extraPayment` (копійки, >= 0) — скільки понад мінімальні платежі користувач готовий платити щомісяця.
- `strategy`: `avalanche | snowball`.

### Поповнення цілі накопичення
Окремих записів немає. Прогрес — це баланс привʼязаного рахунку, тому поповнення — звичайний
переказ на цей рахунок (`type = transfer`). У бюджеті й аналітиці він не є ні витратою, ні доходом.
Баланс рахунку на момент створення цілі зараховується в прогрес.

## 3. Розрахунки (чисті функції в packages/shared/goals)

Усі суми — цілі числа в копійках. Місяці — рядки `YYYY-MM` у таймзоні household.

### Накопичення
```
saved      = max(0, balance рахунку)
remaining  = max(0, targetAmount - saved)
progress   = min(1, saved / targetAmount)
monthsLeft = різниця в місяцях між місяцем targetDate і поточним місяцем, не менше 1
requiredMonthly = ceil(remaining / monthsLeft)        // лише якщо є targetDate >= today і remaining > 0
pace       = monthlyContribution ?? середній приріст балансу за три попередні повні місяці (якщо > 0)
projectedMonth = поточний місяць + ceil(remaining / pace)   // null без pace або коли ціль досягнуто
```
Стан `getSavingsState`:
```
if remaining == 0                         → "achieved"   (зелений ✓, «Ціль досягнуто»)
else if немає targetDate                  → "no_deadline" (нейтральний)
else if targetDate < today                → "overdue"    (червоний !, «Строк минув»)
else if pace != null && pace >= requiredMonthly → "on_track" (зелений, «Встигаєте»)
else                                      → "behind"     (жовтий ◐, «Відстаєте: потрібно X на місяць»)
```

### Вихід із боргів
```
currentBalance = сума залишків боргів цілі
paid           = max(0, startBalance - currentBalance)
progress       = startBalance > 0 ? min(1, paid / startBalance) : (currentBalance == 0 ? 1 : 0)
```
Нові покупки з кредитки збільшують `currentBalance` і зменшують прогрес — це показує рух назад.

### План погашення `simulatePayoff(debts, extra, strategy, firstMonth)`
Помісячна симуляція, не довша за 600 місяців. Щомісяця:
1. на кожен борг із залишком нараховуються відсотки `round(balance * monthlyRate)`;
2. по кожному вноситься мінімальний платіж (`monthlyPayment`), але не більше за залишок;
3. додаткові гроші — `extra` плюс мінімальні платежі вже погашених боргів — ідуть на борги
   за порядком стратегії, доки не закінчаться:
   - `avalanche` — спершу найвища річна ставка (при рівних — менший залишок);
   - `snowball` — спершу найменший залишок (при рівних — вища ставка).
Борги з `earlyRepaymentAllowed = false` додаткових грошей не отримують.
Для кредитки симуляція припускає, що нових покупок не буде.

Результат: кількість місяців і місяць виходу з боргів (`null`, якщо борги не погашаються),
сума відсотків, порядок погашення боргів (борг і місяць) та сумарний залишок на кінець кожного місяця.

Порівняння: `baseline` — лише мінімальні платежі, без додаткових грошей і без перенесення звільнених
платежів. `interestSaved = baseline.totalInterest - plan.totalInterest`,
`monthsSaved = baseline.months - plan.months` (`null`, якщо базовий сценарій не закінчується).

### Потрібний платіж і стан цілі
```
monthsAvailable = різниця в місяцях між місяцем targetDate і поточним місяцем + 1
requiredMonthly = мінімальні платежі + найменший extra, з яким план закінчується за monthsAvailable місяців
```
`requiredMonthly = null`, якщо борги не можна погасити до дати жодним додатковим платежем
(наприклад, борг без дострокового погашення триває довше).

Стан `getDebtGoalState`:
```
if currentBalance == 0                                   → "achieved"
else if targetDate < today                               → "overdue"
else if план із extraPayment і strategy цілі закінчується не пізніше місяця targetDate → "on_track"
else                                                     → "behind"
```

### Тон
Тексти описові («за такого плану борги буде погашено у березні 2028»), без порад у стилі
професійного консультанта. Стратегію вибирає користувач; застосунок лише показує наслідки.

## 4. API

```
GET    /goals                         → { today, goals: [...] } з розрахунками; активні перед архівними
POST   /goals                         savings:     { kind, name, description?, accountId, targetAmount,
                                                     targetDate?, monthlyContribution? }
                                      debt_payoff: { kind, name, description?, debtIds, targetDate,
                                                     extraPayment?, strategy? }
GET    /goals/:id
PATCH  /goals/:id                     (вид цілі не змінюється; для savings можна змінити рахунок)
DELETE /goals/:id                     (рахунки, перекази й борги не чіпає)
POST   /goals/:id/archive
POST   /goals/:id/contributions       { fromAccountId, amount, date } → переказ на рахунок цілі (лише savings)
GET    /goals/:id/payoff-plan?extra=…&strategy=…   (лише debt_payoff; за замовчуванням — значення цілі)
```

Приклад цілі накопичення:
```json
{ "id": "...", "kind": "savings", "name": "Подушка", "description": null, "status": "active",
  "currency": "UAH", "targetDate": "2027-06-30", "accountId": "...", "accountName": "Депозит",
  "targetAmount": 10000000, "monthlyContribution": 500000,
  "saved": 2000000, "remaining": 8000000, "progress": 0.2,
  "requiredMonthly": 1000000, "pace": 500000, "projectedMonth": "2028-02", "state": "behind" }
```
Приклад цілі виходу з боргів:
```json
{ "id": "...", "kind": "debt_payoff", "name": "Без боргів", "description": null, "status": "active",
  "currency": "UAH", "targetDate": "2028-03-31",
  "debts": [{ "id": "...", "name": "Кредитка", "balance": 2340000 }],
  "startBalance": 3000000, "currentBalance": 2340000, "paid": 660000, "progress": 0.22,
  "extraPayment": 200000, "strategy": "avalanche",
  "minimumPayments": 120000, "requiredMonthly": 150000, "debtFreeMonth": "2027-11", "state": "on_track" }
```
Приклад `GET /goals/:id/payoff-plan`:
```json
{ "extra": 200000, "strategy": "avalanche",
  "plan": { "months": 14, "debtFreeMonth": "2027-11", "totalInterest": 310000,
            "payoffOrder": [{ "debtId": "...", "name": "Кредитка", "month": "2027-11" }],
            "timeline": [{ "month": "2026-10", "balance": 2190000 }] },
  "baseline": { "months": 31, "debtFreeMonth": "2029-04", "totalInterest": 1410000 },
  "interestSaved": 1100000, "monthsSaved": 17,
  "withoutExtra": [{ "debtId": "...", "name": "Розстрочка" }] }
```

Правила:
- Кожен запит перевіряє, що ціль, рахунки й борги належать household поточного користувача.
- Вхідні дані валідуються zod-схемами з packages/shared; порушення схеми — `400 VALIDATION_ERROR`.
- Рахунок цілі: чужий або невідомий → 404; не в `UAH` → `422 CURRENCY_MISMATCH`;
  кредитна картка або архівний → 400; уже має активну ціль → 409.
- Поповнення: з рахунку цілі на нього ж → `422 SAME_ACCOUNT`; майбутня дата → `422 EXPENSE_DATE_IN_FUTURE`;
  для цілі виходу з боргів → `422 GOAL_KIND_MISMATCH`. План погашення для цілі накопичення — так само.
- Рахунок, привʼязаний до цілі, не можна видалити (409).
- Видалений борг зникає з цілі; ціль без боргів лишається зі станом `achieved`.

## 5. База даних (міграція)

```sql
CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('savings','debt_payoff')),
  name text NOT NULL,
  description text,
  currency char(3) NOT NULL DEFAULT 'UAH',
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  account_id uuid REFERENCES accounts(id),
  target_amount bigint CHECK (target_amount > 0),
  monthly_contribution bigint CHECK (monthly_contribution > 0),
  start_balance bigint CHECK (start_balance >= 0),
  extra_payment bigint CHECK (extra_payment >= 0),
  strategy text CHECK (strategy IN ('avalanche','snowball')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'savings') = (account_id IS NOT NULL AND target_amount IS NOT NULL)),
  CHECK (kind <> 'savings' OR (start_balance IS NULL AND extra_payment IS NULL AND strategy IS NULL)),
  CHECK (kind <> 'debt_payoff' OR (target_date IS NOT NULL AND start_balance IS NOT NULL
         AND extra_payment IS NOT NULL AND strategy IS NOT NULL AND monthly_contribution IS NULL))
);
CREATE UNIQUE INDEX ON goals (account_id) WHERE status = 'active';

CREATE TABLE goal_debts (
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, debt_id)
);
```

## 6. UI (apps/web/src/features/goals)

- Пункт «Цілі» в меню.
- Список цілей картками: назва, вид (іконка), прогрес-бар, «зібрано X з Y» або «погашено X з Y»,
  індикатор стану, потрібний щомісячний внесок чи платіж, прогнозований місяць.
- Форма цілі: вибір виду; для накопичення — рахунок, сума, дата, плановий внесок;
  для виходу з боргів — борги (чекбокси, «вибрати всі»), дата, додатковий платіж, стратегія.
- Ціль накопичення: кнопка «Поповнити» (рахунок-джерело, сума, дата).
- Сторінка цілі виходу з боргів: поля «додатковий платіж» і «стратегія» перераховують план наживо;
  порядок погашення, місяць виходу з боргів, заощаджені відсотки й місяці проти мінімальних платежів;
  графік сумарного залишку по місяцях + таблиця; кнопка «Зберегти як план цілі».
- Меню дій цілі: «Змінити», «В архів», «Видалити».
- Стани: `achieved` і `on_track` — зелений, `behind` — жовтий, `overdue` — червоний,
  `no_deadline` — нейтральний. Колір ніколи не є єдиним індикатором: завжди є іконка й текст.
- Після змін інвалідуються запити цілей, рахунків і транзакцій; зміни транзакцій і боргів
  інвалідують запити цілей.

## 7. Тести (обовʼязкові)

Unit:
- накопичення: прогрес, відʼємний баланс → 0, перевиконання → `achieved`, `requiredMonthly` з округленням угору,
  `monthsLeft` не менше 1, `projectedMonth` за плановим внеском і за темпом, без темпу → `null`
- стани накопичення: achieved, no_deadline, overdue, on_track (pace рівно = required), behind
- `simulatePayoff`: один борг без відсотків; відсотки; лавина й сніжна куля дають різний порядок;
  звільнений мінімальний платіж переходить на наступний борг; борг без дострокового погашення
  не отримує додаткових грошей; платіж не покриває відсотки → не погашається; порожній список
- `requiredMonthly` для виходу з боргів: знайдений платіж закінчує план вчасно, на копійку менший — ні
- стани виходу з боргів: achieved, overdue, on_track, behind

API (Supertest):
- ціль накопичення: баланс рахунку на момент створення зараховано; поповнення створює переказ і збільшує прогрес;
  видаток з рахунку цілі зменшує прогрес
- другий активна ціль на тому самому рахунку → 409; після архівації першої — можна
- рахунок кредитки, архівний, не в UAH, чужий → 400/422/404
- ціль виходу з боргів: `startBalance` — сума залишків на момент створення; платіж по боргу збільшує прогрес;
  покупка з кредитки зменшує
- план погашення: значення за замовчуванням з цілі; параметри запиту їх перекривають; для savings → 422
- чужі цілі → 404; видалення цілі не чіпає рахунок, перекази й борги
- рахунок із ціллю не видаляється (409)

E2E (Playwright):
- створити ціль накопичення на рахунку → поповнити з іншого рахунку → прогрес і «зібрано» зросли;
- створити борг і ціль виходу з боргів → на сторінці плану змінити додатковий платіж →
  місяць виходу з боргів став ранішим.

## 8. Порядок реалізації

1. Чисті функції + unit-тести.
2. Міграція.
3. API цілей накопичення + API-тести.
4. API цілей виходу з боргів і плану погашення + API-тести.
5. UI: список → форма → поповнення → сторінка плану погашення.
6. E2E, оновлення docs/api.md і docs/domain.md.

Кожен крок — окремий коміт.

## 9. Поза межами цієї фічі
- кілька цілей на одному рахунку з розподілом балансу;
- автоматичні внески й нагадування;
- рядок «відкласти на цілі» в бюджеті та цілі в аналітиці;
- відсотки за депозитом у прогнозі накопичення;
- мультивалютні цілі;
- тексти порад щодо вибору стратегії.
