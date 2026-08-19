import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";

/**
 * Paid plan definitions. `includedOps` is the quota covered by the flat
 * monthly price; usage beyond it is billed via a metered Stripe price with
 * graduated tiers (first `includedOps` units at $0, everything after at
 * `overageCentsPerOp`). `safetyCapOps` is the LOCAL hard-stop enforced by
 * requireApiKey (src/middleware/auth.ts) — separate from Stripe's own
 * included/overage math, it just exists to bound abuse before Stripe
 * bills for it. Free has no Stripe involvement: safetyCapOps *is* its quota.
 *
 * Price IDs are environment-specific (test mode and live mode Stripe prices
 * have different IDs), so they aren't hardcoded here. They're written to
 * <DATA_DIR>/billing-price-ids.json by scripts/setup-stripe-products.ts —
 * same persistent volume as the SQLite database, so this survives redeploys
 * without needing to bake environment-specific IDs into the image — and
 * merged in below at import time.
 */
export interface PlanDefinition {
  id: "free" | "starter" | "pro" | "scale";
  name: string;
  monthlyFeeUsd: number;
  includedOps: number;
  safetyCapOps: number;
  overageCentsPerOp: number;
  /** null for the free plan; populated after running the Stripe setup script. */
  stripeFlatPriceId: string | null;
  stripeMeteredPriceId: string | null;
}

export const PLANS: Record<PlanDefinition["id"], PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyFeeUsd: 0,
    includedOps: 100,
    safetyCapOps: 100,
    overageCentsPerOp: 0,
    stripeFlatPriceId: null,
    stripeMeteredPriceId: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyFeeUsd: 9,
    includedOps: 2000,
    safetyCapOps: 6000,
    overageCentsPerOp: 0.2,
    stripeFlatPriceId: null,
    stripeMeteredPriceId: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyFeeUsd: 29,
    includedOps: 10000,
    safetyCapOps: 30000,
    overageCentsPerOp: 0.2,
    stripeFlatPriceId: null,
    stripeMeteredPriceId: null,
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyFeeUsd: 99,
    includedOps: 50000,
    safetyCapOps: 150000,
    overageCentsPerOp: 0.2,
    stripeFlatPriceId: null,
    stripeMeteredPriceId: null,
  },
};

export function isPaidPlan(planId: string): planId is Exclude<PlanDefinition["id"], "free"> {
  return planId === "starter" || planId === "pro" || planId === "scale";
}

// Shared across all paid plans: one Billing Meter aggregates raw operation
// counts per customer; each plan's metered Price applies its own graduated
// tiers on top of that same aggregated number. Chosen by us (not
// Stripe-generated), so unlike price IDs this doesn't need to be persisted.
export const METER_EVENT_NAME = "pdf_toolkit_operation";

interface GeneratedIds {
  meterId: string;
  plans: {
    [planId: string]: { flatPriceId: string; meteredPriceId: string };
  };
}

const generatedPath = path.join(DATA_DIR, "billing-price-ids.json");

export let stripeMeterId: string | null = null;

if (fs.existsSync(generatedPath)) {
  const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8")) as GeneratedIds;
  stripeMeterId = generated.meterId;
  for (const [planId, ids] of Object.entries(generated.plans)) {
    const plan = PLANS[planId as PlanDefinition["id"]];
    if (plan) {
      plan.stripeFlatPriceId = ids.flatPriceId;
      plan.stripeMeteredPriceId = ids.meteredPriceId;
    }
  }
}
