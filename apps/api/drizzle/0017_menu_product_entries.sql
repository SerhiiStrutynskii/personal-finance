ALTER TABLE "menu_entries" ALTER COLUMN "dish_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_entries" ALTER COLUMN "servings" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_entries" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_entries" ADD COLUMN "quantity_milli" integer;--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_entries_product_id_index" ON "menu_entries" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_product_unique" UNIQUE("household_id","date","meal_type_id","product_id");--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_quantity_range" CHECK ("menu_entries"."quantity_milli" between 1 and 1000000000);--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_kind" CHECK (("menu_entries"."dish_id" IS NOT NULL AND "menu_entries"."servings" IS NOT NULL AND "menu_entries"."product_id" IS NULL AND "menu_entries"."quantity_milli" IS NULL) OR ("menu_entries"."dish_id" IS NULL AND "menu_entries"."servings" IS NULL AND "menu_entries"."product_id" IS NOT NULL AND "menu_entries"."quantity_milli" IS NOT NULL));