import type { Response } from "express";

export interface ApiSuccess<T> {
  code: number;
  status: "success";
  data: T;
}

export interface ApiError {
  code: number;
  status: "error";
  data: { error: string };
}

export function sendSuccess<T>(res: Response, code: number, data: T): void {
  res.status(code).json({ code, status: "success", data } satisfies ApiSuccess<T>);
}

export function sendError(res: Response, code: number, message: string): void {
  res.status(code).json({ code, status: "error", data: { error: message } } satisfies ApiError);
}
