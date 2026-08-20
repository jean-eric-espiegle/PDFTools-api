import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { sendSuccess } from "../lib/response.js";
import { PLANS, type PlanDefinition } from "../billingPlans.js";

export const adminRouter = Router();

interface Metric {
  id: string;
  label: string;
  value: number;
  kind: "count" | "currency" | "percent";
  unit?: string;
}

interface Breakdown {
  id: string;
  label: string;
  data: { label: string; value: number }[];
}

// See ADMIN_STATS_CONTRACT.md (AdminDash) — this is the reference
// implementation every other microservice's /admin/stats should match.
adminRouter.get("/stats", requireAdmin, (_req, res) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalUsers = (db.prepare(`SELECT COUNT(*) as n FROM users`).get() as { n: number }).n;
  const verifiedUsers = (
    db.prepare(`SELECT COUNT(*) as n FROM users WHERE email_verified_at IS NOT NULL`).get() as { n: number }
  ).n;
  const signupsLast7d = (
    db.prepare(`SELECT COUNT(*) as n FROM users WHERE created_at >= ?`).get(sevenDaysAgo) as { n: number }
  ).n;

  const usersByPlanRows = db.prepare(`SELECT plan, COUNT(*) as n FROM users GROUP BY plan`).all() as {
    plan: string;
    n: number;
  }[];

  const activeSubscriptions = (
    db
      .prepare(`SELECT COUNT(*) as n FROM users WHERE plan != 'free' AND billing_status = 'active'`)
      .get() as { n: number }
  ).n;

  // Estimate, not an invoice total: sums each active paid user's flat plan
  // fee. Doesn't account for metered overage, mid-cycle proration, or
  // failed/pending payments. Stripe's own dashboard is the source of truth
  // for actual billed revenue. Good enough for an at-a-glance number.
  const activeByPlanRows = db
    .prepare(`SELECT plan, COUNT(*) as n FROM users WHERE plan != 'free' AND billing_status = 'active' GROUP BY plan`)
    .all() as { plan: string; n: number }[];
  const mrrEstimate = activeByPlanRows.reduce((sum, row) => {
    const plan = PLANS[row.plan as PlanDefinition["id"]];
    return sum + (plan ? plan.monthlyFeeUsd * row.n : 0);
  }, 0);

  const totalApiKeys = (
    db.prepare(`SELECT COUNT(*) as n FROM api_keys WHERE revoked_at IS NULL`).get() as { n: number }
  ).n;

  const usageLast30d = (
    db.prepare(`SELECT COUNT(*) as n FROM usage_log WHERE created_at >= ?`).get(thirtyDaysAgo) as { n: number }
  ).n;

  const usageByEndpointRows = db
    .prepare(`SELECT endpoint, COUNT(*) as n FROM usage_log WHERE created_at >= ? GROUP BY endpoint ORDER BY n DESC`)
    .all(thirtyDaysAgo) as { endpoint: string; n: number }[];

  const subscribersCount = (db.prepare(`SELECT COUNT(*) as n FROM subscribers`).get() as { n: number }).n;

  const metrics: Metric[] = [
    { id: "total_users", label: "Total users", value: totalUsers, kind: "count" },
    { id: "verified_users", label: "Verified users", value: verifiedUsers, kind: "count" },
    { id: "signups_7d", label: "Signups (7d)", value: signupsLast7d, kind: "count" },
    { id: "active_subscriptions", label: "Active paid subscriptions", value: activeSubscriptions, kind: "count" },
    { id: "mrr_estimate", label: "Est. MRR", value: mrrEstimate, kind: "currency", unit: "USD" },
    { id: "total_api_keys", label: "Active API keys", value: totalApiKeys, kind: "count" },
    { id: "usage_30d", label: "API calls (30d)", value: usageLast30d, kind: "count" },
    { id: "lead_subscribers", label: "Newsletter subscribers", value: subscribersCount, kind: "count" },
  ];

  const breakdowns: Breakdown[] = [
    {
      id: "users_by_plan",
      label: "Users by plan",
      data: usersByPlanRows.map((r) => ({ label: r.plan, value: r.n })),
    },
    {
      id: "usage_by_endpoint_30d",
      label: "API calls by endpoint (30d)",
      data: usageByEndpointRows.map((r) => ({ label: r.endpoint, value: r.n })),
    },
  ];

  sendSuccess(res, 200, {
    service: "pdf-toolkit-api",
    displayName: "PDF Toolkit API",
    generatedAt: now.toISOString(),
    metrics,
    breakdowns,
  });
});
