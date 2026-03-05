import { env } from 'cloudflare:workers';
import type { AlpacaCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import { ListOrdersRequestSchema, PortfolioHistoryRequestSchema } from '@repo/data-ops/portfolio';
import type { AlpacaTradingProvider } from '@repo/data-ops/providers/alpaca';
import {
	AlpacaApiError,
	AlpacaClient,
	createAlpacaTradingProvider,
} from '@repo/data-ops/providers/alpaca';
import { createServerFn } from '@tanstack/react-start';
import { AppError } from '@/core/errors';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

async function getProvider(userId: string): Promise<AlpacaTradingProvider | null> {
	const cred = await getCredential<AlpacaCredential>({
		userId,
		provider: 'alpaca',
		masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
	});

	if (!cred) return null;

	const client = new AlpacaClient({
		apiKey: cred.apiKey,
		apiSecret: cred.apiSecret,
		paper: cred.paper,
	});

	return createAlpacaTradingProvider(client);
}

function mapAlpacaError(e: unknown): AppError {
	if (e instanceof AppError) return e;
	if (e instanceof AlpacaApiError) {
		if (e.statusCode === 401) {
			return new AppError('Alpaca authentication failed. Check your API credentials.', 401);
		}
		if (e.statusCode === 403) {
			return new AppError('Alpaca access denied. Your account may be restricted.', 403);
		}
		return new AppError(`Alpaca API error: ${e.body}`, 502);
	}
	return new AppError(e instanceof Error ? e.message : 'Unknown error', 500);
}

export const getAccount = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		try {
			const provider = await getProvider(context.userId);
			if (!provider) return null;
			return provider.getAccount();
		} catch (e) {
			throw mapAlpacaError(e);
		}
	});

export const getPositions = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		try {
			const provider = await getProvider(context.userId);
			if (!provider) return null;
			return provider.getPositions();
		} catch (e) {
			throw mapAlpacaError(e);
		}
	});

export const getOrders = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(ListOrdersRequestSchema)
	.handler(async ({ data, context }) => {
		try {
			const provider = await getProvider(context.userId);
			if (!provider) return null;
			return provider.listOrders(data);
		} catch (e) {
			throw mapAlpacaError(e);
		}
	});

export const getClock = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		try {
			const provider = await getProvider(context.userId);
			if (!provider) return null;
			return provider.getClock();
		} catch (e) {
			throw mapAlpacaError(e);
		}
	});

export const getPortfolioHistory = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(PortfolioHistoryRequestSchema)
	.handler(async ({ data, context }) => {
		try {
			const provider = await getProvider(context.userId);
			if (!provider) return null;
			return provider.getPortfolioHistory(data);
		} catch (e) {
			throw mapAlpacaError(e);
		}
	});
