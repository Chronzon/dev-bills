import { initialBillState } from "@/data/mock-bill";
import type { Prisma } from "@/features/db/generated/prisma/client";
import {
  assignPortion,
  createFullPortion,
  getBillSummary,
  replaceItemWithRequestedSplit,
  type SplitRequest,
} from "./engine";
import type { BillItem, BillState, Charges, Currency, Person, Portion } from "./types";

type StoredBill = BillState & { id: string };

const bills = new Map<string, StoredBill>();

const defaultCharges: Charges = {
  taxRate: 0,
  serviceRate: 0,
  included: true,
  taxBase: "subtotal_plus_service",
  roundingDelta: 0,
};

const hasDatabase = Boolean(process.env.DATABASE_URL);

function cloneBill<T extends BillState>(bill: T): T {
  return structuredClone(bill);
}

function slugId(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || fallback;
}

function ensureUniqueItemIds(items: BillItem[]) {
  const seen = new Map<string, number>();

  return items.map((item, index) => {
    const baseId = slugId(item.id || item.name, `item-${index + 1}`);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const uniqueBaseId = `${baseId}-${crypto.randomUUID().slice(0, 8)}`;

    return {
      ...item,
      id: count === 0 ? uniqueBaseId : `${uniqueBaseId}-${count + 1}`,
      quantity: item.quantity || 1,
    };
  });
}

function normalizeCharges(charges?: Charges, receiptMeta?: BillState["receiptMeta"]) {
  return {
    ...defaultCharges,
    ...charges,
    subtotal: charges?.subtotal ?? receiptMeta?.subtotal,
    taxAmount: charges?.taxAmount ?? receiptMeta?.taxAmount,
    serviceAmount: charges?.serviceAmount ?? receiptMeta?.serviceAmount,
    total: charges?.total ?? receiptMeta?.total,
    taxBase: charges?.taxBase ?? defaultCharges.taxBase,
    roundingDelta: charges?.roundingDelta ?? 0,
  } satisfies Charges;
}

function normalizeUpdatedItems(items: BillItem[]) {
  const seen = new Set<string>();

  return items.map((item, index) => {
    const baseId = item.id?.trim() || slugId(item.name, `item-${index + 1}`);
    const id = seen.has(baseId) ? `${baseId}-${crypto.randomUUID().slice(0, 8)}` : baseId;
    seen.add(id);

    return {
      ...item,
      id,
      name: item.name.trim(),
      basePrice: Math.round(item.basePrice),
      quantity: item.quantity || 1,
    };
  });
}

function areBillItemsEqual(currentItems: BillItem[], nextItems: BillItem[]) {
  if (currentItems.length !== nextItems.length) return false;

  return currentItems.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      item.id === nextItem.id &&
      item.name === nextItem.name &&
      item.basePrice === nextItem.basePrice &&
      item.quantity === nextItem.quantity
    );
  });
}

function normalizeManualCharges(charges: {
  subtotal: number;
  serviceAmount: number;
  taxAmount: number;
  total: number;
}) {
  const subtotal = Math.round(charges.subtotal);
  const serviceAmount = Math.round(charges.serviceAmount);
  const taxAmount = Math.round(charges.taxAmount);
  const total = Math.round(charges.total);

  if (subtotal <= 0) throw new Error("Subtotal must be greater than zero.");
  if (total <= 0) throw new Error("Grand total must be greater than zero.");
  if (serviceAmount < 0) throw new Error("Service cannot be negative.");
  if (taxAmount < 0) throw new Error("Tax cannot be negative.");

  return {
    taxRate:
      subtotal + serviceAmount > 0
        ? Number((taxAmount / (subtotal + serviceAmount)).toFixed(4))
        : 0,
    serviceRate: Number((serviceAmount / subtotal).toFixed(4)),
    included: false,
    subtotal,
    serviceAmount,
    taxAmount,
    total,
    taxBase: "subtotal_plus_service" as const,
    roundingDelta: total - subtotal - serviceAmount - taxAmount,
  } satisfies Charges;
}

function normalizeCreateInput(input?: {
  currency?: Currency;
  people?: Person[];
  items?: BillItem[];
  charges?: Charges;
  sourceImages?: string[];
  receiptMeta?: BillState["receiptMeta"];
}) {
  if (!input) {
    return cloneBill(initialBillState);
  }

  const items = ensureUniqueItemIds(input.items ?? []);

  return {
    currency: input.currency ?? "IDR",
    people: input.people ?? [],
    items,
    portions: items.map(createFullPortion),
    charges: normalizeCharges(input.charges, input.receiptMeta),
    sourceImages: input.sourceImages,
    receiptMeta: input.receiptMeta,
  } satisfies BillState;
}

function withRequestedSplitPortionsInPlace(
  portions: Portion[],
  item: BillItem,
  request: SplitRequest,
) {
  return replaceItemWithRequestedSplit(portions, item, request);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function normalizePortionSplitMode(
  splitMode: string | null | undefined,
  source: string,
): Portion["splitMode"] {
  if (splitMode === "full" || splitMode === "equal" || splitMode === "quantity") {
    return splitMode;
  }

  return source === "split" ? "equal" : "full";
}

async function db() {
  const prismaModule = await import("@/features/db/prisma");
  return prismaModule.prisma;
}

function createMemoryBill(input?: Parameters<typeof normalizeCreateInput>[0]) {
  const id = crypto.randomUUID();
  const bill = normalizeCreateInput(input) as StoredBill;
  bill.id = id;
  bills.set(id, bill);
  return cloneBill(bill);
}

function getMemoryBill(id: string) {
  const bill = bills.get(id);
  return bill ? cloneBill(bill) : null;
}

function splitMemoryBillItem(id: string, itemId: string, request: SplitRequest) {
  const bill = bills.get(id);
  if (!bill) return null;

  const item = bill.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Item not found");

  bill.portions = withRequestedSplitPortionsInPlace(bill.portions, item, request);
  return cloneBill(bill);
}

function assignMemoryBillPortion(
  id: string,
  portionId: string,
  personId: string | null,
) {
  const bill = bills.get(id);
  if (!bill) return null;

  if (personId && !bill.people.some((person) => person.id === personId)) {
    throw new Error("Person not found");
  }

  if (!bill.portions.some((portion) => portion.id === portionId)) {
    throw new Error("Portion not found");
  }

  bill.portions = assignPortion(bill.portions, portionId, personId);
  return cloneBill(bill);
}

function updateMemoryBillPeople(id: string, people: Person[]) {
  const bill = bills.get(id);
  if (!bill) return null;

  const nextPersonIds = new Set(people.map((person) => person.id));
  bill.people = people;
  bill.portions = bill.portions.map((portion) =>
    portion.assignedPersonId && !nextPersonIds.has(portion.assignedPersonId)
      ? { ...portion, assignedPersonId: null }
      : portion,
  );

  return cloneBill(bill);
}

function updateMemoryBillItems(id: string, items: BillItem[]) {
  const bill = bills.get(id);
  if (!bill) return null;

  const nextItems = normalizeUpdatedItems(items);
  bill.items = nextItems;
  bill.portions = nextItems.map(createFullPortion);
  return cloneBill(bill);
}

function updateMemoryBillReview(
  id: string,
  items: BillItem[],
  charges: Parameters<typeof normalizeManualCharges>[0],
) {
  const bill = bills.get(id);
  if (!bill) return null;

  const nextItems = normalizeUpdatedItems(items);
  const nextCharges = normalizeManualCharges(charges);
  const itemsChanged = !areBillItemsEqual(bill.items, nextItems);

  bill.items = nextItems;
  bill.charges = nextCharges;
  bill.receiptMeta = {
    ...bill.receiptMeta,
    subtotal: nextCharges.subtotal,
    taxAmount: nextCharges.taxAmount,
    serviceAmount: nextCharges.serviceAmount,
    total: nextCharges.total,
    warnings: bill.receiptMeta?.warnings ?? [],
  };

  if (itemsChanged) {
    bill.portions = nextItems.map(createFullPortion);
  }

  return cloneBill(bill);
}

type DbBill = Prisma.BillGetPayload<{
  include: {
    people: true;
    items: true;
    portions: true;
  };
}>;

function mapDbBill(record: NonNullable<DbBill>): StoredBill {
  return {
    id: record.id,
    currency: record.currency as Currency,
    people: [...record.people]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((person) => ({
        id: person.id,
        name: person.name,
        accent: person.accent,
      })),
    items: [...record.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        name: item.name,
        basePrice: item.basePrice,
        quantity: item.quantity,
        components: toStringArray(item.components),
        confidence: item.confidence ?? undefined,
        needsReview: item.needsReview ?? undefined,
        rawLines: toStringArray(item.rawLines),
      })),
    portions: [...record.portions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((portion) => ({
        id: portion.id,
        itemId: portion.itemId,
        label: portion.label,
        baseAmount: portion.baseAmount,
        assignedPersonId: portion.assignedPersonId,
        source: portion.source as Portion["source"],
        quantity: portion.quantity,
        unitAmount: portion.unitAmount,
        splitMode: normalizePortionSplitMode(portion.splitMode, portion.source),
      })),
    charges: {
      taxRate: record.taxRate,
      serviceRate: record.serviceRate,
      included: record.chargesIncluded,
      subtotal: record.subtotal ?? undefined,
      taxAmount: record.taxAmount ?? undefined,
      serviceAmount: record.serviceAmount ?? undefined,
      total: record.total ?? undefined,
      taxBase: (record.taxBase ?? "subtotal_plus_service") as Charges["taxBase"],
      roundingDelta: record.roundingDelta ?? 0,
    },
    sourceImages: toStringArray(record.sourceImages),
    receiptMeta: {
      merchant: record.merchant ?? undefined,
      receiptDate: record.receiptDate ?? undefined,
      subtotal: record.subtotal ?? undefined,
      taxAmount: record.taxAmount ?? undefined,
      serviceAmount: record.serviceAmount ?? undefined,
      total: record.total ?? undefined,
      warnings: toStringArray(record.warnings) ?? [],
    },
  };
}

async function findDbBill(id: string) {
  const prisma = await db();
  const record = await prisma.bill.findUnique({
    where: { id },
    include: {
      people: true,
      items: true,
      portions: true,
    },
  });

  return record ? mapDbBill(record) : null;
}

async function writeDbBill(input?: Parameters<typeof normalizeCreateInput>[0]) {
  const prisma = await db();
  const id = crypto.randomUUID();
  const bill = normalizeCreateInput(input);

  await prisma.bill.create({
    data: {
      id,
      currency: bill.currency,
      taxRate: bill.charges.taxRate,
      serviceRate: bill.charges.serviceRate,
      chargesIncluded: bill.charges.included,
      sourceImages: bill.sourceImages,
      merchant: bill.receiptMeta?.merchant,
      receiptDate: bill.receiptMeta?.receiptDate,
      subtotal: bill.charges.subtotal ?? bill.receiptMeta?.subtotal,
      taxAmount: bill.charges.taxAmount ?? bill.receiptMeta?.taxAmount,
      serviceAmount: bill.charges.serviceAmount ?? bill.receiptMeta?.serviceAmount,
      total: bill.charges.total ?? bill.receiptMeta?.total,
      taxBase: bill.charges.taxBase,
      roundingDelta: bill.charges.roundingDelta,
      warnings: bill.receiptMeta?.warnings ?? [],
      people: {
        create: bill.people.map((person, index) => ({
          id: person.id,
          name: person.name,
          accent: person.accent,
          sortOrder: index,
        })),
      },
      items: {
        create: bill.items.map((item, index) => ({
          id: item.id,
          name: item.name,
          basePrice: item.basePrice,
          quantity: item.quantity,
          components: item.components,
          confidence: item.confidence,
          needsReview: item.needsReview,
          rawLines: item.rawLines,
          sortOrder: index,
        })),
      },
      portions: {
        create: bill.portions.map((portion, index) => ({
          id: portion.id,
          itemId: portion.itemId,
          label: portion.label,
          baseAmount: portion.baseAmount,
          assignedPersonId: portion.assignedPersonId,
          source: portion.source,
          quantity: portion.quantity,
          unitAmount: portion.unitAmount,
          splitMode: normalizePortionSplitMode(portion.splitMode, portion.source),
          sortOrder: index,
        })),
      },
    },
  });

  const created = await findDbBill(id);
  if (!created) throw new Error("Could not read created bill.");
  return created;
}

export async function createBill(input?: Parameters<typeof normalizeCreateInput>[0]) {
  if (!hasDatabase) return createMemoryBill(input);
  return writeDbBill(input);
}

export async function getBill(id: string) {
  if (!hasDatabase) return getMemoryBill(id);
  return findDbBill(id);
}

export async function getStoredBill(id: string) {
  return getBill(id);
}

export async function getBillWithSummary(id: string) {
  const bill = await getBill(id);
  if (!bill) return null;
  return { bill, summary: getBillSummary(bill) };
}

export async function splitBillItem(id: string, itemId: string, request: SplitRequest) {
  if (!hasDatabase) return splitMemoryBillItem(id, itemId, request);

  const bill = await findDbBill(id);
  if (!bill) return null;

  const item = bill.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Item not found");

  const nextPortions = withRequestedSplitPortionsInPlace(bill.portions, item, request);
  const prisma = await db();

  await prisma.$transaction([
    prisma.portion.deleteMany({ where: { billId: id, itemId } }),
    ...nextPortions
      .filter((portion) => portion.itemId === itemId)
      .map((portion) =>
        prisma.portion.create({
          data: {
            id: portion.id,
            billId: id,
            itemId: portion.itemId,
            label: portion.label,
            baseAmount: portion.baseAmount,
            assignedPersonId: portion.assignedPersonId,
            source: portion.source,
            quantity: portion.quantity,
            unitAmount: portion.unitAmount,
            splitMode: normalizePortionSplitMode(portion.splitMode, portion.source),
            sortOrder: nextPortions.findIndex((entry) => entry.id === portion.id),
          },
        }),
      ),
  ]);

  return findDbBill(id);
}

export async function assignBillPortion(
  id: string,
  portionId: string,
  personId: string | null,
) {
  if (!hasDatabase) return assignMemoryBillPortion(id, portionId, personId);

  const bill = await findDbBill(id);
  if (!bill) return null;

  if (personId && !bill.people.some((person) => person.id === personId)) {
    throw new Error("Person not found");
  }

  if (!bill.portions.some((portion) => portion.id === portionId)) {
    throw new Error("Portion not found");
  }

  const prisma = await db();
  await prisma.portion.update({
    where: { id: portionId },
    data: { assignedPersonId: personId },
  });

  return findDbBill(id);
}

export async function updateBillPeople(id: string, people: Person[]) {
  if (!hasDatabase) return updateMemoryBillPeople(id, people);

  const bill = await findDbBill(id);
  if (!bill) return null;

  const nextPersonIds = new Set(people.map((person) => person.id));
  const prisma = await db();

  await prisma.$transaction([
    prisma.portion.updateMany({
      where: {
        billId: id,
        assignedPersonId: { notIn: people.map((person) => person.id) },
      },
      data: { assignedPersonId: null },
    }),
    prisma.person.deleteMany({
      where: {
        billId: id,
        id: { notIn: people.map((person) => person.id) },
      },
    }),
    ...people.map((person, index) =>
      prisma.person.upsert({
        where: { id: person.id },
        create: {
          id: person.id,
          billId: id,
          name: person.name,
          accent: person.accent,
          sortOrder: index,
        },
        update: {
          name: person.name,
          accent: person.accent,
          sortOrder: index,
        },
      }),
    ),
  ]);

  const updated = await findDbBill(id);
  if (!updated) return null;

  return {
    ...updated,
    portions: updated.portions.map((portion) =>
      portion.assignedPersonId && !nextPersonIds.has(portion.assignedPersonId)
        ? { ...portion, assignedPersonId: null }
        : portion,
    ),
  };
}

export async function updateBillItems(id: string, items: BillItem[]) {
  if (!hasDatabase) return updateMemoryBillItems(id, items);

  const bill = await findDbBill(id);
  if (!bill) return null;

  const nextItems = normalizeUpdatedItems(items);
  const nextPortions = nextItems.map(createFullPortion);
  const prisma = await db();

  await prisma.$transaction([
    prisma.portion.deleteMany({ where: { billId: id } }),
    prisma.billItem.deleteMany({ where: { billId: id } }),
    ...nextItems.map((item, index) =>
      prisma.billItem.create({
        data: {
          id: item.id,
          billId: id,
          name: item.name,
          basePrice: item.basePrice,
          quantity: item.quantity,
          components: item.components,
          confidence: item.confidence,
          needsReview: item.needsReview,
          rawLines: item.rawLines,
          sortOrder: index,
        },
      }),
    ),
    ...nextPortions.map((portion, index) =>
      prisma.portion.create({
        data: {
          id: portion.id,
          billId: id,
          itemId: portion.itemId,
          label: portion.label,
          baseAmount: portion.baseAmount,
          assignedPersonId: null,
          source: portion.source,
          quantity: portion.quantity,
          unitAmount: portion.unitAmount,
          splitMode: normalizePortionSplitMode(portion.splitMode, portion.source),
          sortOrder: index,
        },
      }),
    ),
  ]);

  return findDbBill(id);
}

export async function updateBillReview(
  id: string,
  items: BillItem[],
  charges: Parameters<typeof normalizeManualCharges>[0],
) {
  if (!hasDatabase) return updateMemoryBillReview(id, items, charges);

  const bill = await findDbBill(id);
  if (!bill) return null;

  const nextItems = normalizeUpdatedItems(items);
  const nextCharges = normalizeManualCharges(charges);
  const itemsChanged = !areBillItemsEqual(bill.items, nextItems);
  const prisma = await db();

  const billUpdate = prisma.bill.update({
    where: { id },
    data: {
      taxRate: nextCharges.taxRate,
      serviceRate: nextCharges.serviceRate,
      chargesIncluded: nextCharges.included,
      subtotal: nextCharges.subtotal,
      taxAmount: nextCharges.taxAmount,
      serviceAmount: nextCharges.serviceAmount,
      total: nextCharges.total,
      taxBase: nextCharges.taxBase,
      roundingDelta: nextCharges.roundingDelta,
    },
  });

  if (!itemsChanged) {
    await billUpdate;
    return findDbBill(id);
  }

  const nextPortions = nextItems.map(createFullPortion);

  await prisma.$transaction([
    billUpdate,
    prisma.portion.deleteMany({ where: { billId: id } }),
    prisma.billItem.deleteMany({ where: { billId: id } }),
    ...nextItems.map((item, index) =>
      prisma.billItem.create({
        data: {
          id: item.id,
          billId: id,
          name: item.name,
          basePrice: item.basePrice,
          quantity: item.quantity,
          components: item.components,
          confidence: item.confidence,
          needsReview: item.needsReview,
          rawLines: item.rawLines,
          sortOrder: index,
        },
      }),
    ),
    ...nextPortions.map((portion, index) =>
      prisma.portion.create({
        data: {
          id: portion.id,
          billId: id,
          itemId: portion.itemId,
          label: portion.label,
          baseAmount: portion.baseAmount,
          assignedPersonId: null,
          source: portion.source,
          quantity: portion.quantity,
          unitAmount: portion.unitAmount,
          splitMode: normalizePortionSplitMode(portion.splitMode, portion.source),
          sortOrder: index,
        },
      }),
    ),
  ]);

  return findDbBill(id);
}
