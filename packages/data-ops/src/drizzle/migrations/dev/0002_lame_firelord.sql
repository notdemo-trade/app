CREATE INDEX "idx_api_tokens_user_id" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_api_tokens_token_hash" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_tokens_unique_active" ON "api_tokens" USING btree ("user_id","type") WHERE "api_tokens"."revoked_at" is null;