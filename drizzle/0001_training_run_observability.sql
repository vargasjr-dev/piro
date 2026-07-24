ALTER TABLE "training_run" ADD COLUMN "heartbeatAt" timestamp;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "timeoutAt" timestamp;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "runtimeMs" integer;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "costUsd" real;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "resourceType" text;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "gpuType" text;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "cpuCores" real;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "memoryMb" integer;