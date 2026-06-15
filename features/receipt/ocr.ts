import path from "node:path";
import sharp from "sharp";
import { PSM, createWorker } from "tesseract.js";
import { createFullPortion } from "@/features/bill/engine";
import { parseReceiptLines, parsedReceiptToBill } from "./parser";
import type { OcrLine, ReceiptScanImage, ReceiptScanResult } from "./types";

type ImageInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

type OcrVariant = {
  mode: PSM;
  buffer: Buffer;
};

const langPath = path.join(
  process.cwd(),
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0",
);
const workerPath = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js",
);
const corePath = path.join(process.cwd(), "node_modules", "tesseract.js-core");

async function createOcrVariants(buffer: Buffer): Promise<OcrVariant[]> {
  const metadata = await sharp(buffer).metadata();
  const isSmallReceipt = !metadata.width || metadata.width < 1400;
  const targetWidth = metadata.width && metadata.width < 1400 ? 1400 : 1800;
  const plainWidth = metadata.width && metadata.width < 1400 ? 1200 : 1800;

  const plain = await sharp(buffer)
    .rotate()
    .resize({ width: plainWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
  const enhanced = await sharp(buffer)
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const variants: OcrVariant[] = [
    { mode: PSM.AUTO, buffer: plain },
    { mode: PSM.AUTO, buffer: enhanced },
  ];

  if (isSmallReceipt) {
    variants.splice(1, 0, { mode: PSM.SINGLE_BLOCK, buffer: plain });
  }

  return variants;
}

function textToLines(text: string, fallbackConfidence: number): OcrLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line,
      confidence: fallbackConfidence,
    }));
}

function collectBlockLines(data: unknown, fallbackText: string, fallbackConfidence: number) {
  const blocks = (data as { blocks?: unknown[] }).blocks;
  if (!Array.isArray(blocks)) {
    return textToLines(fallbackText, fallbackConfidence);
  }

  const lines: OcrLine[] = [];

  for (const block of blocks) {
    const paragraphs = (block as { paragraphs?: unknown[] }).paragraphs;
    if (!Array.isArray(paragraphs)) continue;

    for (const paragraph of paragraphs) {
      const paragraphLines = (paragraph as { lines?: unknown[] }).lines;
      if (!Array.isArray(paragraphLines)) continue;

      for (const line of paragraphLines) {
        const text = (line as { text?: string }).text?.trim();
        if (!text) continue;
        const confidence = (line as { confidence?: number }).confidence;
        lines.push({
          text,
          confidence:
            typeof confidence === "number" && Number.isFinite(confidence)
              ? confidence
              : fallbackConfidence,
        });
      }
    }
  }

  return lines.length > 0 ? lines : textToLines(fallbackText, fallbackConfidence);
}

function scoreOcrText(text: string, confidence: number) {
  const moneyMatches = text.match(/(?:rp\.?\s*)?[\d.,]{4,}/gi)?.length ?? 0;
  const receiptKeywords = text.match(
    /\b(total|subtotal|tax|pajak|service|item|rice|fries|sate|ocha|salmon|pizza|cola|tea|americano)\b/gi,
  )?.length ?? 0;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const lineCount = Math.min(lines.length, 35);
  const letters = text.replace(/[^a-z]/gi, "").length;
  const noisyChars = text.replace(/[a-z0-9\s.,:;()#%&'/-]/gi, "").length;
  const noisyRatio = noisyChars / Math.max(letters, 1);
  const hugeMoneyPenalty = (text.match(/\d{7,}/g)?.length ?? 0) * 24;

  return (
    confidence +
    moneyMatches * 18 +
    receiptKeywords * 12 +
    lineCount -
    noisyRatio * 140 -
    hugeMoneyPenalty
  );
}

export async function scanReceiptImages(images: ImageInput[]): Promise<ReceiptScanResult> {
  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath,
    gzip: true,
    cacheMethod: "readOnly",
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const scanImages: ReceiptScanImage[] = [];
    const allLines: OcrLine[] = [];

    for (const image of images) {
      let best:
        | {
            data: Awaited<ReturnType<typeof worker.recognize>>["data"];
            score: number;
          }
        | null = null;

      for (const variant of await createOcrVariants(image.buffer)) {
        await worker.setParameters({
          tessedit_pageseg_mode: variant.mode,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });

        const { data } = await worker.recognize(
          variant.buffer,
          { rotateAuto: true },
          { text: true, blocks: true },
        );
        const score = scoreOcrText(data.text ?? "", data.confidence ?? 0);
        if (!best || score > best.score) {
          best = { data, score };
        }
      }

      if (!best) {
        throw new Error(`No OCR result was produced for ${image.fileName}.`);
      }

      const { data } = best;
      const confidence =
        typeof data.confidence === "number" && Number.isFinite(data.confidence)
          ? data.confidence
          : 0;
      const lines = collectBlockLines(data, data.text ?? "", confidence);

      scanImages.push({
        fileName: image.fileName,
        mimeType: image.mimeType,
        text: data.text ?? "",
        lines,
      });
      allLines.push(...lines);
    }

    const parsed = parseReceiptLines(allLines);
    const draftBill = parsedReceiptToBill(
      parsed,
      images.map((image) => image.fileName),
    );
    draftBill.portions = draftBill.items.map(createFullPortion);

    return {
      images: scanImages,
      parsed,
      draftBill,
    };
  } finally {
    await worker.terminate();
  }
}
