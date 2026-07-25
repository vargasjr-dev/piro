CREATE TABLE "deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"modelId" text NOT NULL,
	"createdByUserId" text NOT NULL,
	"isAdmin" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_modelId_model_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_createdByUserId_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_creator_enabled" ON "deployment" USING btree ("createdByUserId","enabled");--> statement-breakpoint
CREATE INDEX "deployment_admin_enabled" ON "deployment" USING btree ("isAdmin","enabled");