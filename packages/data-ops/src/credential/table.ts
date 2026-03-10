import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const credentialProviderEnum = pgEnum('credential_provider', [
	'alpaca',
	'openai',
	'anthropic',
	'google',
	'xai',
	'deepseek',
	'workers-ai',
	'telegram',
]);

export const user_credentials = pgTable(
	'user_credentials',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => auth_user.id, { onDelete: 'cascade' }),
		provider: credentialProviderEnum('provider').notNull(),
		encryptedData: text('encrypted_data').notNull(),
		paperMode: boolean('paper_mode'),
		iv: text('iv').notNull(),
		salt: text('salt').notNull(),
		lastValidatedAt: timestamp('last_validated_at'),
		validationError: text('validation_error'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		unique('uq_user_credentials_user_provider').on(table.userId, table.provider),
		index('idx_user_credentials_user_id').on(table.userId),
	],
);
