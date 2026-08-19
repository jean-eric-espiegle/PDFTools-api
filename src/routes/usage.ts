import { Router } from "express";
import { currentMonthUsageCount } from "../lib/apiKeys.js";
import { sendSuccess } from "../lib/response.js";

export const usageRouter = Router();

usageRouter.get("/usage", (req, res) => {
  const apiKey = req.apiKey!;
  const used = currentMonthUsageCount(apiKey.id);

  sendSuccess(res, 200, {
    plan: apiKey.plan,
    monthlyLimit: apiKey.monthly_limit,
    usedThisMonth: used,
    remaining: Math.max(apiKey.monthly_limit - used, 0),
  });
});
