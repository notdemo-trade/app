export interface EncryptedPayload {
	ciphertext: string; // base64
	iv: string; // base64
	salt: string; // base64
}

interface EncryptionContext {
	masterKey: string; // from env
	userId: string;
}

export async function encryptCredential(
	ctx: EncryptionContext,
	data: Record<string, unknown>,
): Promise<EncryptedPayload> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const derivedKey = await deriveKey(ctx.masterKey, ctx.userId, salt);
	const plaintext = new TextEncoder().encode(JSON.stringify(data));

	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, plaintext);

	return {
		ciphertext: base64Encode(new Uint8Array(ciphertext)),
		iv: base64Encode(iv),
		salt: base64Encode(salt),
	};
}

export async function decryptCredential<T>(
	ctx: EncryptionContext,
	payload: EncryptedPayload,
): Promise<T> {
	const salt = base64Decode(payload.salt);
	const iv = base64Decode(payload.iv);
	const ciphertext = base64Decode(payload.ciphertext);

	const derivedKey = await deriveKey(ctx.masterKey, ctx.userId, salt);

	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, ciphertext);

	return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function deriveKey(masterKey: string, userId: string, salt: Uint8Array): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(masterKey),
		'HKDF',
		false,
		['deriveKey'],
	);

	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt,
			info: new TextEncoder().encode(userId),
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

function base64Encode(data: Uint8Array): string {
	return btoa(String.fromCharCode(...data));
}

function base64Decode(str: string): Uint8Array {
	return new Uint8Array(
		atob(str)
			.split('')
			.map((c) => c.charCodeAt(0)),
	);
}
