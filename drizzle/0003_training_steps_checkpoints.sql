ALTER TABLE "training_run" RENAME COLUMN "epochs" TO "maxSteps";--> statement-breakpoint
ALTER TABLE "training_run" RENAME COLUMN "epochHistoryJson" TO "stepHistoryJson";--> statement-breakpoint
ALTER TABLE "training_run" RENAME COLUMN "currentEpoch" TO "currentStep";--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "checkpointR2Key" text;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "checkpointStep" integer;--> statement-breakpoint
ALTER TABLE "training_run" ADD COLUMN "checkpointAt" timestamp;