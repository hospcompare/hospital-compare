import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status: number, extra?: unknown) {
  return NextResponse.json(
    extra && typeof extra === "object"
      ? { error: message, ...extra }
      : { error: message },
    { status },
  );
}

export function zodError(error: ZodError) {
  return jsonError("Invalid request", 400, {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}
