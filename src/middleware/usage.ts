import type { NextFunction, Request, Response } from "express";
import { logUsage } from "../lib/apiKeys.js";
import { stripe } from "../lib/stripe.js";
import { METER_EVENT_NAME } from "../billingPlans.js";

export function trackUsage(endpoint: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      if (!req.apiKey) return;

      const bytesIn = Number(req.headers["content-length"] ?? 0);
      const bytesOut = Number(res.getHeader("content-length") ?? 0);

      logUsage({
        apiKeyId: req.apiKey.id,
        endpoint,
        bytesIn,
        bytesOut,
        statusCode: res.statusCode,
      });

      // Only bill successful operations, and only for keys with an active
      // Stripe subscription (paid plans). Best-effort: a Stripe hiccup here
      // shouldn't affect the response already sent to the caller, but it
      // does mean that operation goes unbilled — acceptable for an MVP,
      // revisit with a retry queue if under-billing becomes material.
      if (stripe && req.apiKey.stripe_subscription_item_id && res.statusCode < 300) {
        stripe.billing.meterEvents
          .create({
            event_name: METER_EVENT_NAME,
            payload: { stripe_customer_id: req.apiKey.stripe_customer_id!, value: "1" },
          })
          .catch((err) => {
            console.error(`Stripe usage report failed for key ${req.apiKey!.id}:`, err);
          });
      }
    });

    next();
  };
}
