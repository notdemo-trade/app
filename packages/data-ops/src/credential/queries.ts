import { and, eq } from 'drizzle-orm';
import { decryptCredential, encryptCredential } from '../crypto/credentials';
import { getDb } from '../database/setup';
import type { CredentialProvider } from './schema';
import { user_credentials } from './table';

interface SaveCredentialParams {
	userId: string;
	provider: CredentialProvider;
	data: Record<string, unknown>;
	masterKey: string;
}

export async function saveCredential(params: SaveCredentialParams): Promise<void> {
	const db = getDb();
	const encrypted = await encryptCredential(
		{ masterKey: params.masterKey, userId: params.userId },
		params.data,
	);

	const paperMode =
		params.provider === 'alpaca' ? ((params.data as { paper?: boolean }).paper ?? true) : null;

	await db
		.insert(user_credentials)
		.values({
			userId: params.userId,
			provider: params.provider,
			encryptedData: encrypted.ciphertext,
			iv: encrypted.iv,
			salt: encrypted.salt,
			paperMode,
		})
		.onConflictDoUpdate({
			target: [user_credentials.userId, user_credentials.provider],
			set: {
				encryptedData: encrypted.ciphertext,
				iv: encrypted.iv,
				salt: encrypted.salt,
				paperMode,
				validationError: null,
				lastValidatedAt: null,
				updatedAt: new Date(),
			},
		});
}

export async function getCredential<T>(params: {
	userId: string;
	provider: CredentialProvider;
	masterKey: string;
}): Promise<T | null> {
	const db = getDb();
	const [row] = await db
		.select()
		.from(user_credentials)
		.where(
			and(
				eq(user_credentials.userId, params.userId),
				eq(user_credentials.provider, params.provider),
			),
		)
		.limit(1);

	if (!row) return null;

	return decryptCredential<T>(
		{ masterKey: params.masterKey, userId: params.userId },
		{ ciphertext: row.encryptedData, iv: row.iv, salt: row.salt },
	);
}

export async function deleteCredential(params: {
	userId: string;
	provider: CredentialProvider;
}): Promise<boolean> {
	const db = getDb();
	const result = await db
		.delete(user_credentials)
		.where(
			and(
				eq(user_credentials.userId, params.userId),
				eq(user_credentials.provider, params.provider),
			),
		)
		.returning();

	return result.length > 0;
}

export async function listCredentials(userId: string) {
	const db = getDb();
	return db
		.select({
			provider: user_credentials.provider,
			paperMode: user_credentials.paperMode,
			lastValidatedAt: user_credentials.lastValidatedAt,
			validationError: user_credentials.validationError,
			createdAt: user_credentials.createdAt,
			updatedAt: user_credentials.updatedAt,
		})
		.from(user_credentials)
		.where(eq(user_credentials.userId, userId));
}

export async function updateValidationStatus(params: {
	userId: string;
	provider: CredentialProvider;
	success: boolean;
	error?: string;
}): Promise<void> {
	const db = getDb();
	await db
		.update(user_credentials)
		.set({
			lastValidatedAt: new Date(),
			validationError: params.success ? null : (params.error ?? 'Validation failed'),
		})
		.where(
			and(
				eq(user_credentials.userId, params.userId),
				eq(user_credentials.provider, params.provider),
			),
		);
}
