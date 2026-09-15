import { reviewSubmitSchema } from "@/lib/contracts";
import { submitReview } from "@/lib/queries";
import { jsonError, zodError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON body required", 400);
  }
  const parsed = reviewSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return zodError(parsed.error);
  }

  const result = await submitReview(parsed.data);
  if (!result.ok) {
    return jsonError(result.error, 404);
  }

  return Response.json(
    {
      reviewId: result.reviewId,
      moderationStatus: result.moderationStatus,
      message:
        "Review stored as pending. It will not appear on the hospital page until the moderation pipeline approves it.",
    },
    { status: 201 },
  );
}
