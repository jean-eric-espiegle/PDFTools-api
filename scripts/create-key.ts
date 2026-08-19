import "../src/db.js";
import { attachStripeSubscription, createApiKey } from "../src/lib/apiKeys.js";
import { FREE_TIER_MONTHLY_LIMIT } from "../src/config.js";
import { PLANS, isPaidPlan, type PlanDefinition } from "../src/billingPlans.js";
import { subscribeToPlan } from "../src/lib/billing.js";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const name = parseArg("--name") ?? "unnamed";
const planId = (parseArg("--plan") ?? "free") as PlanDefinition["id"];
const email = parseArg("--email");
const limitOverride = parseArg("--limit");

async function main() {
  if (!PLANS[planId]) {
    throw new Error(`Unknown plan "${planId}". Valid plans: ${Object.keys(PLANS).join(", ")}`);
  }

  if (!isPaidPlan(planId)) {
    const limit = Number(limitOverride ?? FREE_TIER_MONTHLY_LIMIT);
    const key = createApiKey(name, planId, limit);
    printKey(key.name, key.plan, key.monthlyLimit, key.rawKey);
    return;
  }

  if (!email) {
    throw new Error(`--email is required for paid plans (creates/reuses a Stripe customer)`);
  }

  const subscription = await subscribeToPlan({ email, name, planId });

  const limit = Number(limitOverride ?? subscription.plan.safetyCapOps);
  const key = createApiKey(name, planId, limit);
  attachStripeSubscription(key.id, {
    customerId: subscription.customerId,
    subscriptionId: subscription.subscriptionId,
    subscriptionItemId: subscription.subscriptionItemId,
  });

  printKey(key.name, key.plan, key.monthlyLimit, key.rawKey);
  console.log(`  stripe customer:     ${subscription.customerId}`);
  console.log(`  stripe subscription: ${subscription.subscriptionId} (${subscription.status})`);
}

function printKey(name: string, plan: string, limit: number, rawKey: string) {
  console.log("API key created:");
  console.log(`  name:  ${name}`);
  console.log(`  plan:  ${plan}`);
  console.log(`  limit: ${limit}/month`);
  console.log(`  key:   ${rawKey}`);
  console.log("\nStore this key now — only its hash is kept in the database.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
