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

const damagedMilleOcr = parseReceiptLines([
  line("ill,", 0),
  line("BILLIARDS", 93),
  line("MALL ALAM SUTRA", 90),
  line("HA2605040047", 0),
  line("FACE] 3 JAM WEEKDAY +", 38),
  line("BREE 2 GELAS AIR PUTI", 46),
  line("HEELS [HH                   1     160.000", 43),
  line("b 151LLIARD REGULAR           180           0", 31),
  line("i MUEAT  : 18:09", 24),
  line("SEEFSAL: 21:10", 28),
  line("last Goreng Kampung                 29.000", 75),
  line("| [HDOMIE GORENG JUMBO         ]      16.000", 57),
  line("wil pe ara                     19.000", 52),
  line(".                              164.000", 62),
  line("[sunt                             164.000", 48),
  line("eve                               8.200", 50),
  line("PE |                              17.220", 49),
  line("mt", 20),
  line("ROUNDING", 78),
  line("TOTAL 189, 40", 74),
  line("189.420", 80),
  line("~20", 48),
]);

assert.equal(damagedMilleOcr.subtotal, 164_000);
assert.equal(damagedMilleOcr.serviceAmount, 8_200);
assert.equal(damagedMilleOcr.taxAmount, 17_220);
assert.equal(damagedMilleOcr.total, 189_420);
assert.notEqual(damagedMilleOcr.subtotal, 648_504);
assert.equal(
  damagedMilleOcr.items.some((item) => item.price === 260_504),
  false,
  "header invoice amount must not become an item",
);
assert.equal(
  itemSubtotal(damagedMilleOcr) <= 169_000,
  true,
  "noisy OCR items should stay near detected subtotal",
);

console.log("Parser fixture checks passed.");
