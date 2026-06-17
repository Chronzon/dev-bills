import { fail, ok, readJson } from "@/app/api/_utils";
import { getBillSummary } from "@/features/bill/engine";
import { updateBillReview } from "@/features/bill/store";
import type { BillItem } from "@/features/bill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  items: BillItem[];
  charges: {
    subtotal: number;
    serviceAmount: number;
    taxAmount: number;
    total: number;
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const { billId } = await params;
    const body = await readJson<ReviewBody>(request);

    if (!body || !Array.isArray(body.items)) {
      return fail(400, "INVALID_REVIEW", "Provide an items array.");
    }

    if (!body.charges) {
      return fail(400, "INVALID_CHARGES", "Provide bill totals.");
    }

    const { subtotal, serviceAmount, taxAmount, total } = body.charges;
    if (
      !isFiniteNumber(subtotal) ||
      !isFiniteNumber(serviceAmount) ||
      !isFiniteNumber(taxAmount) ||
      !isFiniteNumber(total)
    ) {
      return fail(400, "INVALID_CHARGES", "Bill totals must be valid numbers.");
    }

    if (subtotal <= 0 || total <= 0) {
      return fail(400, "INVALID_CHARGES", "Subtotal and grand total must be positive.");
    }

    if (serviceAmount < 0 || taxAmount < 0) {
      return fail(400, "INVALID_CHARGES", "Service and tax cannot be negative.");
    }

    for (const item of body.items) {
      if (!item.name?.trim()) {
        return fail(400, "INVALID_ITEMS", "Every item needs a name.");
      }
      if (!Number.isFinite(item.basePrice) || item.basePrice <= 0) {
        return fail(400, "INVALID_ITEMS", `${item.name} needs a positive price.`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return fail(400, "INVALID_ITEMS", `${item.name} needs a positive quantity.`);
      }
    }

    const updated = await updateBillReview(billId, body.items, body.charges);
    if (!updated) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    return ok({ bill: updated, summary: getBillSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update bill.";
    return fail(400, "REVIEW_UPDATE_FAILED", message);
  }
}
