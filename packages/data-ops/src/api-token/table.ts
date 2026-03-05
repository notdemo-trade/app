import { isNull } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const tokenTypeEnum = pgEnum('token_type', ['access', 'kill_switch']);

export const api_tokens = pgTable(
	'api_tokens',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => auth_user.id, { onDelete: 'cascade' }),
		type: tokenTypeEnum('type').notNull(),
		tokenHash: text('token_hash').notNull(),
		tokenPrefix: text('token_prefix').notNull(),
		lastUsedAt: timestamp('last_used_at'),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		revokedAt: timestamp('revoked_at'),
	},
	(table) => [
		index('idx_api_tokens_user_id').on(table.userId),
		index('idx_api_tokens_token_hash').on(table.tokenHash),
		uniqueIndex('idx_api_tokens_unique_active')
			.on(table.userId, table.type)
			.where(isNull(table.revokedAt)),
	],
);
