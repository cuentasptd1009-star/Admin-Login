ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "banner" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "genre" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "year" integer;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series" (
"id" serial PRIMARY KEY NOT NULL,
"title" text NOT NULL,
"description" text,
"poster" text,
"banner" text,
"category" text,
"genre" text,
"year" integer,
"featured" boolean DEFAULT false NOT NULL,
"hidden" boolean DEFAULT false NOT NULL,
"order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
"id" serial PRIMARY KEY NOT NULL,
"series_id" integer NOT NULL,
"season_number" integer DEFAULT 1 NOT NULL,
"title" text,
"poster" text,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodes" (
"id" serial PRIMARY KEY NOT NULL,
"series_id" integer NOT NULL,
"season_id" integer NOT NULL,
"episode_number" integer DEFAULT 1 NOT NULL,
"title" text NOT NULL,
"description" text,
"file_path" text NOT NULL,
"thumbnail" text,
"duration" integer,
"order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_order" ON "series" USING btree ("order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_category" ON "series" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_title" ON "series" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seasons_series_id" ON "seasons" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episodes_season_id" ON "episodes" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episodes_series_id" ON "episodes" USING btree ("series_id");
