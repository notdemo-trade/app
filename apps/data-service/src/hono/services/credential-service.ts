import type { CredentialProvider } from '@repo/data-ops/credential';
import {
	deleteCredential,
	getCredential,
	listCredentials,
	saveCredential,
	updateValidationStatus,
	validateCredentialByProvider,
} from '@repo/data-ops/credential';
import type { Result } from '../types/result';
import { AppError, err, ok } from '../types/result';

interface SaveParams {
	userId: string;
	provider: CredentialProvider;
	data: Record<string, unknown>;
	validate: boolean;
	encryptionKey: string;
}

interface ValidationResponse {
	success: boolean;
	error?: string;
}

export async function listUserCredentials(
	userId: string,
): Promise<Result<Awaited<ReturnType<typeof listCredentials>>>> {
	const list = await listCredentials(userId);
	return ok(list);
}

export async function saveUserCredential(params: SaveParams): Promise<Result<ValidationResponse>> {
	await saveCredential({
		userId: params.userId,
		provider: params.provider,
		data: params.data,
		masterKey: params.encryptionKey,
	});

	if (params.validate) {
		const result = await validateCredentialByProvider(params.provider, params.data);
		await updateValidationStatus({
			userId: params.userId,
			provider: params.provider,
			success: result.success,
			error: result.error,
		});
		return ok(result);
	}

	return ok({ success: true });
}

export async function deleteUserCredential(params: {
	userId: string;
	provider: CredentialProvider;
}): Promise<Result<boolean>> {
	const deleted = await deleteCredential(params);
	if (!deleted) {
		return err(new AppError('Credential not found', 404, 'CREDENTIAL_NOT_FOUND'));
	}
	return ok(true);
}

export async function validateExistingCredential(params: {
	userId: string;
	provider: CredentialProvider;
	encryptionKey: string;
}): Promise<Result<ValidationResponse>> {
	const data = await getCredential<Record<string, unknown>>({
		userId: params.userId,
		provider: params.provider,
		masterKey: params.encryptionKey,
	});

	if (!data) {
		return err(new AppError('No credential found', 404, 'CREDENTIAL_NOT_FOUND'));
	}

	const result = await validateCredentialByProvider(params.provider, data);
	await updateValidationStatus({
		userId: params.userId,
		provider: params.provider,
		success: result.success,
		error: result.error,
	});

	return ok(result);
}
