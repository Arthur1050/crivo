CREATE TYPE "public"."agent_phase" AS ENUM('qualificando', 'agendando', 'encerrada');

CREATE TABLE "lead_agent_state" (
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"anchor_message_id" uuid NOT NULL,
	"phase" "agent_phase",
	"asked_fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"opening_history" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reset_observed_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_agent_state_tenant_id_lead_id_pk" PRIMARY KEY("tenant_id","lead_id"),
	CONSTRAINT "lead_agent_state_positive_revision" CHECK ("lead_agent_state"."revision" > 0),
	CONSTRAINT "lead_agent_state_asked_fields" CHECK (cardinality("lead_agent_state"."asked_fields") <= 8 and "lead_agent_state"."asked_fields" <@ ARRAY['modality', 'region', 'propertyType', 'budgetCents', 'purchaseHorizon', 'motivation', 'creditStatus', 'chainedOperation']::text[])
);


CREATE UNIQUE INDEX "leads_tenant_id_id_idx" ON "leads" USING btree ("tenant_id","id");

CREATE UNIQUE INDEX "messages_tenant_id_id_idx" ON "messages" USING btree ("tenant_id","id");

ALTER TABLE "lead_agent_state" ADD CONSTRAINT "lead_agent_state_tenant_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lead_agent_state" ADD CONSTRAINT "lead_agent_state_tenant_anchor_fk" FOREIGN KEY ("tenant_id","anchor_message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
