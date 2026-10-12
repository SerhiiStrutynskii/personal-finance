---
name: incomes
description: Специфікація і порядок реалізації фічі доходів (періодичні та разові доходи, заплановані й фактичні дата та сума, статус отримання, підсумки за період). Використовуй для будь-якої задачі про доходи, джерела доходу, графік надходжень або індикатор отримання.
---

# Доходи

Перед роботою прочитай CLAUDE.md (правила щодо грошей, дат і доступу до даних) і docs/domain.md.
Фіча повʼязана зі скілом `monthly-budget`: блок «Доходи» в бюджеті будується з даних цієї фічі.

## 1. Що робить фіча

Є два види доходів:

1. **Періодичний** (зарплата, оренда, пенсія, аванс). Користувач задає джерело з правилом повторення.
   Для кожного очікуваного надходження є:
   - запланована дата і запланована сума;
   - фактична дата і фактична сума (заповнюються, коли гроші прийшли).
2. **Разовий** (бонус, продаж речі, подарунок, повернення боргу). Користувач вказує дату надходження і суму.
   Разовий дохід одразу вважається отриманим.

Для кожного надходження показується індикатор, чи отримано дохід. За будь-який період (типово місяць)
показується: скільки заплановано, скільки фактично отримано і які надходження ще очікуються або прострочені.

## 2. Доменна модель

### IncomeSource — джерело періодичного доходу
- `id`, `householdId`, `name`, `accountId` (куди зазвичай надходить), `currency`.
- `plannedAmount` (копійки, > 0) — типова сума одного надходження.
- Правило повторення:
  - `frequency`: `monthly | weekly | biweekly | every_n_months`;
  - `dayOfMonth` (1–31) для `monthly` / `every_n_months`; якщо в місяці менше днів — останній день місяця;
  - `dayOfWeek` (1–7, пн=1) для `weekly` / `biweekly`;
  - `intervalMonths` для `every_n_months`;
  - `startDate` (обовʼязково), `endDate` (необовʼязково, включно).
- `isActive` — деактивоване джерело не генерує нових надходжень, але історія зберігається.

Кілька надходжень на місяць (аванс 15-го + зарплата 30-го) — це два окремі джерела.

### IncomeOccurrence — одне очікуване надходження періодичного доходу
- `id`, `sourceId`, `householdId`.
- `plannedDate` (date, у таймзоні household), `plannedAmount` (копійки).
- `status`: `expected | skipped` — збережений стан; `skipped` означає, що користувач позначив,
  що цього разу доходу не буде.
- Унікально `sourceId + plannedDate`.
- Фактичні дані **не зберігаються в цій таблиці**. Вони обчислюються з транзакцій, привʼязаних до надходження:
  - `actualAmount` = сума `income`-транзакцій з `occurrenceId = id`;
  - `actualDate` = дата останньої такої транзакції;
  - так підтримуються часткові виплати (дохід прийшов двома платежами).

`plannedDate` і `plannedAmount` можна змінити для одного надходження (наприклад, зарплату перенесли),
не змінюючи джерело.

### Разовий дохід
Звичайна `Transaction` з `type = income`, `occurrenceId = NULL`, датою `occurredAt` і сумою `amount`.
Окремої таблиці немає. Опційно — `categoryId` для групування (бонус, продаж, подарунок).

### Фактичний дохід
Будь-яке фактичне надходження — це `Transaction` (`type = income`, `amount > 0`).
Відʼємних сум немає: виправлення робиться редагуванням або видаленням транзакції.

## 3. Генерація надходжень

Чиста функція `generateOccurrenceDates(source, from, to): Date[]` у `packages/shared/incomes`.

- Надходження створюються ліниво: при запиті періоду бекенд виконує idempotent upsert
  для всіх активних джерел, у яких `[startDate, endDate]` перетинається з періодом
  (`INSERT ... ON CONFLICT (source_id, planned_date) DO NOTHING`).
- Генерація не йде далі ніж на 12 місяців уперед.
- Зміна джерела (сума, день, частота) впливає лише на **майбутні неотримані** надходження:
  існуючі `expected` без транзакцій і з `plannedDate >= today` перегенеровуються.
  Отримані та минулі надходження не змінюються.
- Деактивація джерела видаляє майбутні надходження без транзакцій. Історія лишається.
- Видалення джерела дозволене лише якщо немає жодної привʼязаної транзакції; інакше — тільки деактивація.

## 4. Статус отримання (індикатор)

Функція `getOccurrenceStatus(occurrence, actualAmount, today)`:
```
if occurrence.status == "skipped"           → "skipped"   (сірий, «Не очікується»)
else if actualAmount >= plannedAmount       → "received"  (зелений ✓, «Отримано»)
else if actualAmount > 0                    → "partial"   (жовтий ◐, «Отримано частково: X з Y»)
else if today > plannedDate                 → "overdue"   (червоний !, «Не надійшло, очікувалось DD.MM»)
else                                        → "pending"   (нейтральний ○, «Очікується DD.MM»)
```
Правила:
- `today` — поточна дата в таймзоні household; у день `plannedDate` статус ще `pending`.
- Отримано більше за план → `received`, різниця `actualAmount - plannedAmount` показується як «+X ₴».
- Разовий дохід завжди має статус `received`.
- Статус обчислює бекенд і повертає в API. Фронтенд мапить статус на стиль.

## 5. Підсумок за період

Для періоду `[from, to)` (типово календарний місяць у таймзоні household):
```
plannedTotal       = сума plannedAmount надходжень з plannedDate у періоді, крім skipped
receivedTotal      = сума всіх income-транзакцій з occurredAt у періоді (періодичні + разові)
receivedRecurring  = частина receivedTotal, привʼязана до надходжень
oneTimeTotal       = частина receivedTotal без occurrenceId
expectedRemaining  = сума (plannedAmount - actualAmount) для pending/partial/overdue, не менше 0
counts             = { received, partial, pending, overdue, skipped }
```
Надходження належить до періоду за `plannedDate`. Транзакція — за `occurredAt`.
Якщо зарплата за жовтень прийшла 1 листопада, у жовтні надходження буде `received` (транзакція привʼязана),
а в `receivedTotal` гроші потраплять у листопад. Це очікувана поведінка, і її варто показати підказкою в UI.

Звʼязок з бюджетом: у `monthly-budget` запланований дохід місяця = `plannedTotal`,
фактичний = `receivedTotal`. Окремі статті доходу в бюджеті (`BudgetIncomeLine`) не потрібні.

## 6. API

```
GET    /income-sources                         → список джерел
POST   /income-sources                         { name, accountId, plannedAmount, frequency, dayOfMonth?, dayOfWeek?, intervalMonths?, startDate, endDate? }
PATCH  /income-sources/:id                     (перегенерація майбутніх надходжень)
POST   /income-sources/:id/deactivate
DELETE /income-sources/:id                     (409, якщо є транзакції)

GET    /incomes?month=2026-10                  → підсумок + надходження + разові доходи за період
PATCH  /income-occurrences/:id                 { plannedDate?, plannedAmount?, status?: "expected" | "skipped" }
POST   /income-occurrences/:id/receive         { amount, date, accountId? } → створює привʼязану income-транзакцію
                                                (дефолт: amount = plannedAmount, date = сьогодні)

POST   /incomes/one-time                       { amount, date, accountId, name, categoryId? } → income-транзакція
```
Редагування й видалення фактичних записів — через наявні `/transactions/:id`.

Приклад відповіді `GET /incomes?month=2026-10`:
```json
{
  "month": "2026-10", "currency": "UAH",
  "summary": { "plannedTotal": 6000000, "receivedTotal": 5250000, "receivedRecurring": 4500000,
               "oneTimeTotal": 750000, "expectedRemaining": 1500000,
               "counts": { "received": 1, "partial": 0, "pending": 1, "overdue": 0, "skipped": 0 } },
  "occurrences": [
    { "id": "...", "sourceId": "...", "name": "Аванс", "plannedDate": "2026-10-15", "plannedAmount": 1500000,
      "actualDate": null, "actualAmount": 0, "status": "pending" },
    { "id": "...", "sourceId": "...", "name": "Зарплата", "plannedDate": "2026-10-05", "plannedAmount": 4500000,
      "actualDate": "2026-10-05", "actualAmount": 4500000, "status": "received", "diff": 0 }
  ],
  "oneTime": [
    { "transactionId": "...", "name": "Продаж велосипеда", "date": "2026-10-09", "amount": 750000, "status": "received" }
  ]
}
```

Правила:
- Кожен запит перевіряє, що дані належать household поточного користувача.
- Вхідні дані валідуються zod-схемами з packages/shared.
- `receive` для `skipped` надходження автоматично повертає його в `expected`.

## 7. База даних (міграція)

```sql
CREATE TABLE income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id),
  name text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'UAH',
  planned_amount bigint NOT NULL CHECK (planned_amount > 0),
  frequency text NOT NULL CHECK (frequency IN ('monthly','weekly','biweekly','every_n_months')),
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week smallint CHECK (day_of_week BETWEEN 1 AND 7),
  interval_months smallint CHECK (interval_months >= 1),
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE income_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  planned_amount bigint NOT NULL CHECK (planned_amount > 0),
  status text NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','skipped')),
  UNIQUE (source_id, planned_date)
);
CREATE INDEX ON income_occurrences (household_id, planned_date);

-- у transactions: occurrence_id uuid NULL REFERENCES income_occurrences(id) ON DELETE SET NULL
-- CHECK: occurrence_id IS NULL OR type = 'income'
```
Комбінацію полів правила (наприклад, `monthly` вимагає `day_of_month`) перевіряє zod-схема і CHECK-констрейнт.
`actualAmount` / `actualDate` обчислюються одним запитом з `LEFT JOIN transactions ... GROUP BY occurrence_id`.

## 8. UI (apps/web/src/features/incomes)

Екран «Доходи»:
- перемикач місяця;
- картка підсумку: заплановано / отримано / ще очікується, прогрес-бар отримано від плану;
- список «Регулярні надходження» за датою: назва, запланована дата і сума, фактична дата і сума, індикатор статусу;
  дії: «Отримано» (форма з передзаповненими сумою та датою), «Змінити цього разу», «Пропустити»;
- список «Разові доходи»: назва, дата, сума; кнопка «+ разовий дохід»;
- розділ «Джерела доходу» (окрема вкладка або сторінка): створення/редагування правила повторення
  з превʼю найближчих 3 дат.

Стилі статусів: `received` — зелений, `partial` — жовтий, `overdue` — червоний, `pending` — нейтральний,
`skipped` — сірий, перекреслена сума. Колір ніколи не є єдиним індикатором: завжди є іконка й текст.
Кольори з токенів теми з підтримкою темної теми.

Після будь-якої зміни інвалідуються запити доходів і бюджету (React Query).

## 9. Тести (обовʼязкові)

Unit (`generateOccurrenceDates`):
- monthly 31-го → 30 вересня, 31 жовтня, 28/29 лютого
- weekly і biweekly від startDate, з урахуванням endDate включно
- every_n_months з інтервалом 3
- джерело починається / закінчується посеред періоду

Unit (`getOccurrenceStatus`):
- skipped; received рівно; received з переплатою; partial; overdue (наступного дня після planned);
  pending у день plannedDate

API (Supertest):
- повторний запит місяця не дублює надходження
- зміна суми джерела змінює майбутні, але не отримані й не минулі надходження
- receive двома частинами → partial → received
- видалення джерела з транзакціями → 409
- чужі джерела/надходження → 404
- транзакція 31-го о 23:30 за Києвом рахується в цьому місяці

E2E (Playwright): створити джерело «Зарплата» 5-го → у місяці зʼявилось `pending` →
натиснути «Отримано» → статус `received`, підсумок оновився.

## 10. Порядок реалізації

1. Чисті функції `generateOccurrenceDates`, `getOccurrenceStatus`, підсумок + unit-тести.
2. Міграція.
3. Джерела: repo + service + routes + API-тести.
4. Надходження: лінива генерація, receive, skip, override + API-тести.
5. Разові доходи.
6. UI: підсумок → регулярні надходження → разові → джерела.
7. Інтеграція з бюджетом (див. `monthly-budget`), E2E, оновлення docs/api.md і docs/domain.md.

Кожен крок — окремий коміт. Перед кроком 3 покажи план endpoint-ів і чекай погодження.

## 11. Поза межами цієї фічі
- перенесення дати з вихідних на робочий день;
- нагадування/сповіщення про прострочений дохід;
- автоматичне зіставлення імпортованих банківських транзакцій з надходженнями;
- мультивалютні доходи.
