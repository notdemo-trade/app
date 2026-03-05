import { env } from 'cloudflare:workers';
import {
	DeleteCredentialRequestSchema,
	deleteCredential,
	listCredentials,
	SaveCredentialRequestSchema,
	saveCredential,
	updateValidationStatus,
	validateCredentialByProvider,
} from '@repo/data-ops/credential';
import { createServerFn } from '@tanstack/react-start';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

export const listUserCredentials = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		return listCredentials(context.userId);
	});

export const saveUserCredential = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(SaveCredentialRequestSchema)
	.handler(async ({ data, context }) => {
		const { provider, data: credData, validate } = data;

		await saveCredential({
			userId: context.userId,
			provider,
			data: credData,
			masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
		});

		if (validate) {
			const result = await validateCredentialByProvider(provider, credData);
			await updateValidationStatus({
				userId: context.userId,
				provider,
				success: result.success,
				error: result.error,
			});
			return result;
		}

		return { success: true as const };
	});

export const deleteUserCredential = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(DeleteCredentialRequestSchema)
	.handler(async ({ data, context }) => {
		return deleteCredential({
			userId: context.userId,
			provider: data.provider,
		});
	});
