import type { Bar, Timeframe } from '../../agents/ta/types';

export interface AlpacaMarketDataConfig {
	apiKey: string;
	apiSecret: string;
	baseUrl: string;
}

interface GetBarsOptions {
	limit?: number;
	adjustment?: 'raw' | 'split' | 'dividend' | 'all';
	start?: string;
	end?: string;
}

interface AlpacaBarResponse {
	bars: AlpacaBar[];
	next_page_token: string | null;
}

interface AlpacaCryptoBarsResponse {
	bars: Record<string, AlpacaBar[]>;
	next_page_token: string | null;
}

interface AlpacaBar {
	t: string;
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
	n: number;
	vw: number;
}

const CRYPTO_BASES = [
	'BTC',
	'ETH',
	'SOL',
	'DOGE',
	'SHIB',
	'AVAX',
	'DOT',
	'MATIC',
	'LINK',
	'UNI',
	'AAVE',
	'LTC',
	'XRP',
	'ADA',
	'ALGO',
];
const CRYPTO_QUOTES = ['USD', 'USDT', 'USDC', 'BTC', 'EUR'];
const CRYPTO_REGEX = new RegExp(`^(${CRYPTO_BASES.join('|')})(${CRYPTO_QUOTES.join('|')})$`, 'i');

function isCrypto(symbol: string): boolean {
	return symbol.includes('/') || CRYPTO_REGEX.test(symbol);
}

function normalizeCryptoSymbol(symbol: string): string {
	if (symbol.includes('/')) return symbol.toUpperCase();
	const match = symbol.match(CRYPTO_REGEX);
	if (match?.[1] && match[2]) return `${match[1].toUpperCase()}/${match[2].toUpperCase()}`;
	return symbol.toUpperCase();
}

export class AlpacaMarketDataProvider {
	private config: AlpacaMarketDataConfig;

	constructor(config: AlpacaMarketDataConfig) {
		this.config = config;
	}

	async getBars(symbol: string, timeframe: Timeframe, opts: GetBarsOptions = {}): Promise<Bar[]> {
		const { limit = 250, adjustment = 'split', end } = opts;
		const start = opts.start ?? this.defaultStart(timeframe, limit);
		const crypto = isCrypto(symbol);
		const apiSymbol = crypto ? normalizeCryptoSymbol(symbol) : symbol.toUpperCase();
		const params = new URLSearchParams({
			timeframe: this.mapTimeframe(timeframe),
			limit: String(limit),
			start,
		});
		if (!crypto) params.set('adjustment', adjustment);
		if (end) params.set('end', end);

		const headers = {
			'APCA-API-KEY-ID': this.config.apiKey,
			'APCA-API-SECRET-KEY': this.config.apiSecret,
		};

		if (crypto) {
			params.set('symbols', apiSymbol);
			const url = `${this.config.baseUrl}/v1beta3/crypto/us/bars?${params}`;
			const res = await fetch(url, { headers });
			if (!res.ok) {
				const body = await res.text();
				throw new Error(`Alpaca API error ${res.status}: ${body}`);
			}
			const data: AlpacaCryptoBarsResponse = await res.json();
			return data.bars?.[apiSymbol] ?? [];
		}

		const url = `${this.config.baseUrl}/v2/stocks/${apiSymbol}/bars?${params}`;
		const res = await fetch(url, { headers });
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Alpaca API error ${res.status}: ${body}`);
		}
		const data: AlpacaBarResponse = await res.json();
		return data.bars ?? [];
	}

	private defaultStart(tf: Timeframe, limit: number): string {
		const now = new Date();
		const daysBack: Record<Timeframe, number> = {
			'1Min': Math.ceil(limit / 390) + 2,
			'5Min': Math.ceil((limit * 5) / 390) + 2,
			'15Min': Math.ceil((limit * 15) / 390) + 2,
			'1Hour': Math.ceil(limit / 6.5) + 2,
			'1Day': Math.ceil(limit * 1.5),
		};
		now.setDate(now.getDate() - daysBack[tf]);
		return now.toISOString().split('T')[0] ?? now.toISOString();
	}

	private mapTimeframe(tf: Timeframe): string {
		const map: Record<Timeframe, string> = {
			'1Min': '1Min',
			'5Min': '5Min',
			'15Min': '15Min',
			'1Hour': '1Hour',
			'1Day': '1Day',
		};
		return map[tf];
	}
}
