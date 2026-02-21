# Phase 10: Approval Flow — Part 3: Business Logic
> Split from `010-phase-10-approval-flow.md`. See other parts in this directory.

## Approval Token Generation

```ts
// packages/data-ops/src/policy/approval.ts

import type { OrderPreview, PolicyResult } from "./types"
import type { ApprovalTokenResult, ValidateApprovalResult } from "./approval-types"
import type { DbClient } from "../db/client"
import {
  createApproval,
  getApprovalByToken,
  markApprovalUsed,
  markApprovalRejected,
} from "../db/queries/approvals"

function generateId(): string {
  return crypto.randomUUID()
}

function hashObject(obj: unknown): string {
  const str = JSON.stringify(obj)
  // Simple hash for fingerprinting
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret)
  return expected === signature
}

export interface GenerateApprovalParams {
  userId: string
  preview: OrderPreview
  policyResult: PolicyResult
  secret: string
  db: DbClient
  ttlSeconds: number
  source?: "manual" | "llm" | "agent"
}

export async function generateApprovalToken(
  params: GenerateApprovalParams
): Promise<ApprovalTokenResult> {
  const { userId, preview, policyResult, secret, db, ttlSeconds, source } = params

  const approvalId = generateId()
  const previewHash = hashObject(preview)
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  const tokenData = `${approvalId}:${previewHash}:${expiresAt}`
  const signature = await hmacSign(tokenData, secret)
  const token = `${approvalId}.${signature}`

  await createApproval(db, {
    id: approvalId,
    userId,
    previewHash,
    orderParams: preview,
    policyResult,
    token,
    expiresAt,
    source: source ?? "manual",
  })

  return {
    token,
    approvalId,
    expiresAt,
  }
}

export interface ValidateApprovalParams {
  token: string
  secret: string
  db: DbClient
  userId: string
}

export async function validateApprovalToken(
  params: ValidateApprovalParams
): Promise<ValidateApprovalResult> {
  const { token, secret, db, userId } = params

  const parts = token.split(".")
  if (parts.length !== 2) {
    return { valid: false, reason: "Invalid token format" }
  }

  const [approvalId, signature] = parts
  if (!approvalId || !signature) {
    return { valid: false, reason: "Invalid token format" }
  }

  const approval = await getApprovalByToken(db, token)
  if (!approval) {
    return { valid: false, reason: "Approval token not found" }
  }

  // Verify ownership
  if (approval.userId !== userId) {
    return { valid: false, reason: "Approval token not found" }
  }

  if (approval.usedAt) {
    return { valid: false, reason: "Approval token already used" }
  }

  if (approval.rejectedAt) {
    return { valid: false, reason: "Approval was rejected" }
  }

  const now = new Date()
  const expiresAt = new Date(approval.expiresAt)
  if (now > expiresAt) {
    return { valid: false, reason: "Approval token expired" }
  }

  const tokenData = `${approvalId}:${approval.previewHash}:${approval.expiresAt}`
  const isValid = await hmacVerify(tokenData, signature, secret)
  if (!isValid) {
    return { valid: false, reason: "Invalid token signature" }
  }

  return {
    valid: true,
    approvalId: approval.id,
    orderParams: approval.orderParams,
    policyResult: approval.policyResult,
  }
}

export async function consumeApprovalToken(db: DbClient, approvalId: string): Promise<void> {
  await markApprovalUsed(db, approvalId)
}

export async function rejectApproval(
  db: DbClient,
  approvalId: string,
  reason?: string
): Promise<void> {
  await markApprovalRejected(db, approvalId, reason)
}
```

---


## Database Queries

```ts
// packages/data-ops/src/db/queries/approvals.ts

import { and, eq, isNull, lt, desc } from "drizzle-orm"
import type { DbClient } from "../client"
import { approvals, type NewApprovalRecord } from "../schema/approvals"
import type { OrderPreview, PolicyResult } from "../../policy/types"

export interface CreateApprovalParams {
  id: string
  userId: string
  previewHash: string
  orderParams: OrderPreview
  policyResult: PolicyResult
  token: string
  expiresAt: string
  source: "manual" | "llm" | "agent"
}

export async function createApproval(db: DbClient, params: CreateApprovalParams): Promise<void> {
  await db.insert(approvals).values({
    id: params.id,
    userId: params.userId,
    previewHash: params.previewHash,
    orderParams: params.orderParams,
    policyResult: params.policyResult,
    token: params.token,
    expiresAt: new Date(params.expiresAt),
    source: params.source,
  })
}

export async function getApprovalByToken(
  db: DbClient,
  token: string
): Promise<ApprovalRecord | undefined> {
  const [result] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.token, token))
    .limit(1)
  return result
}

export async function getApprovalById(
  db: DbClient,
  userId: string,
  approvalId: string
): Promise<ApprovalRecord | undefined> {
  const [result] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.userId, userId)))
    .limit(1)
  return result
}

export async function markApprovalUsed(db: DbClient, approvalId: string): Promise<void> {
  await db
    .update(approvals)
    .set({ usedAt: new Date() })
    .where(eq(approvals.id, approvalId))
}

export async function markApprovalRejected(
  db: DbClient,
  approvalId: string,
  reason?: string
): Promise<void> {
  await db
    .update(approvals)
    .set({
      rejectedAt: new Date(),
      rejectionReason: reason ?? null,
    })
    .where(eq(approvals.id, approvalId))
}

export async function getPendingApprovals(
  db: DbClient,
  userId: string
): Promise<ApprovalRecord[]> {
  const now = new Date()
  return db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.userId, userId),
        isNull(approvals.usedAt),
        isNull(approvals.rejectedAt),
        gt(approvals.expiresAt, now)
      )
    )
    .orderBy(desc(approvals.createdAt))
}

export async function getApprovalHistory(
  db: DbClient,
  userId: string,
  limit: number = 50
): Promise<ApprovalRecord[]> {
  return db
    .select()
    .from(approvals)
    .where(eq(approvals.userId, userId))
    .orderBy(desc(approvals.createdAt))
    .limit(limit)
}

export async function cleanupExpiredApprovals(db: DbClient): Promise<number> {
  const result = await db
    .delete(approvals)
    .where(
      and(
        lt(approvals.expiresAt, new Date()),
        isNull(approvals.usedAt)
      )
    )

  return result.rowCount ?? 0
}

function gt(column: any, value: any) {
  return sql`${column} > ${value}`
}

import { sql } from "drizzle-orm"
```

---


## Cron: Cleanup Expired Approvals

```ts
// apps/data-service/src/cron/cleanup-approvals.ts

import type { DbClient } from "@repo/data-ops/db/client"
import { cleanupExpiredApprovals } from "@repo/data-ops/db/queries/approvals"

export async function cleanupApprovals(db: DbClient): Promise<void> {
  const deleted = await cleanupExpiredApprovals(db)
  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} expired approvals`)
  }
}

// In wrangler.toml:
// [triggers]
// crons = ["*/15 * * * *"]  # Every 15 minutes
```

---

