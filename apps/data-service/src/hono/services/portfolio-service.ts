import type { AlpacaCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import type {
	Account,
	AlpacaTradingProvider,
	MarketClock,
	Order,
	PortfolioHistory,
	Position,
} from '@repo/data-ops/providers/alpaca';
import {
	AlpacaApiError,
	AlpacaClient,
	createAlpacaTradingProvider,
} from '@repo/data-ops/providers/alpaca';
import type { Result } from '../types/result';
import { AppError, err, ok } from '../types/result';

interface PortfolioServiceContext {
	userId: string;
	masterKey: string;
}

async function getAlpacaProvider(
	ctx: PortfolioServiceContext,
): Promise<Result<AlpacaTradingProvider>> {
	const cred = await getCredential<AlpacaCredential>({
		userId: ctx.userId,
		provider: 'alpaca',
		masterKey: ctx.masterKey,
	});

	if (!cred) {
		return err(
			new AppError('Alpaca credentials not configured. Add credentials in Settings.', 400),
		);
	}

	const client = new AlpacaClient({
		apiKey: cred.apiKey,
		apiSecret: cred.apiSecret,
		paper: cred.paper,
	});

	return ok(createAlpacaTradingProvider(client));
}

function handleAlpacaError(e: unknown): AppError {
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

export async function getAccount(ctx: PortfolioServiceContext): Promise<Result<Account>> {
	const providerResult = await getAlpacaProvider(ctx);
	if (!providerResult.ok) return providerResult;
	try {
		return ok(await providerResult.data.getAccount());
	} catch (e) {
		return err(handleAlpacaError(e));
	}
}

export async function getPositions(ctx: PortfolioServiceContext): Promise<Result<Position[]>> {
	const providerResult = await getAlpacaProvider(ctx);
	if (!providerResult.ok) return providerResult;
	try {
		return ok(await providerResult.data.getPositions());
	} catch (e) {
		return err(handleAlpacaError(e));
	}
}

export async function getOrders(
	ctx: PortfolioServiceContext,
	params: { status?: 'open' | 'closed' | 'all'; limit?: number },
): Promise<Result<Order[]>> {
	const providerResult = await getAlpacaProvider(ctx);
	if (!providerResult.ok) return providerResult;
	try {
		return ok(await providerResult.data.listOrders(params));
	} catch (e) {
		return err(handleAlpacaError(e));
	}
}

export async function getClock(ctx: PortfolioServiceContext): Promise<Result<MarketClock>> {
	const providerResult = await getAlpacaProvider(ctx);
	if (!providerResult.ok) return providerResult;
	try {
		return ok(await providerResult.data.getClock());
	} catch (e) {
		return err(handleAlpacaError(e));
	}
}

export async function getPortfolioHistory(
	ctx: PortfolioServiceContext,
	params: {
		period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all';
		timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D';
	},
): Promise<Result<PortfolioHistory>> {
	const providerResult = await getAlpacaProvider(ctx);
	if (!providerResult.ok) return providerResult;
	try {
		return ok(await providerResult.data.getPortfolioHistory(params));
	} catch (e) {
		return err(handleAlpacaError(e));
	}
}
