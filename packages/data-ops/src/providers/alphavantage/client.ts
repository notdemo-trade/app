import type { AlphaVantageConfig, AlphaVantageErrorResponse } from './types';

const BASE_URL = 'https://www.alphavantage.co/query';

export class AlphaVantageApiError extends Error {
	constructor(
		public statusCode: number,
		public body: string,
	) {
		super(`Alpha Vantage API error (${statusCode}): ${body}`);
		this.name = 'AlphaVantageApiError';
	}
}

export class AlphaVantageRateLimitError extends Error {
	constructor() {
		super('Alpha Vantage rate limit exceeded');
		this.name = 'AlphaVantageRateLimitError';
	}
}

export class AlphaVantageClient {
	private apiKey: string;

	constructor(config: AlphaVantageConfig) {
		this.apiKey = config.apiKey;
	}

	async request<T>(params: Record<string, string>): Promise<T> {
		const searchParams = new URLSearchParams({
			...params,
			apikey: this.apiKey,
		});

		const url = `${BASE_URL}?${searchParams.toString()}`;
		const response = await fetch(url);

		if (!response.ok) {
			const errorBody = await response.text();
			throw new AlphaVantageApiError(response.status, errorBody);
		}

		const data = (await response.json()) as T & AlphaVantageErrorResponse;

		// AV returns 200 with error in body
		if (data['Error Message']) {
			throw new AlphaVantageApiError(400, data['Error Message']);
		}
		if (data.Note || data.Information) {
			const msg = data.Note ?? data.Information ?? 'Rate limit';
			if (msg.includes('call frequency') || msg.includes('rate limit')) {
				throw new AlphaVantageRateLimitError();
			}
			throw new AlphaVantageApiError(429, msg);
		}

		return data;
	}
}
