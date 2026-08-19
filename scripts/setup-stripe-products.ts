import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { DATA_DIR } from "../src/config.js";
import { requireStripe } from "../src/lib/stripe.js";
import { PLANS, isPaidPlan, METER_EVENT_NAME } from "../src/billingPlans.js";

const outPath = path.join(DATA_DIR, "billing-price-ids.json");
const force = process.argv.includes("--force");

if (fs.existsSync(outPath) && !force) {
  console.error(
    `${outPath} already exists. Re-running would create duplicate Stripe products/prices.\n` +
      `Pass --force if you really want to create a fresh set (e.g. switching from test to live mode).`
  );
  process.exit(1);
}

async function main() {
  const stripe = requireStripe();

  const product = await stripe.products.create({ name: "PDF Toolkit API" });
  console.log(`Created product ${product.id}`);

  // One meter aggregates raw operation counts per customer; each plan's
  // metered price below applies its own graduated tiers on top of that same
  // aggregated number (see src/billingPlans.ts for why this is shared).
  const meter = await stripe.billing.meters.create({
    display_name: "PDF Toolkit operations",
    event_name: METER_EVENT_NAME,
    default_aggregation: { formula: "sum" },
  });
  console.log(`Created meter ${meter.id} (event_name=${METER_EVENT_NAME})`);

  const plans: Record<string, { flatPriceId: string; meteredPriceId: string }> = {};

  for (const plan of Object.values(PLANS)) {
    if (!isPaidPlan(plan.id)) continue;

    const flatPrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.monthlyFeeUsd * 100,
      recurring: { interval: "month" },
      nickname: `${plan.name} - base`,
    });

    const meteredPrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      recurring: { interval: "month", usage_type: "metered", meter: meter.id },
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: [
        { up_to: plan.includedOps, unit_amount_decimal: Stripe.Decimal.from("0") },
        { up_to: "inf", unit_amount_decimal: Stripe.Decimal.from(String(plan.overageCentsPerOp)) },
      ],
      nickname: `${plan.name} - overage`,
    });

    plans[plan.id] = { flatPriceId: flatPrice.id, meteredPriceId: meteredPrice.id };
    console.log(`${plan.name}: flat=${flatPrice.id} metered=${meteredPrice.id}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ meterId: meter.id, plans }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
