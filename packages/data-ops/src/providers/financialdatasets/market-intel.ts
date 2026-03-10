import { FinancialDatasetsClient } from './client';
import type {
	FDInsiderTrade,
	FDInstitutionalHolding,
	FDListResponse,
	FinancialDatasetsConfig,
} from './types';

export class MarketIntelProvider {
	private client: FinancialDatasetsClient;

	constructor(config: FinancialDatasetsConfig) {
		this.client = new FinancialDatasetsClient(config);
	}

	async fetchInsiderTrades(ticker: string, limit = 20): Promise<FDInsiderTrade[]> {
		const data = await this.client.request<FDListResponse<FDInsiderTrade>>('/insider-trades', {
			ticker,
			limit: String(limit),
		});
		return this.extractArray<FDInsiderTrade>(data, 'insider_trades');
	}

	async fetchInstitutionalHoldings(ticker: string, limit = 20): Promise<FDInstitutionalHolding[]> {
		const data = await this.client.request<FDListResponse<FDInstitutionalHolding>>(
			'/institutional-ownership',
			{ ticker, limit: String(limit) },
		);
		return this.extractArray<FDInstitutionalHolding>(data, 'institutional_ownership');
	}

	private extractArray<T>(data: FDListResponse<T>, key: string): T[] {
		const value = data[key];
		if (Array.isArray(value)) return value;
		for (const val of Object.values(data)) {
			if (Array.isArray(val)) return val as T[];
		}
		return [];
	}
}
