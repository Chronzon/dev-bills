import type { BillItem, BillState, PersonTotal, Portion } from "./types";

export type EqualSplitRequest = {
  mode: "equal";
  parts: number;
};

export type QuantitySplitAssignment = {
  personId: string;
  quantity: number;
};

export type QuantitySplitRequest = {
  mode: "quantity";
  assignments: QuantitySplitAssignment[];
};

export type SplitRequest = EqualSplitRequest | QuantitySplitRequest;

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace(/\s/g, "");
}

export function createFullPortion(item: BillItem): Portion {
  return {
    id: `${item.id}:full`,
    itemId: item.id,
    label: getQuantityLabel(item.name, item.quantity),
    baseAmount: item.basePrice * item.quantity,
    assignedPersonId: null,
    source: "full",
    quantity: item.quantity,
    unitAmount: item.basePrice,
    splitMode: "full",
  };
}

export function splitAmount(amount: number, parts: number) {
  const whole = Math.floor(amount / parts);
  const remainder = amount - whole * parts;

  return Array.from({ length: parts }, (_, index) =>
    index === parts - 1 ? whole + remainder : whole,
  );
}

export function createSplitPortions(item: BillItem, parts: number): Portion[] {
  const amounts = splitAmount(item.basePrice * item.quantity, parts);

  return amounts.map((baseAmount, index) => ({
    id: `${item.id}:split:${index + 1}`,
    itemId: item.id,
    label: `${item.name} ${index + 1}/${parts}`,
    baseAmount,
    assignedPersonId: null,
    source: "split",
    quantity: null,
    unitAmount: null,
    splitMode: "equal",
  }));
}

export function getQuantityLabel(name: string, quantity?: number | null) {
  return quantity && quantity > 1 ? `${name} x${quantity}` : name;
}

function normalizeQuantityAssignments(
  item: BillItem,
  assignments: QuantitySplitAssignment[],
) {
  const byPerson = new Map<string, number>();
  let assignedQuantity = 0;

  for (const assignment of assignments) {
    const quantity = Math.max(0, Math.floor(assignment.quantity));
    if (!assignment.personId || quantity <= 0) continue;

    const remainingCapacity = item.quantity - assignedQuantity;
    if (remainingCapacity <= 0) break;

    const acceptedQuantity = Math.min(quantity, remainingCapacity);
    byPerson.set(
      assignment.personId,
      (byPerson.get(assignment.personId) ?? 0) + acceptedQuantity,
    );
    assignedQuantity += acceptedQuantity;
  }

  return {
    assigned: Array.from(byPerson, ([personId, quantity]) => ({ personId, quantity })),
    remainingQuantity: item.quantity - assignedQuantity,
  };
}

export function createQuantityPortions(
  item: BillItem,
  assignments: QuantitySplitAssignment[],
): Portion[] {
  const { assigned, remainingQuantity } = normalizeQuantityAssignments(item, assignments);
  const portions: Portion[] = assigned.map((assignment, index) => ({
    id: `${item.id}:quantity:${assignment.personId}:${index + 1}`,
    itemId: item.id,
    label: getQuantityLabel(item.name, assignment.quantity),
    baseAmount: item.basePrice * assignment.quantity,
    assignedPersonId: assignment.personId,
    source: "split" as const,
    quantity: assignment.quantity,
    unitAmount: item.basePrice,
    splitMode: "quantity" as const,
  }));

  if (remainingQuantity > 0) {
    portions.push({
      id: `${item.id}:quantity:remaining`,
      itemId: item.id,
      label: getQuantityLabel(item.name, remainingQuantity),
      baseAmount: item.basePrice * remainingQuantity,
      assignedPersonId: null,
      source: remainingQuantity === item.quantity ? "full" : "split",
      quantity: remainingQuantity,
      unitAmount: item.basePrice,
      splitMode: "quantity",
    });
  }

  return portions;
}

export function replaceItemWithSplitPortions(
  portions: Portion[],
  item: BillItem,
  parts: number,
) {
  const firstIndex = portions.findIndex((portion) => portion.itemId === item.id);
  const splitPortions = createSplitPortions(item, parts);
  const withoutItem = portions.filter((portion) => portion.itemId !== item.id);

  if (firstIndex < 0) {
    return [...withoutItem, ...splitPortions];
  }

  return [
    ...withoutItem.slice(0, firstIndex),
    ...splitPortions,
    ...withoutItem.slice(firstIndex),
  ];
}

export function replaceItemWithQuantityPortions(
  portions: Portion[],
  item: BillItem,
  assignments: QuantitySplitAssignment[],
) {
  const firstIndex = portions.findIndex((portion) => portion.itemId === item.id);
  const splitPortions = createQuantityPortions(item, assignments);
  const withoutItem = portions.filter((portion) => portion.itemId !== item.id);

  if (firstIndex < 0) {
    return [...withoutItem, ...splitPortions];
  }

  return [
    ...withoutItem.slice(0, firstIndex),
    ...splitPortions,
    ...withoutItem.slice(firstIndex),
  ];
}

export function replaceItemWithRequestedSplit(
  portions: Portion[],
  item: BillItem,
  request: SplitRequest,
) {
  if (request.mode === "quantity") {
    return replaceItemWithQuantityPortions(portions, item, request.assignments);
  }

  return replaceItemWithSplitPortions(portions, item, request.parts);
}

export function assignPortion(
  portions: Portion[],
  portionId: string,
  personId: string | null,
) {
  return portions.map((portion) =>
    portion.id === portionId ? { ...portion, assignedPersonId: personId } : portion,
  );
}

export function getChargeMultiplier(state: BillState) {
  if (state.charges.included) return 1;
  return 1 + state.charges.taxRate + state.charges.serviceRate;
}

export function getBillBaseSubtotal(state: BillState) {
  return (
    state.charges.subtotal ??
    state.receiptMeta?.subtotal ??
    state.items.reduce((total, item) => total + item.basePrice * item.quantity, 0)
  );
}

export function getBillChargeParts(state: BillState) {
  if (state.charges.included) {
    return {
      subtotal: getBillBaseSubtotal(state),
      serviceAmount: 0,
      taxAmount: 0,
      roundingDelta: 0,
      total: state.charges.total ?? state.receiptMeta?.total ?? getBillBaseSubtotal(state),
    };
  }

  const subtotal = getBillBaseSubtotal(state);
  const serviceAmount =
    state.charges.serviceAmount ??
    state.receiptMeta?.serviceAmount ??
    Math.round(subtotal * state.charges.serviceRate);
  const taxBase =
    state.charges.taxBase === "subtotal_plus_service" ? subtotal + serviceAmount : subtotal;
  const taxAmount =
    state.charges.taxAmount ??
    state.receiptMeta?.taxAmount ??
    Math.round(taxBase * state.charges.taxRate);
  const expectedTotal = subtotal + serviceAmount + taxAmount;
  const detectedTotal = state.charges.total ?? state.receiptMeta?.total;
  const roundingDelta =
    state.charges.roundingDelta ??
    (typeof detectedTotal === "number" ? detectedTotal - expectedTotal : 0);

  return {
    subtotal,
    serviceAmount,
    taxAmount,
    roundingDelta,
    total: detectedTotal ?? expectedTotal + roundingDelta,
  };
}

export function getRemainingTotal(state: BillState) {
  return state.portions
    .filter((portion) => !portion.assignedPersonId)
    .reduce((total, portion) => total + portion.baseAmount, 0);
}

export function getPersonTotals(state: BillState): PersonTotal[] {
  const chargeParts = getBillChargeParts(state);
  const personPortions = state.people.map((person) => ({
    person,
    portions: state.portions.filter((portion) => portion.assignedPersonId === person.id),
  }));
  const subtotals = personPortions.map(({ portions }) =>
    portions.reduce((total, portion) => total + portion.baseAmount, 0),
  );
  const denominator = Math.max(chargeParts.subtotal, 1);
  const serviceShares = allocateProportionally(
    chargeParts.serviceAmount,
    subtotals,
    denominator,
  );
  const taxShares = allocateProportionally(chargeParts.taxAmount, subtotals, denominator);
  const roundingShares = allocateProportionally(
    chargeParts.roundingDelta,
    subtotals,
    denominator,
  );

  return personPortions.map(({ person, portions }, index) => {
    const subtotal = subtotals[index];
    const serviceShare = serviceShares[index];
    const taxShare = taxShares[index];
    const roundingShare = roundingShares[index];
    const addedCharges = serviceShare + taxShare + roundingShare;
    const total = subtotal + addedCharges;

    return {
      person,
      subtotal,
      serviceShare,
      taxShare,
      roundingShare,
      addedCharges,
      total,
      portions,
    };
  });
}

export function isBillComplete(state: BillState) {
  return state.portions.every((portion) => portion.assignedPersonId);
}

export function getBillSummary(state: BillState) {
  return {
    remainingTotal: getRemainingTotal(state),
    complete: isBillComplete(state),
    multiplier: getChargeMultiplier(state),
    charges: getBillChargeParts(state),
    people: getPersonTotals(state),
  };
}

function allocateProportionally(amount: number, bases: number[], denominator: number) {
  if (amount === 0 || denominator <= 0) {
    return bases.map(() => 0);
  }

  const sign = amount < 0 ? -1 : 1;
  const absoluteAmount = Math.abs(amount);
  const exactShares = bases.map((base, index) => {
    const exact = (absoluteAmount * base) / denominator;
    const floor = Math.floor(exact);
    return {
      index,
      floor,
      remainder: exact - floor,
    };
  });
  const floorsTotal = exactShares.reduce((total, share) => total + share.floor, 0);
  const targetTotal = Math.round(
    bases.reduce((total, base) => total + (absoluteAmount * base) / denominator, 0),
  );
  let leftover = Math.max(0, targetTotal - floorsTotal);
  const result = exactShares.map((share) => share.floor);

  for (const share of [...exactShares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover <= 0) break;
    result[share.index] += 1;
    leftover -= 1;
  }

  return result.map((share) => share * sign);
}
