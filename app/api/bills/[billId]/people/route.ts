import { fail, ok, readJson } from "@/app/api/_utils";
import { getBillSummary } from "@/features/bill/engine";
import { updateBillPeople } from "@/features/bill/store";
import type { Person } from "@/features/bill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PeopleBody = {
  people: Person[];
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const { billId } = await params;
    const body = await readJson<PeopleBody>(request);

    if (!body || !Array.isArray(body.people)) {
      return fail(400, "INVALID_PEOPLE", "Provide a people array.");
    }

    const seen = new Set<string>();
    for (const person of body.people) {
      if (!person.id?.trim()) {
        return fail(400, "INVALID_PEOPLE", "Every person needs an id.");
      }
      if (seen.has(person.id)) {
        return fail(400, "INVALID_PEOPLE", `Duplicate person id: ${person.id}`);
      }
      seen.add(person.id);
    }

    const updated = await updateBillPeople(billId, body.people);
    if (!updated) return fail(404, "BILL_NOT_FOUND", "Bill not found.");

    return ok({ bill: updated, summary: getBillSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update people.";
    return fail(400, "PEOPLE_UPDATE_FAILED", message);
  }
}
