ALTER TABLE "categories" DROP CONSTRAINT "categories_household_id_kind_name_unique";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_kind_parent_name_unique" UNIQUE NULLS NOT DISTINCT("household_id","kind","parent_id","name");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_not_self" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id");