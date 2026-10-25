CREATE TABLE "menu_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"servings" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_entries_dish_unique" UNIQUE("household_id","date","meal_type_id","dish_id"),
	CONSTRAINT "menu_entries_servings_range" CHECK ("menu_entries"."servings" between 1 and 99)
);
--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_entries" ADD CONSTRAINT "menu_entries_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_entries_household_id_date_index" ON "menu_entries" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "menu_entries_dish_id_index" ON "menu_entries" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "menu_entries_meal_type_id_index" ON "menu_entries" USING btree ("meal_type_id");