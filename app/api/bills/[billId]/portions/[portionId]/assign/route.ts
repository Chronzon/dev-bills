import { fail, ok, readJson } from "@/app/api/_utils";
import { getBillSummary } from "@/features/bill/engine";
import { assignBillPortion } from "@/features/bill/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignBody = {
  personId: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ billId: string; portionId: string }> },
) {
  try {
    const { billId, portionId } = await params;
    const body = await readJson<AssignBody>(request);

    if (!body || !("personId" in body)) {
      return fail(400, "INVALID_ASSIGNMENT", "Provide personId or null.");
    }

    const updated = await assignBillPortion(billId, portionId, body.personId);
    if (!updated) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    return ok({ bill: updated, summary: getBillSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not assign portion.";
    return fail(400, "ASSIGN_FAILED", message);
  }
}
