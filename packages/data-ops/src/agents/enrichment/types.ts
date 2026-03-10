export interface FundamentalsContext {
	latestIncome?: Record<string, unknown>;
	latestBalanceSheet?: Record<string, unknown>;
	latestCashFlow?: Record<string, unknown>;
}

export interface MarketIntelligenceContext {
	recentInsiderTrades?: { name: string; type: string; shares: number; date: string }[];
	topInstitutionalHolders?: {
		name: string;
		shares: number;
		changePct: number;
	}[];
	analystPriceTargets?: { firm: string; target: number; rating: string; date: string }[];
	consensusTarget?: number;
	consensusRating?: string;
}

export interface EarningsContext {
	lastEarnings?: {
		period: string;
		epsActual: number;
		epsEstimate: number;
		surprisePct: number;
	};
	nextEarningsDate?: string;
	estimatedEps?: number;
	estimatedRevenue?: number;
}

export interface EnrichmentData {
	fundamentals?: FundamentalsContext;
	marketIntelligence?: MarketIntelligenceContext;
	earnings?: EarningsContext;
}
