import assert from "node:assert/strict";
import { parseReceiptLines } from "../features/receipt/parser.ts";

function line(text, confidence = 82) {
  return { text, confidence };
}

function itemSubtotal(parsed) {
  return parsed.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

const milleLikeLines = [
  line("MILLE RESTAURANT"),
  line("Table 12 Pax 4"),
  line("1 NASI AYAM 48.000"),
  line("2 ES TEH 36.000"),
  line("1 KOPI SUSU 42.000"),
  line("1 ROTI BAKAR 63.420"),
  line("SUBTTL 189.420"),
  line("SVC 8.200"),
  line("PB1 17.220"),
  line("TTL 189.400"),
  line("CASH 200.000"),
  line("CHANGE 10.600"),
  line("648.504"),
  line("Payment approved"),
];

const parsedMille = parseReceiptLines(milleLikeLines);

assert.equal(parsedMille.subtotal, 189_420);
assert.equal(parsedMille.serviceAmount, 8_200);
assert.equal(parsedMille.taxAmount, 17_220);
assert.equal(parsedMille.total, 189_400);
assert.notEqual(parsedMille.subtotal, 648_504);
assert.equal(itemSubtotal(parsedMille), 189_420);
assert.equal(
  parsedMille.items.some((item) => item.price === 648_504),
  false,
  "loose amount after total must not become an item",
);

const noisyAfterTotal = parseReceiptLines([
  line("CAFE SAMPLE"),
  line("1 LATTE 35.000"),
  line("SUBTTL 35.000"),
  line("TOTAL 38.500"),
  line("AUTH CODE 12345"),
  line("1 PAYMENT CARD 38.500"),
]);

assert.equal(noisyAfterTotal.items.length, 1);
assert.equal(noisyAfterTotal.items[0].name, "LATTE");

const divergentSubtotal = parseReceiptLines([
  line("MILLE RESTAURANT"),
  line("1 NASI AYAM 48.000"),
  line("SUBTTL 189.420"),
  line("SVC 8.200"),
  line("PB1 17.220"),
  line("TOTAL 214.840"),
]);

assert.equal(
  divergentSubtotal.warnings.includes(
    "OCR item subtotal conflicts with the detected receipt subtotal.",
  ),
  true,
);

console.log("Parser fixture checks passed.");
