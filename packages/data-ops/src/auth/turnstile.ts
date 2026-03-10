interface TurnstileResponse {
	success: boolean;
	'error-codes'?: string[];
}

interface VerifyResult {
	success: boolean;
	errorCodes?: string[];
}

export async function verifyTurnstileToken(
	token: string,
	secretKey: string,
	remoteIp?: string,
): Promise<VerifyResult> {
	const formData = new URLSearchParams();
	formData.append('secret', secretKey);
	formData.append('response', token);
	if (remoteIp) {
		formData.append('remoteip', remoteIp);
	}

	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		body: formData,
	});

	const data = (await response.json()) as TurnstileResponse;

	return {
		success: data.success,
		errorCodes: data['error-codes'],
	};
}
