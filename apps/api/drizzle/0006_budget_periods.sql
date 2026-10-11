ALTER TABLE "budgets" DROP CONSTRAINT "budgets_status_valid";--> statement-breakpoint
DROP INDEX "transactions_household_id_occurred_at_type_category_id_index";--> statement-breakpoint
CREATE INDEX "transactions_household_id_type_occurred_at_category_id_index" ON "transactions" USING btree ("household_id","type","occurred_at","category_id");--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "status";