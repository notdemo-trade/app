# Phase 2: Credentials Configuration — Part 3: Business Logic
> Split from `002-phase-2-credentials-configuration.md`. See other parts in this directory.

## Encryption Module

```ts
// packages/data-ops/src/crypto/credentials.ts

interface EncryptedPayload {
  ciphertext: string  // base64
  iv: string          // base64
  salt: string        // base64
}

interface EncryptionContext {
  masterKey: string   // from env
  userId: string
}

export async function encryptCredential(
  ctx: EncryptionContext,
  data: Record<string, unknown>
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const derivedKey = await deriveKey(ctx.masterKey, ctx.userId, salt)
  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    plaintext
  )

  return {
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
    iv: base64Encode(iv),
    salt: base64Encode(salt),
  }
}

export async function decryptCredential<T>(
  ctx: EncryptionContext,
  payload: EncryptedPayload
): Promise<T> {
  const salt = base64Decode(payload.salt)
  const iv = base64Decode(payload.iv)
  const ciphertext = base64Decode(payload.ciphertext)

  const derivedKey = await deriveKey(ctx.masterKey, ctx.userId, salt)

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    ciphertext
  )

  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

async function deriveKey(
  masterKey: string,
  userId: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterKey),
    "HKDF",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(userId),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

function base64Encode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
}

function base64Decode(str: string): Uint8Array {
  return new Uint8Array(atob(str).split("").map(c => c.charCodeAt(0)))
}
```

---


## Query Functions

```ts
// packages/data-ops/src/queries/credentials.ts

import { eq, and } from "drizzle-orm"
import { user_credentials, type CredentialProvider } from "../drizzle/schema"
import { encryptCredential, decryptCredential } from "../crypto/credentials"
import type { Database } from "../database/setup"

interface SaveCredentialParams {
  userId: string
  provider: CredentialProvider
  data: Record<string, unknown>
  masterKey: string
}

export async function saveCredential(
  db: Database,
  params: SaveCredentialParams
): Promise<void> {
  const encrypted = await encryptCredential(
    { masterKey: params.masterKey, userId: params.userId },
    params.data
  )

  await db
    .insert(user_credentials)
    .values({
      userId: params.userId,
      provider: params.provider,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: encrypted.salt,
    })
    .onConflictDoUpdate({
      target: [user_credentials.userId, user_credentials.provider],
      set: {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        validationError: null,
        lastValidatedAt: null,
        updatedAt: new Date(),
      },
    })
}

export async function getCredential<T>(
  db: Database,
  params: { userId: string; provider: CredentialProvider; masterKey: string }
): Promise<T | null> {
  const [row] = await db
    .select()
    .from(user_credentials)
    .where(
      and(
        eq(user_credentials.userId, params.userId),
        eq(user_credentials.provider, params.provider)
      )
    )
    .limit(1)

  if (!row) return null

  return decryptCredential<T>(
    { masterKey: params.masterKey, userId: params.userId },
    { ciphertext: row.encryptedData, iv: row.iv, salt: row.salt }
  )
}

export async function deleteCredential(
  db: Database,
  params: { userId: string; provider: CredentialProvider }
): Promise<boolean> {
  const result = await db
    .delete(user_credentials)
    .where(
      and(
        eq(user_credentials.userId, params.userId),
        eq(user_credentials.provider, params.provider)
      )
    )
    .returning()

  return result.length > 0
}

export async function listCredentials(
  db: Database,
  userId: string
) {
  return db
    .select({
      provider: user_credentials.provider,
      lastValidatedAt: user_credentials.lastValidatedAt,
      validationError: user_credentials.validationError,
      createdAt: user_credentials.createdAt,
      updatedAt: user_credentials.updatedAt,
    })
    .from(user_credentials)
    .where(eq(user_credentials.userId, userId))
}

export async function updateValidationStatus(
  db: Database,
  params: {
    userId: string
    provider: CredentialProvider
    success: boolean
    error?: string
  }
): Promise<void> {
  await db
    .update(user_credentials)
    .set({
      lastValidatedAt: new Date(),
      validationError: params.success ? null : (params.error ?? "Validation failed"),
    })
    .where(
      and(
        eq(user_credentials.userId, params.userId),
        eq(user_credentials.provider, params.provider)
      )
    )
}
```

```ts
// packages/data-ops/src/queries/trading-config.ts

import { eq } from "drizzle-orm"
import { user_trading_config } from "../drizzle/schema"
import type { TradingConfig } from "../zod-schema/trading-config"
import type { Database } from "../database/setup"

export async function getTradingConfig(
  db: Database,
  userId: string
): Promise<TradingConfig | null> {
  const [row] = await db
    .select()
    .from(user_trading_config)
    .where(eq(user_trading_config.userId, userId))
    .limit(1)

  return row ?? null
}

export async function upsertTradingConfig(
  db: Database,
  userId: string,
  config: Partial<TradingConfig>
): Promise<TradingConfig> {
  const [result] = await db
    .insert(user_trading_config)
    .values({ userId, ...config })
    .onConflictDoUpdate({
      target: user_trading_config.userId,
      set: { ...config, updatedAt: new Date() },
    })
    .returning()

  return result
}
```

---


## Validation Service

```ts
// packages/data-ops/src/services/credential-validation.ts

import type { AlpacaCredential, LLMCredential } from "../zod-schema/credentials"

interface ValidationResult {
  success: boolean
  error?: string
}

export async function validateAlpacaCredential(
  cred: AlpacaCredential
): Promise<ValidationResult> {
  const baseUrl = cred.paper
    ? "https://paper-api.alpaca.markets"
    : "https://api.alpaca.markets"

  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": cred.apiKey,
        "APCA-API-SECRET-KEY": cred.apiSecret,
      },
    })

    if (res.status === 401) {
      return { success: false, error: "Invalid API credentials" }
    }
    if (res.status === 403) {
      return { success: false, error: "Account access denied" }
    }
    if (!res.ok) {
      return { success: false, error: `Alpaca API error: ${res.status}` }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: `Connection failed: ${String(e)}` }
  }
}

export async function validateLLMCredential(
  provider: "openai" | "anthropic" | "google" | "xai" | "deepseek",
  cred: LLMCredential
): Promise<ValidationResult> {
  const endpoints: Record<string, { url: string; header: string }> = {
    openai: { url: "https://api.openai.com/v1/models", header: "Authorization" },
    anthropic: { url: "https://api.anthropic.com/v1/messages", header: "x-api-key" },
    google: { url: "https://generativelanguage.googleapis.com/v1beta/models", header: "x-goog-api-key" },
    xai: { url: "https://api.x.ai/v1/models", header: "Authorization" },
    deepseek: { url: "https://api.deepseek.com/v1/models", header: "Authorization" },
  }

  const config = endpoints[provider]
  if (!config) return { success: false, error: `Unknown provider: ${provider}` }

  try {
    const headers: Record<string, string> = {}
    if (config.header === "Authorization") {
      headers[config.header] = `Bearer ${cred.apiKey}`
    } else {
      headers[config.header] = cred.apiKey
    }

    // For Anthropic, need to make a POST request
    if (provider === "anthropic") {
      headers["anthropic-version"] = "2023-06-01"
      headers["content-type"] = "application/json"

      const res = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      })

      if (res.status === 401) return { success: false, error: "Invalid API key" }
      if (!res.ok && res.status !== 400) {
        return { success: false, error: `API error: ${res.status}` }
      }
      return { success: true }
    }

    // For others, GET models endpoint
    const res = await fetch(config.url, { headers })

    if (res.status === 401) return { success: false, error: "Invalid API key" }
    if (!res.ok) return { success: false, error: `API error: ${res.status}` }

    return { success: true }
  } catch (e) {
    return { success: false, error: `Connection failed: ${String(e)}` }
  }
}

export async function validateTwitterCredential(
  cred: TwitterCredential
): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${cred.bearerToken}` },
    })
    if (res.status === 401) return { success: false, error: "Invalid bearer token" }
    if (res.status === 403) return { success: false, error: "Insufficient permissions" }
    if (!res.ok) return { success: false, error: `X API error: ${res.status}` }
    return { success: true }
  } catch (e) {
    return { success: false, error: `Connection failed: ${String(e)}` }
  }
}
```

---

