import type { Bar } from '../../agents/ta/types';
import { AlphaVantageClient } from './client';
import type {
	AlphaVantageConfig,
	AlphaVantageDailyResponse,
	AlphaVantageInterval,
	AlphaVantageIntradayResponse,
	AlphaVantageTimeSeriesEntry,
} from './types';

export class AlphaVantageMarketDataProvider {
	private client: AlphaVantageClient;

	constructor(config: AlphaVantageConfig) {
		this.client = new AlphaVantageClient(config);
	}

	async getDailyBars(symbol: string, outputSize: 'compact' | 'full' = 'compact'): Promise<Bar[]> {
		const data = await this.client.request<AlphaVantageDailyResponse>({
			function: 'TIME_SERIES_DAILY',
			symbol,
			outputsize: outputSize,
		});

		const timeSeries = data['Time Series (Daily)'];
		if (!timeSeries) return [];

		return this.mapTimeSeries(timeSeries);
	}

	async getIntradayBars(
		symbol: string,
		interval: AlphaVantageInterval,
		outputSize: 'compact' | 'full' = 'compact',
	): Promise<Bar[]> {
		const data = await this.client.request<AlphaVantageIntradayResponse>({
			function: 'TIME_SERIES_INTRADAY',
			symbol,
			interval,
			outputsize: outputSize,
		});

		// The key name varies by interval: "Time Series (15min)", "Time Series (60min)"
		const timeSeriesKey = `Time Series (${interval})`;
		const timeSeries = data[timeSeriesKey] as
			| Record<string, AlphaVantageTimeSeriesEntry>
			| undefined;
		if (!timeSeries) return [];

		return this.mapTimeSeries(timeSeries);
	}

	private mapTimeSeries(timeSeries: Record<string, AlphaVantageTimeSeriesEntry>): Bar[] {
		return Object.entries(timeSeries)
			.map(([dateStr, entry]) => ({
				t: new Date(dateStr).toISOString(),
				o: Number.parseFloat(entry['1. open']),
				h: Number.parseFloat(entry['2. high']),
				l: Number.parseFloat(entry['3. low']),
				c: Number.parseFloat(entry['4. close']),
				v: Number.parseInt(entry['5. volume'], 10),
				n: 0,
				vw: 0,
			}))
			.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
	}
}

/** Map our Timeframe type to AV interval */
export function timeframeToAVInterval(timeframe: string): AlphaVantageInterval | null {
	switch (timeframe) {
		case '15Min':
			return '15min';
		case '1Hour':
			return '60min';
		default:
			return null;
	}
}
