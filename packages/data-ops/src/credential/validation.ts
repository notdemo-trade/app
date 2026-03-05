import type { AlpacaCredential, CredentialProvider, LLMCredential, LLMProvider } from './schema';

interface ValidationResult {
	success: boolean;
	error?: string;
}

const LLM_PROVIDERS: LLMProvider[] = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];

export async function validateCredentialByProvider(
	provider: CredentialProvider,
	data: Record<string, unknown>,
): Promise<ValidationResult> {
	if (provider === 'alpaca') {
		return validateAlpacaCredential(data as AlpacaCredential);
	}
	if (LLM_PROVIDERS.includes(provider as LLMProvider)) {
		return validateLLMCredential(provider as LLMProvider, data as LLMCredential);
	}
	return { success: false, error: `No validator for provider: ${provider}` };
}

export async function validateAlpacaCredential(cred: AlpacaCredential): Promise<ValidationResult> {
	const baseUrl = cred.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

	try {
		const res = await fetch(`${baseUrl}/v2/account`, {
			headers: {
				'APCA-API-KEY-ID': cred.apiKey,
				'APCA-API-SECRET-KEY': cred.apiSecret,
			},
		});

		if (res.status === 401) return { success: false, error: 'Invalid API credentials' };
		if (res.status === 403) return { success: false, error: 'Account access denied' };
		if (!res.ok) return { success: false, error: `Alpaca API error: ${res.status}` };

		return { success: true };
	} catch (e) {
		return { success: false, error: `Connection failed: ${String(e)}` };
	}
}

interface LLMEndpointConfig {
	url: string;
	header: string;
}

export async function validateLLMCredential(
	provider: LLMProvider,
	cred: LLMCredential,
): Promise<ValidationResult> {
	const endpoints: Record<string, LLMEndpointConfig> = {
		openai: { url: 'https://api.openai.com/v1/models', header: 'Authorization' },
		anthropic: { url: 'https://api.anthropic.com/v1/messages', header: 'x-api-key' },
		google: {
			url: 'https://generativelanguage.googleapis.com/v1beta/models',
			header: 'x-goog-api-key',
		},
		xai: { url: 'https://api.x.ai/v1/models', header: 'Authorization' },
		deepseek: { url: 'https://api.deepseek.com/v1/models', header: 'Authorization' },
	};

	const config = endpoints[provider];
	if (!config) return { success: false, error: `Unknown provider: ${provider}` };

	try {
		const headers: Record<string, string> = {};
		if (config.header === 'Authorization') {
			headers[config.header] = `Bearer ${cred.apiKey}`;
		} else {
			headers[config.header] = cred.apiKey;
		}

		// Anthropic requires POST
		if (provider === 'anthropic') {
			headers['anthropic-version'] = '2023-06-01';
			headers['content-type'] = 'application/json';

			const res = await fetch(config.url, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: 'claude-3-5-haiku-latest',
					max_tokens: 1,
					messages: [{ role: 'user', content: 'hi' }],
				}),
			});

			if (res.status === 401) return { success: false, error: 'Invalid API key' };
			if (!res.ok && res.status !== 400) {
				return { success: false, error: `API error: ${res.status}` };
			}
			return { success: true };
		}

		const res = await fetch(config.url, { headers });
		if (res.status === 401) return { success: false, error: 'Invalid API key' };
		if (!res.ok) return { success: false, error: `API error: ${res.status}` };

		return { success: true };
	} catch (e) {
		return { success: false, error: `Connection failed: ${String(e)}` };
	}
}
