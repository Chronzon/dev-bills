import { fail, ok } from "@/app/api/_utils";
import { scanReceiptImages } from "@/features/receipt/ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImages = 5;
const maxImageBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return fail(400, "NO_IMAGES", "Upload at least one receipt image.");
    }

    if (files.length > maxImages) {
      return fail(400, "TOO_MANY_IMAGES", `Upload up to ${maxImages} images.`);
    }

    const images = await Promise.all(
      files.map(async (file) => {
        if (!file.type.startsWith("image/")) {
          throw new Error(`${file.name} is not an image.`);
        }

        if (file.size > maxImageBytes) {
          throw new Error(`${file.name} exceeds the 8 MB upload limit.`);
        }

        return {
          fileName: file.name || "receipt-image",
          mimeType: file.type,
          buffer: Buffer.from(await file.arrayBuffer()),
        };
      }),
    );

    const result = await scanReceiptImages(images);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt scan failed.";
    return fail(500, "SCAN_FAILED", message);
  }
}
