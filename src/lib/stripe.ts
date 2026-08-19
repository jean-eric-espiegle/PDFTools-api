import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../config.js";

export const stripeEnabled = STRIPE_SECRET_KEY.length > 0;

export const stripe = stripeEnabled
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" })
  : null;

export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return stripe;
}
