import { requireStripe } from "./stripe.js";
import { PLANS, isPaidPlan, type PlanDefinition } from "../billingPlans.js";

export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Finds or creates a Stripe customer for `email` and subscribes them to
 * `planId`'s flat + metered prices, activating immediately via Stripe's
 * well-known test Visa card. That test-card attach is a sandbox convenience
 * — real self-serve signup would collect a real payment method via Stripe
 * Elements/Checkout instead (see README "Self-serve accounts").
 *
 * Shared by scripts/create-key.ts (admin CLI) and POST /auth/subscribe
 * (self-serve) so the two paths can't drift apart.
 */
export async function subscribeToPlan(params: { email: string; name: string; planId: string }) {
  const planId = params.planId as PlanDefinition["id"];

  if (!PLANS[planId]) {
    throw new BillingError(`Unknown plan "${planId}". Valid plans: ${Object.keys(PLANS).join(", ")}`);
  }
  if (!isPaidPlan(planId)) {
    throw new BillingError(`"${planId}" is not a paid plan`);
  }

  const plan = PLANS[planId];
  if (!plan.stripeFlatPriceId || !plan.stripeMeteredPriceId) {
    throw new BillingError(
      `No Stripe price IDs configured for plan "${planId}". Run the setup-stripe-products script first.`,
      500
    );
  }

  const stripe = requireStripe();

  const existing = await stripe.customers.list({ email: params.email, limit: 1 });
  const customer = existing.data[0] ?? (await stripe.customers.create({ name: params.name, email: params.email }));

  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: plan.stripeFlatPriceId }, { price: plan.stripeMeteredPriceId }],
    payment_behavior: "error_if_incomplete",
  });

  const meteredItem = subscription.items.data.find((item) => item.price.id === plan.stripeMeteredPriceId);
  if (!meteredItem) {
    throw new BillingError("Metered subscription item not found after creation", 500);
  }

  return {
    plan,
    customerId: customer.id,
    subscriptionId: subscription.id,
    subscriptionItemId: meteredItem.id,
    status: subscription.status,
  };
}
