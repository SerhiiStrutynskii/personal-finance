ALTER TYPE "public"."account_type" ADD VALUE 'credit_card';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'debt_payment';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'balance_adjustment';--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_amount_positive";--> statement-breakpoint
DROP INDEX "transactions_account_id_index";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_account_id_occurred_at_index" ON "transactions" USING btree ("account_id","occurred_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_limit_valid" CHECK ((("accounts"."type")::text = 'credit_card') = ("accounts"."credit_limit" IS NOT NULL)
        AND ("accounts"."credit_limit" IS NULL OR "accounts"."credit_limit" > 0));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_valid" CHECK ("transactions"."amount_minor" > 0 OR (("transactions"."type")::text = 'balance_adjustment' AND "transactions"."amount_minor" <> 0));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_adjustment_shape" CHECK (("transactions"."type")::text <> 'balance_adjustment' OR "transactions"."category_id" IS NULL);