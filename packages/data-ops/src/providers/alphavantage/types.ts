export interface AlphaVantageConfig {
	apiKey: string;
}

export interface AlphaVantageTimeSeriesEntry {
	'1. open': string;
	'2. high': string;
	'3. low': string;
	'4. close': string;
	'5. volume': string;
}

export interface AlphaVantageDailyResponse {
	'Meta Data': {
		'1. Information': string;
		'2. Symbol': string;
		'3. Last Refreshed': string;
		'4. Output Size': string;
		'5. Time Zone': string;
	};
	'Time Series (Daily)': Record<string, AlphaVantageTimeSeriesEntry>;
}

export interface AlphaVantageIntradayResponse {
	'Meta Data': {
		'1. Information': string;
		'2. Symbol': string;
		'3. Last Refreshed': string;
		'4. Interval': string;
		'5. Output Size': string;
		'6. Time Zone': string;
	};
	[key: string]: Record<string, AlphaVantageTimeSeriesEntry> | Record<string, string>;
}

export interface AlphaVantageErrorResponse {
	'Error Message'?: string;
	Note?: string;
	Information?: string;
}

export type AlphaVantageInterval = '15min' | '60min';
