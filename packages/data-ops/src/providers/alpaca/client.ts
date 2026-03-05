export interface AlpacaClientConfig {
	apiKey: string;
	apiSecret: string;
	paper: boolean;
}

export class AlpacaApiError extends Error {
	constructor(
		public statusCode: number,
		public body: string,
	) {
		super(`Alpaca API error (${statusCode}): ${body}`);
		this.name = 'AlpacaApiError';
	}
}

export class AlpacaClient {
	private tradingBaseUrl: string;
	private headers: Record<string, string>;

	constructor(config: AlpacaClientConfig) {
		this.tradingBaseUrl = config.paper
			? 'https://paper-api.alpaca.markets'
			: 'https://api.alpaca.markets';
		this.headers = {
			'APCA-API-KEY-ID': config.apiKey,
			'APCA-API-SECRET-KEY': config.apiSecret,
			'Content-Type': 'application/json',
		};
	}

	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.tradingBaseUrl}${path}`;
		const options: RequestInit = { method, headers: this.headers };

		if (body) {
			options.body = JSON.stringify(body);
		}

		const response = await fetch(url, options);

		if (!response.ok) {
			const errorBody = await response.text();
			throw new AlpacaApiError(response.status, errorBody);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return response.json() as Promise<T>;
	}
}
