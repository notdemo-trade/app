import type { CreateTokenResponse, TokenResponse, TokenType } from '@repo/data-ops/api-token';
import { createApiToken, listUserTokens, revokeApiToken } from '@repo/data-ops/api-token';
import type { Result } from '../types/result';
import { AppError, err, ok } from '../types/result';

export async function listTokens(userId: string): Promise<Result<TokenResponse[]>> {
	const tokens = await listUserTokens(userId);
	return ok(tokens);
}

export async function createToken(
	userId: string,
	type: TokenType,
): Promise<Result<CreateTokenResponse>> {
	const token = await createApiToken(userId, type);
	return ok(token);
}

export async function revokeToken(tokenId: string, userId: string): Promise<Result<boolean>> {
	const revoked = await revokeApiToken(tokenId, userId);
	if (!revoked) {
		return err(new AppError('Token not found or already revoked', 404, 'TOKEN_NOT_FOUND'));
	}
	return ok(true);
}
