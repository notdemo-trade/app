import type { FinancialDatasetsConfig } from './types';

const BASE_URL = 'https://api.financialdatasets.ai';

export class FinancialDatasetsApiError extends Error {
	constructor(
		public statusCode: number,
		public body: string,
	) {
		super(`FinancialDatasets API error (${statusCode}): ${body}`);
		this.name = 'FinancialDatasetsApiError';
	}
}

export class FinancialDatasetsClient {
	private apiKey: string;

	constructor(config: FinancialDatasetsConfig) {
		this.apiKey = config.apiKey;
	}

	async request<T>(path: string, params?: Record<string, string>): Promise<T> {
		const url = new URL(`${BASE_URL}${path}`);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
		}

		const response = await fetch(url.toString(), {
			headers: {
				'X-API-Key': this.apiKey,
				Accept: 'application/json',
			},
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new FinancialDatasetsApiError(response.status, errorBody);
		}

		return response.json() as Promise<T>;
	}
}
