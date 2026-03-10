import { getLatestEarnings, getUpcomingEarnings } from '../../earnings/queries';
import { getLatestStatement } from '../../financial-statements/queries';
import {
	getRecentInsiderTrades,
	getRecentPriceTargets,
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
	const [insiderTrades, holdings, priceTargets] = await Promise.all([
		getRecentInsiderTrades(symbol, 10),
		getTopInstitutionalHoldings(symbol, 10),
		getRecentPriceTargets(symbol, 10),
	]);

	const context: MarketIntelligenceContext = {};

	if (insiderTrades.length > 0) {
		context.recentInsiderTrades = insiderTrades.map((t) => ({
			name: String(t.owner_name ?? ''),
			type: String(t.transaction_type ?? ''),
			shares: Number(t.shares_traded ?? 0),
			date: String(t.trade_date ?? ''),
		}));
	}

	if (holdings.length > 0) {
		context.topInstitutionalHolders = holdings.map((h) => ({
			name: String(h.investor_name ?? ''),
			shares: Number(h.shares ?? 0),
			changePct: Number(h.change_in_shares_pct ?? 0),
		}));
	}

	if (priceTargets.length > 0) {
		context.analystPriceTargets = priceTargets.map((pt) => ({
			firm: String(pt.analyst_company ?? ''),
			target: Number(pt.price_target ?? 0),
			rating: String(pt.rating ?? ''),
			date: String(pt.published_date ?? ''),
		}));

		// Compute consensus
		const targets = priceTargets.map((pt) => Number(pt.price_target ?? 0)).filter((t) => t > 0);
		if (targets.length > 0) {
			context.consensusTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
		}

		// Simple consensus rating
		const ratings = priceTargets.map((pt) => String(pt.rating ?? '').toLowerCase());
		const buyCount = ratings.filter((r) => r.includes('buy') || r.includes('outperform')).length;
		const sellCount = ratings.filter(
			(r) => r.includes('sell') || r.includes('underperform'),
		).length;
		if (buyCount > sellCount * 2) context.consensusRating = 'Buy';
		else if (sellCount > buyCount * 2) context.consensusRating = 'Sell';
		else context.consensusRating = 'Hold';
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
