---
name: factory
description: Фабрика коду — проводить фічу через цикл spec → build → 4 рев'ю → approver → merge. Запускається лише командою /factory.
argument-hint: <фіча> | next | approve <job-id> | rework <job-id> <нотатка>
disable-model-invocation: true
---

# /factory — оркестратор

Сесія, що виконує цей скіл, — оркестратор. Вона веде цикл, запускає всіх агентів і **єдина пише
`factory/board.json`**. Код сама не пише: це робота агентів.

## Цикл (змінюєш тут — змінюється фабрика)

```
feature → spec-writer → builder ⇄ [security · ux · ui · code] → approver → merge │ needs-human
```

1. **Фіча.** Створи задачу (розділ «Нова задача»), stage `spec`.
2. **spec-writer** пише `spec.md`. Stage `build`.
3. **builder** (у worktree задачі) реалізує spec, комітить у `factory/<job-id>`, пише `build.md`.
   Stage `review`, `round` = 1.
4. **Рев'ю.** Запусти 4 рецензентів **паралельно, одним повідомленням**: `security-reviewer`,
   `ux-reviewer`, `ui-reviewer`, `code-reviewer`. Кожен пише свій файл у `round-<N>/`.
5. **WAIT FOR ALL.** Раунд завершено, лише коли в `round-<N>/` є всі 4 файли
   (`review-security.md`, `review-ux.md`, `review-ui.md`, `review-code.md`). Вердикт — перший
   рядок файлу. Після кожного вердикту онови чип у `board.json`. Не відновлюй builder посеред раунду.
6. Якщо хоч один `VERDICT: CHANGES`:
   - раундів доопрацювання вже було 2 (тобто N = 3) → stage `needs-human`,
     `note: "рев'ю не пройшли за 3 раунди"`, кінець;
   - інакше N += 1, **відновлюй того самого builder** через SendMessage (див. «Builder») з
     вказівкою на `round-<N-1>/`, потім знову крок 4.
7. Усі 4 `PASS` → stage `approval`, запусти **approver**. Він пише `decision.md`.
8. Перший рядок `decision.md`:
   - `APPROVE` → злий у main (розділ «Злиття»), stage `merged`;
   - `ESCALATE` → stage `needs-human`, у `note` — причина з `decision.md`.

## Команди

- `/factory <фіча>` — нова задача й повний цикл.
- `/factory next` — перший невідмічений пункт `- [ ]` із `factory/backlog.md` як фіча. Познач його
  `- [x]` з id задачі (`- [x] … → 004-csv-export`), коли задача потрапить у `merged`; якщо задача
  дійшла до `needs-human` — додай id, але лиши `- [ ]`, щоб її не взяли вдруге: `- [ ] … (004-…)`.
  Пункти з id у дужках `next` пропускає.
- `/factory approve <job-id>` — людина погодила задачу в `needs-human`: злий у main, stage
  `merged`, у `note` — «погоджено вручну».
- `/factory rework <job-id> <нотатка>` — запиши нотатку в `jobs/<job-id>/rework-<K>.md`
  (K — наступний номер), почни новий раунд N+1 із кроку 6 (відновлення builder з вказівкою на цей
  файл) і далі за циклом. Ліміт у 2 раунди доопрацювання на rework не поширюється: кожен rework
  дає ще один раунд.

## Нова задача

1. `id` = наступний трицифровий номер після найбільшого в `board.json` + коротка латинська назва:
   `004-csv-export`. Гілка `factory/<id>`.
2. Папка `factory/jobs/<id>/`, у ній `feature.md` — текст фічі дослівно, як дав користувач.
3. Worktree (з кореня репозиторію; `.env` не виводь на екран):
   ```bash
   WT="$(git rev-parse --show-toplevel)-factory/<id>"
   git worktree add "$WT" -b factory/<id> main
   cp apps/api/.env "$WT/apps/api/.env"
   (cd "$WT" && npm ci --no-audit --no-fund >/dev/null)
   ```
4. Додай задачу в `board.json` (формат нижче) зі stage `spec`.

Одна задача за раз: API-тести й e2e ділять одну тестову базу й порти 3100/5174. Поки фабрика
працює, не запускай тести в основній копії.

## Агенти

Агенти не бачать розмови — лише файли. У кожному запуску передай абсолютні шляхи:
`JOB` = `<корінь>/factory/jobs/<id>`, `WT` = worktree задачі, і номер раунду, якщо є.

| Агент             | Модель | Читає                                                 | Пише                     |
| ----------------- | ------ | ----------------------------------------------------- | ------------------------ |
| spec-writer       | opus   | `feature.md`, код у WT                                | `spec.md`                |
| builder           | opus   | `spec.md`, рев'ю раунду, `rework-*.md`                | код + коміти, `build.md` |
| security-reviewer | opus   | `spec.md`, `build.md`, diff                           | `round-N/review-security.md` |
| ux-reviewer       | sonnet | те саме                                               | `round-N/review-ux.md`   |
| ui-reviewer       | sonnet | те саме                                               | `round-N/review-ui.md`   |
| code-reviewer     | sonnet | те саме                                               | `round-N/review-code.md` |
| approver          | opus   | усе в JOB, diff                                       | `decision.md`            |

### Builder

- Перший запуск — з іменем `builder-<id>`. Якщо інструмент не приймає імені, збережи id агента
  в `board.json` (`builderAgent`).
- Кожен новий раунд — **SendMessage тому самому builder** (за іменем або `builderAgent`):
  «Раунд N: виправ зауваження з `JOB/round-<N-1>/` (і `JOB/rework-<K>.md`, якщо є), онови
  `build.md`, закоміть».
- Якщо продовжити builder неможливо (нова сесія), запусти нового `builder-<id>` і скажи прочитати
  `spec.md`, `build.md`, усі `round-*/` та `rework-*.md` — контекст є у файлах.

## Злиття

З основної копії, на `main`:

```bash
git switch main
git merge --no-ff factory/<id> -m "Merge factory/<id>: <назва>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git worktree remove "$(git rev-parse --show-toplevel)-factory/<id>"
git branch -d factory/<id>
```

Якщо `git merge` не вдався (конфлікт, незакомічені зміни в основній копії) — `git merge --abort`,
stage `needs-human`, причина в `note`. Не пушити: пуш робить людина.

Для `needs-human` worktree лишається, щоб людина могла подивитися й запустити застосунок.

## board.json

Пишеш тільки ти. Після кожного переходу онови `stage`, `updatedAt` і `files` (відносні шляхи
файлів задачі, які вже існують — їх показує дашборд).

```json
{
  "jobs": [
    {
      "id": "004-csv-export",
      "title": "Експорт витрат у CSV",
      "branch": "factory/004-csv-export",
      "stage": "review",
      "round": 2,
      "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS" },
      "rounds": [{ "round": 1, "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "CHANGES", "code": "PASS" } }],
      "decision": null,
      "note": "",
      "builderAgent": null,
      "files": ["feature.md", "spec.md", "build.md", "round-1/review-security.md"],
      "updatedAt": "2026-10-24T10:00:00Z"
    }
  ]
}
```

- `stage`: `spec` · `build` · `review` · `approval` · `merged` · `needs-human`.
- `reviews` — поточний раунд (`pending` · `PASS` · `CHANGES`). Коли раунд завершено (усі 4 файли
  є), допиши його в `rounds`; на початку нового раунду скинь `reviews` у `pending`.
- Якщо `board.json` немає (він не в git) — створи `{ "jobs": [] }`.
- `decision`: `null` · `APPROVE` · `ESCALATE`.

## Дашборд

```bash
cd factory && python3 -m http.server 8765   # http://localhost:8765/dashboard.html
```

Дашборд сам перечитує `board.json` кожні 2 секунди.

## Наприкінці

Коротко повідом людині: id задачі, фінальний stage, кількість раундів, і що робити далі
(`needs-human` → `/factory approve` або `/factory rework`). Нагадай, що злите не запушено.
