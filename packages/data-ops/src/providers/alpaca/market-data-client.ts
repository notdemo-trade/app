import { getCredential } from '../../credential/queries';
import type { AlpacaCredential } from '../../credential/schema';
import type { AlpacaMarketDataConfig } from './market-data';

export async function getAlpacaMarketDataConfig(
	userId: string,
	masterKey: string,
): Promise<AlpacaMarketDataConfig | null> {
	const creds = await getCredential<AlpacaCredential>({
		userId,
		provider: 'alpaca',
		masterKey,
	});
	if (!creds) return null;
	return {
		apiKey: creds.apiKey,
		apiSecret: creds.apiSecret,
		baseUrl: 'https://data.alpaca.markets',
	};
}
