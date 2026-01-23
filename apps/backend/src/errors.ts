import type { Response } from "express";

export function sendError(res: Response, status: number, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ message, error: message, ...extra });
}

