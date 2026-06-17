import type { ReceiptScanResult } from "@/features/receipt/types";
import type { SplitRequest } from "./engine";
import type { BillItem, BillState, Person } from "./types";

type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: ApiError;
};

type BillMutationResult = {
  bill: BillState;
  summary: unknown;
};

async function requestApi<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error?.message ?? "Backend request failed.");
  }

  return payload.data;
}

export function createBackendBill(input?: Partial<BillState>) {
  return requestApi<{ bill: BillState }>("/api/bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: input ? JSON.stringify(input) : undefined,
  });
}

export function getBackendBill(billId: string) {
  return requestApi<BillMutationResult>(`/api/bills/${billId}`);
}

export function updateBackendPeople(billId: string, people: Person[]) {
  return requestApi<BillMutationResult>(`/api/bills/${billId}/people`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people }),
  });
}

export function updateBackendItems(billId: string, items: BillItem[]) {
  return requestApi<BillMutationResult>(`/api/bills/${billId}/items`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export function updateBackendReview(
  billId: string,
  input: {
    items: BillItem[];
    charges: {
      subtotal: number;
      serviceAmount: number;
      taxAmount: number;
      total: number;
    };
  },
) {
  return requestApi<BillMutationResult>(`/api/bills/${billId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function splitBackendItem(
  billId: string,
  itemId: string,
  splitRequest: SplitRequest,
) {
  return requestApi<BillMutationResult>(
    `/api/bills/${billId}/items/${itemId}/split`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(splitRequest),
    },
  );
}

export function assignBackendPortion(
  billId: string,
  portionId: string,
  personId: string | null,
) {
  return requestApi<BillMutationResult>(
    `/api/bills/${billId}/portions/${portionId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId }),
    },
  );
}

export function scanReceiptFiles(files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  return requestApi<ReceiptScanResult>("/api/receipts/scan", {
    method: "POST",
    body: formData,
  });
}
