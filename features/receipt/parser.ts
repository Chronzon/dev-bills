import type { BillItem, BillState, Charges } from "@/features/bill/types";
import type { OcrLine, ParsedReceipt, ParsedReceiptItem } from "./types";

const nonItemPattern =
  /\b(date|time|table|cashier|thank|visit|duplicate|invoice|order|ord|bill|receipt|alamat|name|no hp|phone|telp|tlp|delivery|cashless|kartuku|change|payment|paid|items count|total item|subtotal|sub total|take.?out total|net sales|total|tax|pajak|service|svc|pb1|pbl|rounding|discount|instagram|email|print no|staff open|npp|crew|ref|pax|sales type|print cnt|contact|payment)\b/i;

const totalPattern = /\b(grand\s*)?total\b|take.?out total/i;
const subtotalPattern = /\bsub\s*total|subtotal\b|subttl\b|net sales/i;
const taxPattern = /\btax\b|pajak|pb[1li]\b/i;
const servicePattern = /\bservice\b|\bsvc\b/i;
const discountPattern = /\bdiscount|disc\b/i;
const chargeBoundaryPattern =
  /\b(sub\s*total|subtotal|subttl|grand\s*total|total|ttl|take.?out total|tax|pajak|pb[1li]|service|svc|payment|paid|cash|card|debit|credit|qris|rounding)\b/i;
const explicitTotalPattern = /\b(grand\s*)?total\b|\bttl\b|take.?out total/i;

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOcrDigits(value: string) {
  return value
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[Ss]/g, "5");
}

function parseMoney(value: string) {
  const digits = normalizeOcrDigits(value).replace(/[^\d]/g, "");
  if (digits.length < 3) return null;
  if (digits.length > 6 && !/[.,]/.test(value)) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function moneyCandidates(line: string) {
  const matches =
    line.match(/(?:rp\.?\s*)?(?:[\dOoIlSs]{1,3}(?:[.,][\dOoIlSs]{3})+|[\dOoIlSs]{4,6})/gi) ??
    [];

  return matches
    .map((raw) => ({ raw, amount: parseMoney(raw) }))
    .filter((entry): entry is { raw: string; amount: number } => entry.amount !== null)
    .filter((entry) => entry.amount >= 1000);
}

function stripQuantityPrefix(value: string) {
  return normalizeSpaces(value.replace(/^\d+\s*[xX]?\s+/, ""));
}

function getQuantityPrefix(value: string) {
  const match = value.match(/^(\d+)\s*[xX]?\s+/);
  if (!match) return 1;
  const quantity = Number.parseInt(match[1], 10);
  return Number.isInteger(quantity) && quantity > 0 && quantity < 100 ? quantity : 1;
}

function slugId(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || fallback;
}

function cleanItemName(rawName: string) {
  return stripQuantityPrefix(
    rawName
      .replace(/^[^a-z0-9]+/i, "")
      .replace(/^[a-z]\s+/i, "")
      .replace(/^(?:j|p|ft|lt|bo|ee|re|e:)\s+/i, "")
      .replace(/\brp\.?$/i, "")
      .replace(/\bx\s*\d+$/i, "")
      .replace(/[-:]+$/g, ""),
  );
}

function inferMerchant(lines: OcrLine[]) {
  const candidates = lines
    .map((line) => line.text)
    .filter((text) => /[a-z]/i.test(text))
    .filter((text) => moneyCandidates(text).length === 0)
    .filter((text) => !/^\*+$/.test(text))
    .filter(
      (text) =>
        !/(date|time|table|invoice|order|tax|total|duplicate|npp|crew|print no|staff open|ref|phone|tlp)/i.test(
          text,
        ),
    )
    .filter((text) => {
      const letters = text.replace(/[^a-z]/gi, "").length;
      const noisy = text.replace(/[a-z\s.'&-]/gi, "").length;
      return letters >= 4 && noisy <= letters;
    });

  return candidates[0] ? normalizeSpaces(candidates[0]) : undefined;
}

function inferDate(lines: OcrLine[]) {
  const dateLine = lines.find((line) =>
    /\b\d{1,2}[-/ ](?:\d{1,2}|jan|feb|mar|apr|mei|may|jun|jul|aug|sep|oct|nov|dec|okt)[-/ ]\d{2,4}\b/i.test(
      line.text,
    ),
  );

  return dateLine ? normalizeSpaces(dateLine.text) : undefined;
}

function getLastMoney(line: string) {
  const candidates = moneyCandidates(line);
  return candidates.at(-1)?.amount;
}

function getExplicitCharges(lines: Array<{ text: string; confidence: number }>) {
  let subtotal: number | undefined;
  let taxAmount: number | undefined;
  let serviceAmount: number | undefined;
  let total: number | undefined;

  for (const line of lines) {
    const lower = line.text.toLowerCase();
    const lastMoney = getLastMoney(line.text);
    if (!lastMoney) continue;

    if (subtotalPattern.test(lower)) {
      subtotal = lastMoney;
      continue;
    }

    if (taxPattern.test(lower)) {
      taxAmount = lastMoney;
      continue;
    }

    if (servicePattern.test(lower)) {
      serviceAmount = lastMoney;
      continue;
    }

    if (explicitTotalPattern.test(lower)) {
      total = lastMoney;
    }
  }

  return { subtotal, taxAmount, serviceAmount, total };
}

function isLikelyComponent(line: string) {
  return (
    /^\d+\s+\S+/.test(line) &&
    moneyCandidates(line).length === 0 &&
    !nonItemPattern.test(line)
  );
}

function isLikelyNameLine(line: string) {
  if (nonItemPattern.test(line)) return false;
  if (moneyCandidates(line).length > 0) return false;
  if (!/[a-z]/i.test(line)) return false;
  if (line.length < 3 || line.length > 60) return false;
  if (/^[^a-z0-9]+/i.test(line)) return false;

  const letters = line.replace(/[^a-z]/gi, "").length;
  const noisy = line.replace(/[a-z\s().'&/-]/gi, "").length;
  return letters >= 3 && noisy <= Math.max(2, letters * 0.25);
}

function isLooseAmountLine(line: string) {
  const candidates = moneyCandidates(line);
  if (candidates.length !== 1) return false;

  const remainder = line
    .replace(candidates[0].raw, "")
    .replace(/rp\.?/gi, "")
    .replace(/[^\w]/g, "")
    .trim();

  return remainder.length === 0;
}

function isClearItemAfterChargeBoundary(line: string, firstMoneyRaw: string) {
  const namePart = cleanItemName(line.slice(0, line.indexOf(firstMoneyRaw)));
  if (!namePart || nonItemPattern.test(namePart)) return false;
  if (!/^\d+\s*[xX]?\s+\S+/.test(line)) return false;
  return /[a-z]/i.test(namePart) && namePart.replace(/[^a-z]/gi, "").length >= 3;
}

function isPlausibleItem(name: string, amount: number) {
  if (amount < 1000 || amount > 2_000_000) return false;
  const letters = name.replace(/[^a-z]/gi, "").length;
  const noisy = name.replace(/[a-z0-9\s().'&/-]/gi, "").length;
  if (letters < 2) return false;
  if (noisy > Math.max(1, letters * 0.35)) return false;
  if (/^\W*[a-z]{1,3}\W*$/i.test(name)) return false;
  return true;
}

function toBillItems(items: ParsedReceiptItem[]): BillItem[] {
  return items
    .filter((item) => item.isChargeable)
    .map((item) => ({
      id: item.id,
      name: item.name,
      basePrice: item.price,
      quantity: item.quantity,
      components: item.components,
      confidence: item.confidence,
      needsReview: item.needsReview,
      rawLines: item.rawLines,
    }));
}

function inferCharges(input: {
  subtotal?: number;
  serviceAmount?: number;
  taxAmount?: number;
  total?: number;
}): Charges {
  const subtotal = input.subtotal;
  const serviceAmount = input.serviceAmount ?? 0;
  const taxAmount = input.taxAmount ?? 0;
  const total = input.total;
  const included =
    total !== undefined &&
    subtotal !== undefined &&
    serviceAmount === 0 &&
    taxAmount === 0 &&
    Math.abs(total - subtotal) <= 2;
  const serviceRate =
    subtotal && subtotal > 0 && serviceAmount > 0
      ? Number((serviceAmount / subtotal).toFixed(4))
      : 0;
  const plusServiceBase =
    subtotal && subtotal > 0 ? subtotal + Math.max(0, serviceAmount) : undefined;
  const plusServiceTaxRate =
    plusServiceBase && plusServiceBase > 0 && taxAmount > 0
      ? taxAmount / plusServiceBase
      : 0;
  const subtotalTaxRate =
    subtotal && subtotal > 0 && taxAmount > 0 ? taxAmount / subtotal : 0;
  const plusServiceLooksIndonesian =
    Math.abs(plusServiceTaxRate - 0.1) <= Math.abs(subtotalTaxRate - 0.1);
  const taxBase =
    serviceAmount > 0 && plusServiceLooksIndonesian
      ? ("subtotal_plus_service" as const)
      : ("subtotal" as const);
  const taxRate =
    taxBase === "subtotal_plus_service"
      ? Number(plusServiceTaxRate.toFixed(4))
      : Number(subtotalTaxRate.toFixed(4));
  const expectedTotal =
    subtotal !== undefined ? subtotal + serviceAmount + taxAmount : undefined;
  const roundingDelta =
    total !== undefined && expectedTotal !== undefined ? total - expectedTotal : 0;

  return {
    taxRate: included ? 0 : taxRate,
    serviceRate: included ? 0 : serviceRate,
    included,
    subtotal,
    serviceAmount,
    taxAmount,
    total,
    taxBase,
    roundingDelta,
  };
}

export function parseReceiptLines(lines: OcrLine[]): ParsedReceipt {
  const cleanedLines = lines
    .map((line) => ({
      text: normalizeSpaces(line.text),
      confidence: line.confidence,
    }))
    .filter((line) => line.text.length > 0);

  const warnings: string[] = [];
  const items: ParsedReceiptItem[] = [];
  const explicitCharges = getExplicitCharges(cleanedLines);
  let subtotal = explicitCharges.subtotal;
  let taxAmount = explicitCharges.taxAmount;
  let serviceAmount = explicitCharges.serviceAmount;
  let total = explicitCharges.total;
  let lastChargeable: ParsedReceiptItem | null = null;
  let pendingNameParts: string[] = [];
  let chargeBoundaryReached = false;
  let warnedAboutRejectedOverflow = false;
  const looseAmounts: number[] = [];
  const strongestDetectedSubtotal = subtotal ?? total;

  for (const [lineIndex, line] of cleanedLines.entries()) {
    const text = line.text;
    const lower = text.toLowerCase();
    const lastMoney = getLastMoney(text);
    const candidates = moneyCandidates(text);

    if (discountPattern.test(lower)) {
      pendingNameParts = [];
      continue;
    }

    if (subtotalPattern.test(lower) && lastMoney) {
      subtotal = lastMoney;
      pendingNameParts = [];
      chargeBoundaryReached = true;
      continue;
    }

    if (taxPattern.test(lower) && lastMoney) {
      taxAmount = lastMoney;
      pendingNameParts = [];
      chargeBoundaryReached = true;
      continue;
    }

    if (servicePattern.test(lower) && lastMoney) {
      serviceAmount = lastMoney;
      pendingNameParts = [];
      chargeBoundaryReached = true;
      continue;
    }

    if (explicitTotalPattern.test(lower) && lastMoney) {
      total = lastMoney;
      pendingNameParts = [];
      chargeBoundaryReached = true;
      continue;
    }

    if (chargeBoundaryPattern.test(lower)) {
      pendingNameParts = [];
      chargeBoundaryReached = true;
      continue;
    }

    if (isLikelyComponent(text) && lastChargeable) {
      const component = stripQuantityPrefix(text);
      lastChargeable.components.push(component);
      lastChargeable.rawLines.push(text);
      continue;
    }

    if (isLooseAmountLine(text) && lastMoney) {
      looseAmounts.push(lastMoney);
      pendingNameParts = [];
      continue;
    }

    if (
      lineIndex < 8 &&
      moneyCandidates(text).length === 0 &&
      /\b(coffee|kitchen|restaurant|resto|cafe|bar)\b/i.test(text)
    ) {
      pendingNameParts = [];
      continue;
    }

    if (candidates.length === 0 || nonItemPattern.test(lower)) {
      if (isLikelyNameLine(text)) {
        pendingNameParts.push(stripQuantityPrefix(text));
      } else if (/^[\W_]+$/.test(text)) {
        continue;
      } else {
        pendingNameParts = [];
      }
      continue;
    }

    const amount = candidates.at(-1)?.amount;
    const firstCandidate = candidates[0];
    if (!amount || !firstCandidate) continue;

    if (
      chargeBoundaryReached &&
      !isClearItemAfterChargeBoundary(text, firstCandidate.raw)
    ) {
      pendingNameParts = [];
      continue;
    }

    const namePart = text.slice(0, text.indexOf(firstCandidate.raw));
    const cleanedInlineName = cleanItemName(namePart);
    const inlineName = /^\d+$/.test(cleanedInlineName) ? "" : cleanedInlineName;
    const pendingName = normalizeSpaces(pendingNameParts.join(" "));
    const name =
      inlineName && pendingName
        ? normalizeSpaces(`${pendingName} ${inlineName}`)
        : inlineName || pendingName;
    const quantity = Math.max(getQuantityPrefix(namePart), getQuantityPrefix(text));
    const price =
      quantity > 1 && amount % quantity === 0 ? Math.round(amount / quantity) : amount;
    pendingNameParts = [];

    if (!name || name.length < 2 || /^\d+$/.test(name)) {
      continue;
    }

    if (!isPlausibleItem(name, price)) {
      continue;
    }

    const lineTotal = price * quantity;
    const projectedSubtotal =
      items.reduce((sum, item) => sum + item.price * item.quantity, 0) + lineTotal;
    if (
      strongestDetectedSubtotal &&
      projectedSubtotal > Math.max(strongestDetectedSubtotal * 1.25, strongestDetectedSubtotal + 20_000)
    ) {
      if (!warnedAboutRejectedOverflow) {
        warnings.push(
          "Some OCR item rows were ignored because they exceed the detected receipt subtotal.",
        );
        warnedAboutRejectedOverflow = true;
      }
      continue;
    }

    const item: ParsedReceiptItem = {
      id: slugId(name, `item-${items.length + 1}`),
      name,
      price,
      quantity,
      isChargeable: true,
      parentItemId: null,
      components: [],
      confidence: line.confidence,
      needsReview: line.confidence < 65 || candidates.length > 2,
      rawLines: [text],
    };

    items.push(item);
    lastChargeable = item;
  }

  const baseSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!subtotal && baseSubtotal > 0) subtotal = baseSubtotal;

  if (!explicitCharges.total && !total && subtotal) {
    for (let index = looseAmounts.length - 1; index >= 0; index -= 1) {
      if (looseAmounts[index] >= subtotal) {
        total = looseAmounts[index];
        break;
      }
    }
  }

  if (!taxAmount && total && subtotal) {
    const inferredTax = total - subtotal - (serviceAmount ?? 0);
    if (inferredTax > 0 && inferredTax <= subtotal * 0.25) {
      taxAmount = inferredTax;
    }
  }

  const charges = inferCharges({
    subtotal,
    taxAmount,
    serviceAmount,
    total,
  });

  if (items.length === 0) {
    warnings.push("No chargeable item rows were detected. Manual review is required.");
  }

  if (explicitCharges.subtotal && baseSubtotal > 0) {
    const delta = Math.abs(baseSubtotal - explicitCharges.subtotal);
    if (delta > Math.max(1000, explicitCharges.subtotal * 0.03)) {
      warnings.push("OCR item subtotal conflicts with the detected receipt subtotal.");
    }
  }

  if (total && subtotal && !charges.included) {
    const expected = subtotal + (taxAmount ?? 0) + (serviceAmount ?? 0);
    if (Math.abs(expected - total) > Math.max(1000, total * 0.03)) {
      warnings.push("Detected totals do not reconcile cleanly with item subtotal.");
    }
  }

  return {
    merchant: inferMerchant(cleanedLines),
    receiptDate: inferDate(cleanedLines),
    items,
    charges,
    subtotal,
    taxAmount,
    serviceAmount,
    total,
    rawLines: cleanedLines,
    warnings,
  };
}

export function parsedReceiptToBill(
  parsed: ParsedReceipt,
  sourceImages: string[],
): BillState {
  return {
    currency: "IDR" as const,
    people: [],
    items: toBillItems(parsed.items),
    portions: [],
    charges: parsed.charges,
    sourceImages,
    receiptMeta: {
      merchant: parsed.merchant,
      receiptDate: parsed.receiptDate,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      serviceAmount: parsed.serviceAmount,
      total: parsed.total,
      warnings: parsed.warnings,
    },
  };
}
