import { FinancialDatasetsClient } from './client';
import type {
	FDBalanceSheet,
	FDCashFlow,
	FDIncomeStatement,
	FDListResponse,
	FinancialDatasetsConfig,
} from './types';

export class FundamentalsProvider {
	private client: FinancialDatasetsClient;

	constructor(config: FinancialDatasetsConfig) {
		this.client = new FinancialDatasetsClient(config);
	}

	async fetchIncomeStatements(
		ticker: string,
		period: 'quarterly' | 'annual' = 'quarterly',
		limit = 4,
	): Promise<FDIncomeStatement[]> {
		const data = await this.client.request<FDListResponse<FDIncomeStatement>>(
			'/financials/income-statements',
			{ ticker, period, limit: String(limit) },
		);
		return this.extractArray<FDIncomeStatement>(data, 'income_statements');
	}

	async fetchBalanceSheets(
		ticker: string,
		period: 'quarterly' | 'annual' = 'quarterly',
		limit = 4,
	): Promise<FDBalanceSheet[]> {
		const data = await this.client.request<FDListResponse<FDBalanceSheet>>(
			'/financials/balance-sheets',
			{ ticker, period, limit: String(limit) },
		);
		return this.extractArray<FDBalanceSheet>(data, 'balance_sheets');
	}

	async fetchCashFlows(
		ticker: string,
		period: 'quarterly' | 'annual' = 'quarterly',
		limit = 4,
	): Promise<FDCashFlow[]> {
		const data = await this.client.request<FDListResponse<FDCashFlow>>(
			'/financials/cash-flow-statements',
			{ ticker, period, limit: String(limit) },
		);
		return this.extractArray<FDCashFlow>(data, 'cash_flow_statements');
	}

	private extractArray<T>(data: FDListResponse<T>, key: string): T[] {
		const value = data[key];
		if (Array.isArray(value)) return value;
		// Try to find any array in the response
		for (const val of Object.values(data)) {
			if (Array.isArray(val)) return val as T[];
		}
		return [];
	}
}
