import { openAsBlob } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const folder = path.join(process.cwd(), "data-test-bill");
const endpoint = process.env.SCAN_ENDPOINT ?? "http://localhost:3000/api/receipts/scan";
const imagePattern = /\.(jpe?g|png|webp)$/i;
const mimeByExtension = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const requestedFile = process.env.SCAN_FILE;
const files = (await readdir(folder))
  .filter((file) => imagePattern.test(file))
  .filter((file) => !requestedFile || file === requestedFile)
  .sort();

if (files.length === 0) {
  console.log("No test bill images found.");
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(folder, file);
  const form = new FormData();
  const blob = await openAsBlob(filePath, {
    type: mimeByExtension.get(path.extname(file).toLowerCase()) ?? "image/jpeg",
  });
  form.append("images", blob, file);

  console.log(`\nScanning ${file}`);
  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
  });

  const payload = await response.json();
  if (!response.ok) {
    console.log(JSON.stringify(payload, null, 2));
    continue;
  }

  const parsed = payload.data.parsed;
  if (process.env.SHOW_RAW === "1") {
    console.log(payload.data.images.map((image) => image.text).join("\n--- image ---\n"));
  }
  console.log(
    JSON.stringify(
      {
        merchant: parsed.merchant,
        total: parsed.total,
        taxAmount: parsed.taxAmount,
        serviceAmount: parsed.serviceAmount,
        charges: parsed.charges,
        warnings: parsed.warnings,
        items: parsed.items.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          components: item.components,
          confidence: Math.round(item.confidence),
          needsReview: item.needsReview,
        })),
      },
      null,
      2,
    ),
  );
}
