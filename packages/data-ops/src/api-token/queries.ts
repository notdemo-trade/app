import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../database/setup';
import type { CreateTokenResponse, TokenResponse, TokenType } from './schema';
import { api_tokens } from './table';

const TOKEN_EXPIRATION_DAYS = 30;

async function hashToken(token: string): Promise<string> {
	const data = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function createApiToken(
	userId: string,
	type: TokenType,
): Promise<CreateTokenResponse> {
	const db = getDb();

	await db
		.update(api_tokens)
		.set({ revokedAt: new Date() })
		.where(
			and(eq(api_tokens.userId, userId), eq(api_tokens.type, type), isNull(api_tokens.revokedAt)),
		);

	const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
	const token = btoa(String.fromCharCode(...tokenBytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	const tokenHash = await hashToken(token);
	const tokenPrefix = token.slice(0, 8);
	const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

	const [result] = await db
		.insert(api_tokens)
		.values({ userId, type, tokenHash, tokenPrefix, expiresAt })
		.returning();

	if (!result) throw new Error('Failed to create token');

	return {
		id: result.id,
		token,
		tokenPrefix,
		type: result.type,
		expiresAt: result.expiresAt,
		lastUsedAt: result.lastUsedAt,
		createdAt: result.createdAt,
	};
}

interface ValidateTokenResult {
	userId: string;
	type: TokenType;
}

export async function validateApiToken(token: string): Promise<ValidateTokenResult | null> {
	const db = getDb();
	const tokenHash = await hashToken(token);

	const [result] = await db
		.select({
			userId: api_tokens.userId,
			id: api_tokens.id,
			type: api_tokens.type,
			expiresAt: api_tokens.expiresAt,
		})
		.from(api_tokens)
		.where(and(eq(api_tokens.tokenHash, tokenHash), isNull(api_tokens.revokedAt)))
		.limit(1);

	if (!result) return null;
	if (result.expiresAt < new Date()) return null;

	db.update(api_tokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(api_tokens.id, result.id))
		.execute();

	return { userId: result.userId, type: result.type };
}

export async function revokeApiToken(id: string, userId: string): Promise<boolean> {
	const db = getDb();

	const result = await db
		.update(api_tokens)
		.set({ revokedAt: new Date() })
		.where(and(eq(api_tokens.id, id), eq(api_tokens.userId, userId), isNull(api_tokens.revokedAt)))
		.returning();

	return result.length > 0;
}

export async function revokeApiTokenByType(userId: string, type: TokenType): Promise<boolean> {
	const db = getDb();

	const result = await db
		.update(api_tokens)
		.set({ revokedAt: new Date() })
		.where(
			and(eq(api_tokens.userId, userId), eq(api_tokens.type, type), isNull(api_tokens.revokedAt)),
		)
		.returning();

	return result.length > 0;
}

export async function listUserTokens(userId: string): Promise<TokenResponse[]> {
	const db = getDb();

	return db
		.select({
			id: api_tokens.id,
			type: api_tokens.type,
			tokenPrefix: api_tokens.tokenPrefix,
			expiresAt: api_tokens.expiresAt,
			lastUsedAt: api_tokens.lastUsedAt,
			createdAt: api_tokens.createdAt,
		})
		.from(api_tokens)
		.where(and(eq(api_tokens.userId, userId), isNull(api_tokens.revokedAt)))
		.orderBy(api_tokens.type);
}
