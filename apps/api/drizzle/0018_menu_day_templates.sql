CREATE TABLE "menu_day_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"meal_type_id" uuid NOT NULL,
	"dish_id" uuid,
	"servings" integer,
	"product_id" uuid,
	"quantity_milli" integer,
	CONSTRAINT "menu_day_template_items_dish_unique" UNIQUE("template_id","meal_type_id","dish_id"),
	CONSTRAINT "menu_day_template_items_product_unique" UNIQUE("template_id","meal_type_id","product_id"),
	CONSTRAINT "menu_day_template_items_servings_range" CHECK ("menu_day_template_items"."servings" between 1 and 99),
	CONSTRAINT "menu_day_template_items_quantity_range" CHECK ("menu_day_template_items"."quantity_milli" between 1 and 1000000000),
	CONSTRAINT "menu_day_template_items_kind" CHECK (("menu_day_template_items"."dish_id" IS NOT NULL AND "menu_day_template_items"."servings" IS NOT NULL AND "menu_day_template_items"."product_id" IS NULL AND "menu_day_template_items"."quantity_milli" IS NULL) OR ("menu_day_template_items"."dish_id" IS NULL AND "menu_day_template_items"."servings" IS NULL AND "menu_day_template_items"."product_id" IS NOT NULL AND "menu_day_template_items"."quantity_milli" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "menu_day_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_day_templates_household_name_unique" UNIQUE("household_id","name_key")
);
--> statement-breakpoint
ALTER TABLE "menu_day_template_items" ADD CONSTRAINT "menu_day_template_items_template_id_menu_day_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."menu_day_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_template_items" ADD CONSTRAINT "menu_day_template_items_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_template_items" ADD CONSTRAINT "menu_day_template_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_template_items" ADD CONSTRAINT "menu_day_template_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_templates" ADD CONSTRAINT "menu_day_templates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_day_template_items_template_id_index" ON "menu_day_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "menu_day_template_items_dish_id_index" ON "menu_day_template_items" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "menu_day_template_items_product_id_index" ON "menu_day_template_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "menu_day_template_items_meal_type_id_index" ON "menu_day_template_items" USING btree ("meal_type_id");