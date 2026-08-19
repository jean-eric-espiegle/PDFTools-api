import { Router } from "express";
import express from "express";
import Stripe from "stripe";
import { requireStripe } from "../lib/stripe.js";
import { STRIPE_WEBHOOK_SECRET } from "../config.js";
import { findApiKeyByStripeSubscriptionId, setBillingStatus } from "../lib/apiKeys.js";
import { findUserByStripeSubscriptionId, setUserBillingStatus } from "../lib/users.js";
import { sendError, sendSuccess } from "../lib/response.js";

export const stripeWebhookRouter = Router();

// Maps Stripe's subscription lifecycle onto our 3-state billing_status.
// incomplete/incomplete_expired/trialing don't come up in this MVP's flow
// (subscriptions are created with payment_behavior: error_if_incomplete, no
// trials configured) but are handled defensively rather than left unmapped.
function mapSubscriptionStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      // Forward-compat: Stripe's type allows for statuses not yet in this
      // union. Fail closed rather than silently treat an unknown status as
      // active.
      return "past_due";
  }
}

stripeWebhookRouter.post(
  "/webhooks/stripe",
  // Signature verification needs the exact raw body bytes, so this route
  // gets its own body parser instead of relying on any app-level one.
  express.raw({ type: "application/json" }),
  (req, res) => {
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("Received a Stripe webhook but STRIPE_WEBHOOK_SECRET is not configured");
      return sendError(res, 500, "Webhook not configured");
    }

    const signature = req.header("stripe-signature");
    if (!signature) {
      return sendError(res, 400, "Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
      event = requireStripe().webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return sendError(res, 400, `Webhook signature verification failed: ${(err as Error).message}`);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const status =
        event.type === "customer.subscription.deleted" ? "canceled" : mapSubscriptionStatus(subscription.status);

      // Two independent places a subscription can be attached: an
      // admin/CLI-created key (legacy, no user_id) or a self-serve user
      // account (POST /auth/subscribe). Check both — a given subscription
      // id only ever matches one of them.
      const apiKey = findApiKeyByStripeSubscriptionId(subscription.id);
      const user = findUserByStripeSubscriptionId(subscription.id);

      if (apiKey) {
        setBillingStatus(apiKey.id, status);
        console.log(`Stripe webhook: key ${apiKey.id} billing_status -> ${status}`);
      }
      if (user) {
        setUserBillingStatus(user.id, status);
        console.log(`Stripe webhook: user ${user.id} billing_status -> ${status}`);
      }
      if (!apiKey && !user) {
        console.warn(`Stripe webhook: no api_key or user found for subscription ${subscription.id}`);
      }
    }

    sendSuccess(res, 200, { received: true });
  }
);
