-- Статті доходу бюджету замінено джерелами доходу й надходженнями (income_sources,
-- income_occurrences). Транзакції доходів лишаються; зникає лише їхня прив'язка до статей.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_income_line_only_for_income";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_income_line_id_budget_income_lines_id_fk";--> statement-breakpoint
DROP INDEX "transactions_income_line_id_index";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "income_line_id";--> statement-breakpoint
DROP TABLE "budget_income_lines";
