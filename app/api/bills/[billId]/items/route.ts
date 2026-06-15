import { fail, ok, readJson } from "@/app/api/_utils";
import { getBillSummary } from "@/features/bill/engine";
import { updateBillItems } from "@/features/bill/store";
import type { BillItem } from "@/features/bill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemsBody = {
  items: BillItem[];
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const { billId } = await params;
    const body = await readJson<ItemsBody>(request);

    if (!body || !Array.isArray(body.items)) {
      return fail(400, "INVALID_ITEMS", "Provide an items array.");
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

    const updated = await updateBillItems(billId, body.items);
    if (!updated) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    return ok({ bill: updated, summary: getBillSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update items.";
    return fail(400, "ITEMS_UPDATE_FAILED", message);
  }
}
