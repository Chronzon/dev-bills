import { fail, ok, readJson } from "@/app/api/_utils";
import { getBillSummary } from "@/features/bill/engine";
import { getStoredBill, splitBillItem } from "@/features/bill/store";
import type { SplitRequest } from "@/features/bill/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LegacySplitBody = {
  parts: number;
};

type SplitBody = SplitRequest | LegacySplitBody;

function normalizeSplitRequest(body: SplitBody | null): SplitRequest | null {
  if (!body) return null;

  if ("mode" in body) {
    if (body.mode === "equal") return body;
    if (body.mode === "quantity") return body;
    return null;
  }

  if ("parts" in body) {
    return { mode: "equal", parts: body.parts };
  }

  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ billId: string; itemId: string }> },
) {
  try {
    const { billId, itemId } = await params;
    const bill = await getStoredBill(billId);
    if (!bill) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    const body = await readJson<SplitBody>(request);
    const splitRequest = normalizeSplitRequest(body);

    if (!splitRequest) {
      return fail(400, "INVALID_SPLIT", "Provide a valid split request.");
    }

    if (splitRequest.mode === "equal") {
      if (
        typeof splitRequest.parts !== "number" ||
        !Number.isInteger(splitRequest.parts) ||
        splitRequest.parts < 2
      ) {
        return fail(
          400,
          "INVALID_SPLIT",
          "Split parts must be an integer of at least 2.",
        );
      }

      if (bill.people.length > 0 && splitRequest.parts > bill.people.length) {
        return fail(400, "INVALID_SPLIT", "Split parts cannot exceed people count.");
      }
    } else {
      const item = bill.items.find((entry) => entry.id === itemId);
      if (!item) return fail(404, "ITEM_NOT_FOUND", "Item not found.");
      const personIds = new Set(bill.people.map((person) => person.id));
      const assignedQuantity = splitRequest.assignments.reduce((total, assignment) => {
        if (!personIds.has(assignment.personId)) {
          throw new Error("Every quantity assignment needs an existing person.");
        }
        if (!Number.isInteger(assignment.quantity) || assignment.quantity < 0) {
          throw new Error("Quantity assignments must be positive integers.");
        }
        return total + assignment.quantity;
      }, 0);

      if (assignedQuantity <= 0) {
        return fail(400, "INVALID_SPLIT", "Assign at least one item quantity.");
      }

      if (assignedQuantity > item.quantity) {
        return fail(400, "INVALID_SPLIT", "Assigned quantity exceeds item quantity.");
      }
    }

    const updated = await splitBillItem(billId, itemId, splitRequest);
    if (!updated) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    return ok({ bill: updated, summary: getBillSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not split item.";
    return fail(400, "SPLIT_FAILED", message);
  }
}
