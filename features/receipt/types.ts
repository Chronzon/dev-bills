import type { BillState, Charges } from "@/features/bill/types";

export type OcrLine = {
  text: string;
  confidence: number;
};

export type ParsedReceiptItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  isChargeable: boolean;
  parentItemId: string | null;
  components: string[];
  confidence: number;
  needsReview: boolean;
  rawLines: string[];
};

export type ParsedReceipt = {
  merchant?: string;
  receiptDate?: string;
  items: ParsedReceiptItem[];
  charges: Charges;
  subtotal?: number;
  taxAmount?: number;
  serviceAmount?: number;
  total?: number;
  rawLines: OcrLine[];
  warnings: string[];
};

export type ReceiptScanImage = {
  fileName: string;
  mimeType: string;
  text: string;
  lines: OcrLine[];
};

export type ReceiptScanResult = {
  images: ReceiptScanImage[];
  parsed: ParsedReceipt;
  draftBill: BillState;
};
