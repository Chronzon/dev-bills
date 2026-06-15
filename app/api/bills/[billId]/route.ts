import { fail, ok } from "@/app/api/_utils";
import { getBillWithSummary } from "@/features/bill/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  const { billId } = await params;
  const result = await getBillWithSummary(billId);

  if (!result) {
    return fail(404, "BILL_NOT_FOUND", "Bill not found.");
  }

  return ok(result);
}
