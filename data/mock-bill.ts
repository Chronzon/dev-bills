import { createFullPortion } from "@/features/bill/engine";
import type { BillState } from "@/features/bill/types";

export const initialBillState: BillState = {
  currency: "IDR",
  charges: {
    taxRate: 0.1,
    serviceRate: 0.05,
    included: false,
  },
  people: [],
  items: [
    {
      id: "billiard-table",
      name: "Billiard Table",
      basePrice: 120000,
      quantity: 1,
    },
    {
      id: "pizza",
      name: "Pizza",
      basePrice: 40000,
      quantity: 1,
    },
    {
      id: "iced-tea",
      name: "Iced Tea",
      basePrice: 18000,
      quantity: 1,
    },
    {
      id: "fries",
      name: "Fries",
      basePrice: 24000,
      quantity: 1,
    },
  ],
  portions: [],
};

initialBillState.portions = initialBillState.items.map(createFullPortion);
