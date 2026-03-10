import { getLatestEarnings, getUpcomingEarnings } from '../../earnings/queries';
import { getLatestStatement } from '../../financial-statements/queries';
import {
	getRecentInsiderTrades,
	getTopInstitutionalHoldings,
} from '../../market-intelligence/queries';
import type {
	EarningsContext,
	EnrichmentData,
	FundamentalsContext,
	MarketIntelligenceContext,
} from './types';

export async function getFundamentalsContext(symbol: string): Promise<FundamentalsContext> {
	const [income, balanceSheet, cashFlow] = await Promise.all([
		getLatestStatement(symbol, 'income'),
		getLatestStatement(symbol, 'balance_sheet'),
		getLatestStatement(symbol, 'cash_flow'),
	]);

	return {
		latestIncome: income ?? undefined,
		latestBalanceSheet: balanceSheet ?? undefined,
		latestCashFlow: cashFlow ?? undefined,
	};
}

export async function getMarketIntelligenceContext(
	symbol: string,
): Promise<MarketIntelligenceContext> {
	const [insiderTrades, holdings] = await Promise.all([
		getRecentInsiderTrades(symbol, 10),
		getTopInstitutionalHoldings(symbol, 10),
	]);

	const context: MarketIntelligenceContext = {};

	if (insiderTrades.length > 0) {
		context.recentInsiderTrades = insiderTrades.map((t) => ({
			name: String(t.name ?? ''),
			type: String(t.title ?? ''),
			shares: Number(t.transaction_shares ?? 0),
			date: String(t.transaction_date ?? ''),
		}));
	}

	if (holdings.length > 0) {
		context.topInstitutionalHolders = holdings.map((h) => ({
			name: String(h.investor ?? ''),
			shares: Number(h.shares ?? 0),
			changePct: 0,
		}));
	}

	return context;
}

export async function getEarningsContext(symbol: string): Promise<EarningsContext> {
	const [latest, upcoming] = await Promise.all([
		getLatestEarnings(symbol),
		getUpcomingEarnings(symbol),
	]);

	const context: EarningsContext = {};

	if (latest && latest.epsActual !== null && latest.epsEstimate !== null) {
		context.lastEarnings = {
			period: latest.fiscalPeriod,
			epsActual: latest.epsActual,
			epsEstimate: latest.epsEstimate,
			surprisePct: latest.surprisePct ?? 0,
		};
	}

	if (upcoming) {
		context.nextEarningsDate = upcoming.reportDate.toISOString().split('T')[0];
		context.estimatedEps = upcoming.epsEstimate ?? undefined;
		context.estimatedRevenue = upcoming.revenueEstimate ?? undefined;
	}

	return context;
}

export async function getEnrichmentForSymbol(symbol: string): Promise<EnrichmentData> {
	const [fundamentals, marketIntelligence, earningsCtx] = await Promise.all([
		getFundamentalsContext(symbol),
		getMarketIntelligenceContext(symbol),
		getEarningsContext(symbol),
	]);

	return {
		fundamentals,
		marketIntelligence,
		earnings: earningsCtx,
	};
}
