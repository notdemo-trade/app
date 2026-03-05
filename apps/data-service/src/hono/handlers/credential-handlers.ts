import { zValidator } from '@hono/zod-validator';
import type { CredentialProvider } from '@repo/data-ops/credential';
import {
	DeleteCredentialRequestSchema,
	SaveCredentialRequestSchema,
} from '@repo/data-ops/credential';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import {
	deleteUserCredential,
	listUserCredentials,
	saveUserCredential,
	validateExistingCredential,
} from '../services/credential-service';
import { AppError } from '../types/result';
import { resultToResponse } from '../utils/result-to-response';

const VALID_PROVIDERS = new Set<string>([
	'alpaca',
	'openai',
	'anthropic',
	'google',
	'xai',
	'deepseek',
]);

const credentials = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

credentials.use('*', sessionAuthMiddleware);

credentials.get('/', async (c) => {
	const userId = c.get('userId');
	const result = await listUserCredentials(userId);
	return resultToResponse(c, result);
});

credentials.put('/', zValidator('json', SaveCredentialRequestSchema), async (c) => {
	const userId = c.get('userId');
	const body = c.req.valid('json');
	const result = await saveUserCredential({
		userId,
		provider: body.provider,
		data: body.data,
		validate: body.validate,
		encryptionKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
	});
	return resultToResponse(c, result);
});

credentials.delete('/', zValidator('json', DeleteCredentialRequestSchema), async (c) => {
	const userId = c.get('userId');
	const { provider } = c.req.valid('json');
	const result = await deleteUserCredential({ userId, provider });
	if (result.ok) {
		return c.json({ deleted: true });
	}
	return resultToResponse(c, result);
});

credentials.post('/:provider/validate', async (c) => {
	const userId = c.get('userId');
	const provider = c.req.param('provider');
	if (!VALID_PROVIDERS.has(provider)) {
		throw new AppError('Invalid provider', 400, 'INVALID_PROVIDER');
	}
	const result = await validateExistingCredential({
		userId,
		provider: provider as CredentialProvider,
		encryptionKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
	});
	return resultToResponse(c, result);
});

export default credentials;
