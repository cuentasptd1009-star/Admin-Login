ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "video_format" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "video_format" text;
