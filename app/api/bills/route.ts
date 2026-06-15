import { fail, ok, readJson } from "@/app/api/_utils";
import { createBill } from "@/features/bill/store";
import type { BillItem, Charges, Currency, Person } from "@/features/bill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateBillBody = {
  currency?: Currency;
  people?: Person[];
  items?: BillItem[];
  charges?: Charges;
  sourceImages?: string[];
  receiptMeta?: {
    merchant?: string;
    receiptDate?: string;
    subtotal?: number;
    taxAmount?: number;
    serviceAmount?: number;
    total?: number;
    warnings: string[];
  };
};

function validateCreateBody(body: CreateBillBody | null) {
  if (!body) return;

  if (body.currency && body.currency !== "IDR") {
    throw new Error("Only IDR currency is supported.");
  }

  for (const item of body.items ?? []) {
    if (!item.name?.trim()) throw new Error("Every item needs a name.");
    if (!Number.isFinite(item.basePrice) || item.basePrice <= 0) {
      throw new Error(`Item ${item.name} needs a positive basePrice.`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`Item ${item.name} needs a positive integer quantity.`);
    }
  }

  for (const person of body.people ?? []) {
    if (!person.id?.trim()) {
      throw new Error("Every person needs an id.");
    }
  }

  if (body.charges) {
    if (body.charges.taxRate < 0 || body.charges.serviceRate < 0) {
      throw new Error("Charge rates cannot be negative.");
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CreateBillBody>(request);
    validateCreateBody(body);
    const bill = await createBill(body ?? undefined);
    return ok({ bill });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create bill.";
    return fail(400, "INVALID_BILL", message);
  }
}
