import { FinancialDatasetsClient } from './client';
import type { FDEarnings, FDListResponse, FinancialDatasetsConfig } from './types';

export class EarningsProvider {
	private client: FinancialDatasetsClient;

	constructor(config: FinancialDatasetsConfig) {
		this.client = new FinancialDatasetsClient(config);
	}

	async fetchEarnings(ticker: string, limit = 8): Promise<FDEarnings[]> {
		const data = await this.client.request<FDListResponse<FDEarnings>>('/earnings', {
			ticker,
			limit: String(limit),
		});
		return this.extractArray<FDEarnings>(data, 'earnings');
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
