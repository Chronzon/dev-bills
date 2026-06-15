export type Currency = "IDR";

export type Person = {
  id: string;
  name: string;
  accent: string;
};

export type BillItem = {
  id: string;
  name: string;
  basePrice: number;
  quantity: number;
  components?: string[];
  confidence?: number;
  needsReview?: boolean;
  rawLines?: string[];
};

export type Portion = {
  id: string;
  itemId: string;
  label: string;
  baseAmount: number;
  assignedPersonId: string | null;
  source: "full" | "split";
  quantity?: number | null;
  unitAmount?: number | null;
  splitMode?: "full" | "equal" | "quantity";
};

export type Charges = {
  taxRate: number;
  serviceRate: number;
  included: boolean;
  taxAmount?: number;
  serviceAmount?: number;
  subtotal?: number;
  total?: number;
  taxBase?: "subtotal" | "subtotal_plus_service";
  roundingDelta?: number;
};

export type BillState = {
  id?: string;
  currency: Currency;
  people: Person[];
  items: BillItem[];
  portions: Portion[];
  charges: Charges;
  sourceImages?: string[];
  receiptMeta?: {
    merchant?: string;
    receiptDate?: string;
    subtotal?: number;
    taxAmount?: number;
    serviceAmount?: number;
    total?: number;
    warnings: string[];
  };
};

export type PersonTotal = {
  person: Person;
  subtotal: number;
  serviceShare: number;
  taxShare: number;
  roundingShare: number;
  addedCharges: number;
  total: number;
  portions: Portion[];
};
