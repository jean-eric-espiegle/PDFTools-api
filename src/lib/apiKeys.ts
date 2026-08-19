import { nanoid } from "nanoid";
import { db } from "../db.js";
import { sha256Hex } from "./hash.js";

export interface ApiKeyRecord {
  id: string;
  key_hash: string;
  name: string;
  plan: string;
  monthly_limit: number;
  created_at: string;
  revoked_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  billing_status: string;
  user_id: string | null;
}

export function hashKey(rawKey: string): string {
  return sha256Hex(rawKey);
}

export function createApiKey(name: string, plan = "free", monthlyLimit = 100, userId: string | null = null) {
  const id = nanoid(12);
  const rawKey = `pdftk_${nanoid(32)}`;
  const keyHash = hashKey(rawKey);
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO api_keys (id, key_hash, name, plan, monthly_limit, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, keyHash, name, plan, monthlyLimit, createdAt, userId);

  return { id, rawKey, name, plan, monthlyLimit, createdAt };
}

export function findApiKeyByRawKey(rawKey: string): ApiKeyRecord | undefined {
  const keyHash = hashKey(rawKey);
  return db
    .prepare(
      `SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`
    )
    .get(keyHash) as ApiKeyRecord | undefined;
}

export function findApiKeyByStripeSubscriptionId(subscriptionId: string): ApiKeyRecord | undefined {
  return db
    .prepare(`SELECT * FROM api_keys WHERE stripe_subscription_id = ?`)
    .get(subscriptionId) as ApiKeyRecord | undefined;
}

export function listApiKeysForUser(userId: string): ApiKeyRecord[] {
  return db
    .prepare(`SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`)
    .all(userId) as ApiKeyRecord[];
}

export function attachStripeSubscription(
  apiKeyId: string,
  params: { customerId: string; subscriptionId: string; subscriptionItemId: string }
) {
  db.prepare(
    `UPDATE api_keys
     SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_subscription_item_id = ?, billing_status = 'active'
     WHERE id = ?`
  ).run(params.customerId, params.subscriptionId, params.subscriptionItemId, apiKeyId);
}

export function setBillingStatus(apiKeyId: string, status: string) {
  db.prepare(`UPDATE api_keys SET billing_status = ? WHERE id = ?`).run(status, apiKeyId);
}

export function revokeApiKey(apiKeyId: string) {
  db.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`).run(new Date().toISOString(), apiKeyId);
}

export function currentMonthUsageCount(apiKeyId: string): number {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM usage_log
       WHERE api_key_id = ? AND created_at >= ?`
    )
    .get(apiKeyId, monthStart.toISOString()) as { count: number };

  return row.count;
}

export function logUsage(params: {
  apiKeyId: string;
  endpoint: string;
  bytesIn: number;
  bytesOut: number;
  statusCode: number;
}) {
  db.prepare(
    `INSERT INTO usage_log (api_key_id, endpoint, bytes_in, bytes_out, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.apiKeyId,
    params.endpoint,
    params.bytesIn,
    params.bytesOut,
    params.statusCode,
    new Date().toISOString()
  );
}
