---
name: monthly-budget
description: Специфікація і порядок реалізації фічі місячного бюджету (заплановані доходи, ліміти витрат по категоріях, фактичні записи, підсвітка перевитрат і залишків). Використовуй для будь-якої задачі, що стосується бюджетів, лімітів, статусів категорій або екрана планування місяця.
---

# Місячний бюджет

Перед роботою прочитай CLAUDE.md (правила щодо грошей, дат і доступу до даних) і docs/domain.md.

## 1. Що робить фіча

Користувач на кожен місяць:
1. Планує доходи: перелік статей (зарплата, фріланс, інше) із запланованою сумою.
2. Планує витрати: ліміт на кожну категорію (продукти, транспорт, комунальні...).
3. Протягом місяця додає фактичні витрати до категорій і фактичні доходи до статей доходу,
   а також може зменшувати/видаляти записи доходів.
4. Бачить стан кожної категорії:
   - **червоний** — фактичні витрати перевищили ліміт (одразу, в будь-який момент періоду);
   - **зелений** — період завершився, і по категорії лишився залишок;
   - **нейтральний** — усі інші випадки.

## 2. Доменна модель

### Budget
- `id`, `householdId`, `periodStart` (перше число місяця, 00:00 у таймзоні household),
  `periodEnd` (перше число наступного місяця, виключно), `currency`,
  `status`: `draft | active | closed`, `createdAt`, `updatedAt`.
- Один бюджет на household на місяць (унікальний індекс `householdId + periodStart`).

### BudgetIncomeLine — запланована стаття доходу
- `id`, `budgetId`, `name`, `plannedAmount` (копійки, >= 0), `sortOrder`.

### BudgetExpenseLine — запланований ліміт по категорії
- `id`, `budgetId`, `categoryId`, `plannedAmount` (копійки, >= 0), `sortOrder`.
- Унікально `budgetId + categoryId`.

### Фактичні записи
Фактичні доходи й витрати — це звичайні `Transaction` (див. domain.md):
- витрата: `type = expense`, `categoryId`, `amount > 0`, `occurredAt` у межах періоду;
- дохід: `type = income`, `incomeLineId` (необовʼязково), `amount > 0`.

До бюджету транзакція належить за датою `occurredAt ∈ [periodStart, periodEnd)` і householdId,
а не через жорсткий звʼязок з budgetId. Так перенос дати транзакції автоматично переносить її в інший місяць.

«Забрати дохід» означає відредагувати суму запису або видалити його. Корекції зберігаються в історії змін
(`updatedAt`, за потреби — audit log). Відʼємні суми в транзакціях заборонені.

Перекази між рахунками (`type = transfer`) у розрахунках бюджету не враховуються.

## 3. Розрахунки (чисті функції в packages/shared/budget)

Усі суми — цілі числа в копійках.

Для кожної категорії витрат:
```
planned   = expenseLine.plannedAmount (0, якщо статті немає)
spent     = сума expense-транзакцій категорії за період
remaining = planned - spent          // може бути відʼємним
usage     = planned > 0 ? spent / planned : (spent > 0 ? ∞ : 0)
```

Статус категорії `getCategoryStatus(planned, spent, now, periodEnd)`:
```
if spent > planned                  → "over"     (червоний)
else if now >= periodEnd && spent < planned → "surplus"  (зелений)
else                                → "neutral"
```
Правила:
- `spent == planned` — це `neutral`, навіть після завершення періоду (рівно в межах).
- Витрати в категорії без запланованої статті вважаються з `planned = 0`, тому дають `over`.
  В UI такі категорії показуються окремим блоком «Незаплановані витрати».
- `now` порівнюється з `periodEnd` в UTC; `periodEnd` уже обчислений з таймзони household.
- Статус обчислює бекенд і повертає в API. Фронтенд колір не вираховує, а лише мапить статус на стиль.

Для доходів по кожній статті:
```
planned  = incomeLine.plannedAmount
received = сума income-транзакцій з цим incomeLineId за період
diff     = received - planned
```
Доходи без статті показуються як «Інші доходи».

Підсумок бюджету:
```
plannedIncomeTotal, receivedIncomeTotal,
plannedExpenseTotal, spentTotal,
plannedBalance = plannedIncomeTotal - plannedExpenseTotal
actualBalance  = receivedIncomeTotal - spentTotal
```
Якщо при плануванні `plannedExpenseTotal > plannedIncomeTotal`, показується попередження,
але збереження не блокується.

## 4. API

```
GET    /budgets?month=2026-10              → бюджет із розрахунками (або 404)
POST   /budgets                            { month, copyFrom?: "2026-09" } → створити (опційно скопіювати статті)
PATCH  /budgets/:id                        { status }
POST   /budgets/:id/income-lines           { name, plannedAmount }
PATCH  /budgets/:id/income-lines/:lineId
DELETE /budgets/:id/income-lines/:lineId   (транзакції лишаються, втрачають привʼязку → «Інші доходи»)
POST   /budgets/:id/expense-lines          { categoryId, plannedAmount }
PATCH  /budgets/:id/expense-lines/:lineId
DELETE /budgets/:id/expense-lines/:lineId
```
Фактичні записи додаються через наявні `/transactions` endpoints.

Приклад відповіді `GET /budgets?month=2026-10`:
```json
{
  "id": "...", "month": "2026-10", "status": "active", "currency": "UAH",
  "summary": { "plannedIncomeTotal": 6000000, "receivedIncomeTotal": 4500000,
               "plannedExpenseTotal": 5200000, "spentTotal": 3100000,
               "plannedBalance": 800000, "actualBalance": 1400000 },
  "incomeLines":  [{ "id": "...", "name": "Зарплата", "planned": 5000000, "received": 4500000, "diff": -500000 }],
  "expenseLines": [{ "id": "...", "categoryId": "...", "categoryName": "Продукти",
                     "planned": 1200000, "spent": 1350000, "remaining": -150000,
                     "usage": 1.125, "status": "over" }],
  "unplannedExpenses": [{ "categoryId": "...", "categoryName": "Подарунки", "spent": 80000, "status": "over" }],
  "otherIncome": 0
}
```

Правила:
- Кожен запит перевіряє, що бюджет належить household поточного користувача.
- Вхідні дані валідуються zod-схемами з packages/shared.
- Бюджет зі статусом `closed` доступний лише для читання (ліміти не змінюються). Транзакції заднім числом
  дозволені, і розрахунки перераховуються.

## 5. База даних (міграція)

```sql
CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  currency char(3) NOT NULL DEFAULT 'UAH',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, period_start),
  CHECK (period_end > period_start)
);

CREATE TABLE budget_income_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  name text NOT NULL,
  planned_amount bigint NOT NULL CHECK (planned_amount >= 0),
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE budget_expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  planned_amount bigint NOT NULL CHECK (planned_amount >= 0),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (budget_id, category_id)
);

-- у transactions: income_line_id uuid NULL REFERENCES budget_income_lines(id) ON DELETE SET NULL
-- індекс: transactions (household_id, occurred_at, type, category_id)
```
Агрегації `spent`/`received` робляться одним SQL-запитом з `GROUP BY`, а не циклом у коді.

## 6. UI (apps/web/src/features/budget)

Екран «Бюджет на місяць»:
- перемикач місяця (← жовтень 2026 →); якщо бюджету немає — кнопки «Створити» та «Скопіювати з попереднього»;
- картка підсумку: план/факт доходів, план/факт витрат, залишок;
- блок «Доходи»: статті з планом, фактом і різницею; кнопки «+ дохід», редагування й видалення записів;
- блок «Витрати»: рядок на категорію з прогрес-баром `spent / planned`, залишком і кнопкою «+ витрата»;
- блок «Незаплановані витрати» (якщо є).

Стилі статусів:
- `over` — червоний фон/бордер рядка + іконка ⚠ + текст «Перевищено на X ₴»;
- `surplus` — зелений + іконка ✓ + текст «Залишок X ₴»;
- `neutral` — звичайний вигляд.
Колір ніколи не є єдиним індикатором: завжди є іконка й текст (доступність).
Кольори беруться з токенів теми (`--status-over`, `--status-surplus`) з підтримкою темної теми.

Після додавання/редагування транзакції інвалідується запит бюджету (React Query), і статуси оновлюються.

## 7. Тести (обовʼязкові)

Unit (`getCategoryStatus`, розрахунки):
- spent < planned, період триває → neutral
- spent < planned, період завершився → surplus
- spent == planned, період завершився → neutral
- spent > planned на 1 копійку → over (і під час, і після періоду)
- planned = 0, spent > 0 → over; planned = 0, spent = 0 → neutral
- now рівно = periodEnd → період вважається завершеним
- перекази не впливають на spent
- підсумки й баланси на наборі фейкових даних

API (Supertest):
- чужий бюджет → 404/403
- дубль бюджету на той самий місяць → 409
- копіювання з попереднього місяця переносить статті, але не транзакції
- транзакція 31-го о 23:30 за Києвом потрапляє в цей місяць, а не в наступний
- видалення статті доходу переводить її транзакції в «Інші доходи»
- зміна закритого бюджету → 409/422

E2E (Playwright): створити бюджет → додати витрату понад ліміт → рядок червоний.

## 8. Порядок реалізації

1. Чисті функції розрахунків + unit-тести (packages/shared/budget).
2. Міграція.
3. Repo + service + routes + API-тести.
4. UI: підсумок → витрати зі статусами → доходи → копіювання місяця.
5. E2E-тест, оновлення docs/api.md і docs/domain.md.

Кожен крок — окремий коміт. Перед кроком 3 покажи план endpoint-ів і чекай погодження.

## 9. Поза межами цієї фічі (не реалізовувати без окремої задачі)
- перенесення залишку категорії на наступний місяць (rollover);
- попередження при наближенні до ліміту (наприклад, 80%);
- бюджети не на календарний місяць (з дня зарплати);
- мультивалютні бюджети.
