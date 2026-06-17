"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { initialBillState } from "@/data/mock-bill";
import {
  assignBackendPortion,
  createBackendBill,
  getBackendBill,
  scanReceiptFiles,
  splitBackendItem,
  updateBackendPeople,
  updateBackendReview,
} from "@/features/bill/api-client";
import {
  assignPortion,
  createFullPortion,
  formatRupiah,
  getBillChargeParts,
  getPersonTotals,
  getQuantityLabel,
  getRemainingTotal,
  isBillComplete,
  replaceItemWithRequestedSplit,
  type SplitRequest,
} from "@/features/bill/engine";
import type { BillItem, BillState, Person, Portion } from "@/features/bill/types";
import { DottedSurface } from "./dotted-surface";

type Step = "home" | "review" | "people" | "playground" | "summary";

const ACTIVE_PERSON_DROP_ID = "active-person-card";
const ACTIVE_PERSON_KEEP_ID = "active-person-card-shell";

const preciseDropCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (args.pointerCoordinates) {
    const dropZoneCollisions = pointerCollisions.filter(
      (collision) => collision.id === ACTIVE_PERSON_DROP_ID,
    );

    return dropZoneCollisions.length ? dropZoneCollisions : pointerCollisions;
  }

  return rectIntersection(args);
};

const quotes = [
  "Good splits keep the night light.",
  "No awkward math at the table.",
  "Everyone pays for what they enjoyed.",
  "Make the receipt feel less heavy.",
];

const personAccents = ["#F4B84A", "#62E6D8", "#DADAD5", "#9A7A39", "#C78BFF"];
const activeBillStorageKey = "dev-bills:active-bill-id";

type ApiStatus = "connecting" | "ready" | "saving" | "scanning" | "error";
type DraftItemPriceMode = "unit" | "total";

type DraftItem = Omit<BillItem, "basePrice" | "quantity"> & {
  basePrice: string;
  quantity: string;
  priceMode: DraftItemPriceMode;
};

type DraftCharges = {
  subtotal: string;
  serviceAmount: string;
  taxAmount: string;
  total: string;
};

function toDraftItem(item: BillItem): DraftItem {
  return {
    ...item,
    basePrice: String(item.basePrice),
    quantity: String(item.quantity),
    priceMode: "unit",
  };
}

function toDraftCharges(bill: BillState): DraftCharges {
  const chargeParts = getBillChargeParts(bill);

  return {
    subtotal: String(chargeParts.subtotal),
    serviceAmount: String(chargeParts.serviceAmount),
    taxAmount: String(chargeParts.taxAmount),
    total: String(chargeParts.total),
  };
}

function parseDraftCharges(charges: DraftCharges) {
  const subtotal = Number.parseInt(charges.subtotal, 10);
  const serviceAmount = Number.parseInt(charges.serviceAmount, 10);
  const taxAmount = Number.parseInt(charges.taxAmount, 10);
  const total = Number.parseInt(charges.total, 10);

  if (
    !Number.isFinite(subtotal) ||
    !Number.isFinite(serviceAmount) ||
    !Number.isFinite(taxAmount) ||
    !Number.isFinite(total) ||
    subtotal <= 0 ||
    serviceAmount < 0 ||
    taxAmount < 0 ||
    total <= 0
  ) {
    return null;
  }

  return {
    subtotal: Math.round(subtotal),
    serviceAmount: Math.round(serviceAmount),
    taxAmount: Math.round(taxAmount),
    total: Math.round(total),
  };
}

function buildManualCharges(charges: NonNullable<ReturnType<typeof parseDraftCharges>>) {
  return {
    taxRate:
      charges.subtotal + charges.serviceAmount > 0
        ? Number((charges.taxAmount / (charges.subtotal + charges.serviceAmount)).toFixed(4))
        : 0,
    serviceRate: Number((charges.serviceAmount / charges.subtotal).toFixed(4)),
    included: false,
    subtotal: charges.subtotal,
    serviceAmount: charges.serviceAmount,
    taxAmount: charges.taxAmount,
    total: charges.total,
    taxBase: "subtotal_plus_service" as const,
    roundingDelta:
      charges.total - charges.subtotal - charges.serviceAmount - charges.taxAmount,
  };
}

function areReviewItemsEqual(currentItems: BillItem[], nextItems: BillItem[]) {
  if (currentItems.length !== nextItems.length) return false;

  return currentItems.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      item.id === nextItem.id &&
      item.name === nextItem.name &&
      item.basePrice === nextItem.basePrice &&
      item.quantity === nextItem.quantity
    );
  });
}

function getDraftItemPreview(item: DraftItem) {
  const price = Number.parseInt(item.basePrice, 10);
  const parsedQuantity = Number.parseInt(item.quantity, 10);
  const quantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? Math.round(parsedQuantity)
      : 1;
  const name = item.name.trim();
  const lineTotal = Number.isFinite(price)
    ? item.priceMode === "total"
      ? Math.round(price)
      : Math.round(price) * quantity
    : 0;

  if (!name || !Number.isFinite(price) || price <= 0) {
    return { item: null, lineTotal, error: null };
  }

  if (item.priceMode === "total" && Math.round(price) % quantity !== 0) {
    return {
      item: null,
      lineTotal,
      error: "Line total must divide evenly by quantity.",
    };
  }

  return {
    item: {
      id: item.id,
      name,
      components: item.components,
      confidence: item.confidence,
      needsReview: item.needsReview,
      rawLines: item.rawLines,
      basePrice:
        item.priceMode === "total"
          ? Math.round(price) / quantity
          : Math.round(price),
      quantity,
    },
    lineTotal,
    error: null,
  };
}

function parseDraftItem(item: DraftItem): BillItem | null {
  return getDraftItemPreview(item).item;
}

function buildBillCreateBody(bill: BillState, people: Person[]) {
  return {
    currency: bill.currency,
    people,
    items: bill.items,
    charges: bill.charges,
    sourceImages: bill.sourceImages,
    receiptMeta: bill.receiptMeta,
  };
}

function newPerson(index: number): Person {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `person-${Date.now()}`;

  return {
    id,
    name: "",
    accent: personAccents[index % personAccents.length],
  };
}

function getNextStepForBill(bill: BillState): Step {
  if (bill.people.length > 0) return "playground";
  if (bill.items.length > 0) return "people";
  return "review";
}

export function DevBillsApp() {
  const [step, setStep] = useState<Step>("home");
  const [bill, setBill] = useState<BillState>(initialBillState);
  const [activePersonIndex, setActivePersonIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [splitItem, setSplitItem] = useState<BillItem | null>(null);
  const [shareCount, setShareCount] = useState(3);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("connecting");
  const [apiMessage, setApiMessage] = useState("Checking saved split...");
  const [hasSavedBill, setHasSavedBill] = useState(false);

  const totals = useMemo(() => getPersonTotals(bill), [bill]);
  const safeActivePersonIndex = bill.people.length
    ? Math.min(activePersonIndex, bill.people.length - 1)
    : 0;
  const safeSummaryIndex = totals.length ? Math.min(summaryIndex, totals.length - 1) : 0;
  const activePerson = bill.people[safeActivePersonIndex];
  const remainingTotal = useMemo(() => getRemainingTotal(bill), [bill]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreActiveBill() {
      try {
        const params = new URLSearchParams(window.location.search);
        const savedBillId =
          params.get("bill") ?? window.localStorage.getItem(activeBillStorageKey);

        if (!savedBillId) {
          if (cancelled) return;
          setApiStatus("ready");
          setApiMessage("Ready.");
          return;
        }

        const { bill: backendBill } = await getBackendBill(savedBillId);
        if (cancelled) return;
        setBill(backendBill);
        setHasSavedBill(true);
        setApiStatus("ready");
        setApiMessage("Saved split loaded.");
      } catch (error) {
        if (cancelled) return;
        window.localStorage.removeItem(activeBillStorageKey);
        setHasSavedBill(false);
        setApiStatus("ready");
        setApiMessage(
          error instanceof Error ? error.message : "Could not load saved split.",
        );
      }
    }

    restoreActiveBill();

    return () => {
      cancelled = true;
    };
  }, []);

  const rememberBill = (nextBill: BillState) => {
    if (!nextBill.id) return;
    window.localStorage.setItem(activeBillStorageKey, nextBill.id);
    setHasSavedBill(true);
  };

  const createBillFromState = async (sourceBill: BillState, people: Person[]) => {
    const { bill: createdBill } = await createBackendBill(
      buildBillCreateBody(sourceBill, people),
    );
    rememberBill(createdBill);
    return createdBill;
  };

  const handleStartNew = async () => {
    setApiStatus("saving");
    setApiMessage("Starting a new split...");

    try {
      window.localStorage.removeItem(activeBillStorageKey);
      const createdBill = await createBillFromState(initialBillState, []);
      setBill(createdBill);
      setActivePersonIndex(0);
      setSummaryIndex(0);
      setStep("review");
      setApiStatus("ready");
      setApiMessage("New split ready.");
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "Could not start split.");
    }
  };

  const handleContinue = () => {
    setStep(getNextStepForBill(bill));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!bill.id) {
      setApiStatus("error");
      setApiMessage("Bill has not been created in backend yet.");
      return;
    }

    const portionId = String(event.active.id);
    const overId = event.over?.id;
    const personId = overId === ACTIVE_PERSON_DROP_ID ? activePerson?.id ?? null : null;
    const portion = bill.portions.find((entry) => entry.id === portionId);
    if (!portion) return;
    if (overId === ACTIVE_PERSON_KEEP_ID && portion.assignedPersonId) return;
    if (!personId && !portion.assignedPersonId) return;
    if (personId === portion.assignedPersonId) return;

    const previousBill = bill;
    setBill((current) => ({
      ...current,
      portions: assignPortion(current.portions, portionId, personId),
    }));
    setApiStatus("saving");
    setApiMessage("Saving assignment...");

    try {
      const { bill: updatedBill } = await assignBackendPortion(
        bill.id,
        portionId,
        personId,
      );
      setBill(updatedBill);
      setApiStatus("ready");
      setApiMessage("Assignment saved.");
    } catch (error) {
      setBill(previousBill);
      setApiStatus("error");
      setApiMessage(
        error instanceof Error ? error.message : "Could not save assignment.",
      );
    }
  };

  const splitFocusedItem = async (splitRequest: SplitRequest) => {
    if (!splitItem || !bill.id) return;

    const previewPortions = replaceItemWithRequestedSplit(
      bill.portions,
      splitItem,
      splitRequest,
    );
    const previousBill = bill;

    setBill((current) => ({
      ...current,
      portions: previewPortions,
    }));
    setApiStatus("saving");
    setApiMessage("Saving split...");

    try {
      const { bill: updatedBill } = await splitBackendItem(
        bill.id,
        splitItem.id,
        splitRequest,
      );
      setBill(updatedBill);
      setSplitItem(null);
      setStep("playground");
      setApiStatus("ready");
      setApiMessage("Split saved.");
    } catch (error) {
      setBill(previousBill);
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "Could not split item.");
    }
  };

  const savePeople = async (people: Person[], nextActiveIndex?: number) => {
    if (!bill.id) return;

    const previousBill = bill;
    setBill((current) => ({ ...current, people }));
    setApiStatus("saving");
    setApiMessage("Saving people...");

    try {
      const { bill: updatedBill } = await updateBackendPeople(bill.id, people);
      setBill(updatedBill);
      setActivePersonIndex(
        Math.max(0, Math.min(nextActiveIndex ?? activePersonIndex, people.length - 1)),
      );
      setApiStatus("ready");
      setApiMessage("People saved.");
    } catch (error) {
      setBill(previousBill);
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "Could not update people.");
    }
  };

  const handleAddPerson = async () => {
    const people = [...bill.people, newPerson(bill.people.length)];
    await savePeople(people, people.length - 1);
  };

  const handleRenamePerson = async (personId: string, name: string) => {
    const people = bill.people.map((person) =>
      person.id === personId ? { ...person, name } : person,
    );
    await savePeople(people);
  };

  const handleRemovePerson = async (personId: string) => {
    const nextIndex = Math.max(
      0,
      Math.min(activePersonIndex, bill.people.length - 2),
    );
    await savePeople(
      bill.people.filter((person) => person.id !== personId),
      nextIndex,
    );
  };

  const handleReceiptFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setApiStatus("scanning");
    setApiMessage("Scanning receipt...");

    try {
      const scan = await scanReceiptFiles(files);
      const createdBill = await createBillFromState(scan.draftBill, bill.people);
      setBill(createdBill);
      setActivePersonIndex(0);
      setSummaryIndex(0);
      setApiStatus("ready");
      setApiMessage(
        scan.parsed.warnings[0] ?? `${scan.draftBill.items.length} items imported.`,
      );
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "Could not scan receipt.");
    }
  };

  const handleUpdateBill = async (
    items: BillItem[],
    charges: NonNullable<ReturnType<typeof parseDraftCharges>>,
  ) => {
    if (!bill.id) return;

    const previousBill = bill;
    const itemsChanged = !areReviewItemsEqual(bill.items, items);
    const nextCharges = buildManualCharges(charges);
    setBill((current) => ({
      ...current,
      items,
      charges: nextCharges,
      receiptMeta: {
        ...current.receiptMeta,
        subtotal: nextCharges.subtotal,
        serviceAmount: nextCharges.serviceAmount,
        taxAmount: nextCharges.taxAmount,
        total: nextCharges.total,
        warnings: current.receiptMeta?.warnings ?? [],
      },
      portions: itemsChanged ? items.map(createFullPortion) : current.portions,
    }));
    setApiStatus("saving");
    setApiMessage("Saving bill...");

    try {
      const { bill: updatedBill } = await updateBackendReview(bill.id, {
        items,
        charges,
      });
      setBill(updatedBill);
      setApiStatus("ready");
      setApiMessage(
        itemsChanged ? "Bill saved. Assignments were reset." : "Bill totals saved.",
      );
    } catch (error) {
      setBill(previousBill);
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "Could not update bill.");
    }
  };

  const movePerson = (direction: 1 | -1) => {
    if (bill.people.length === 0) return;
    setActivePersonIndex((index) =>
      (index + direction + bill.people.length) % bill.people.length,
    );
  };

  const moveSummary = (direction: 1 | -1) => {
    if (totals.length === 0) return;
    setSummaryIndex((index) => (index + direction + totals.length) % totals.length);
  };

  return (
    <main className="app-shell">
      <DottedSurface />
      <div className="app-noise" aria-hidden="true" />
      <section className="app-stage" aria-label="Dev Bills prototype">
        <AnimatePresence mode="wait">
          {step === "home" && (
            <HomeScreen
              quote={quotes[quoteIndex]}
              status={apiMessage}
              busy={apiStatus === "connecting" || apiStatus === "saving"}
              hasSavedBill={hasSavedBill && Boolean(bill.id)}
              onQuote={() => setQuoteIndex((index) => (index + 1) % quotes.length)}
              onStart={handleStartNew}
              onContinue={handleContinue}
            />
          )}
          {step === "review" && (
            <ReviewScreen
              bill={bill}
              status={apiMessage}
              isScanning={apiStatus === "scanning"}
              isSaving={apiStatus === "saving"}
              onReceiptFiles={handleReceiptFiles}
              onUpdateBill={handleUpdateBill}
              onBack={() => setStep("home")}
              onNext={() => setStep("people")}
            />
          )}
          {step === "people" && (
            <PeopleScreen
              people={bill.people}
              isSaving={apiStatus === "saving"}
              onAddPerson={handleAddPerson}
              onRenamePerson={handleRenamePerson}
              onRemovePerson={handleRemovePerson}
              onBack={() => setStep("review")}
              onNext={() => setStep("playground")}
            />
          )}
          {step === "playground" && (
            activePerson && (
              <DndContext
                sensors={sensors}
                collisionDetection={preciseDropCollision}
                onDragEnd={handleDragEnd}
              >
                <PlaygroundScreen
                  bill={bill}
                  activePerson={activePerson}
                  activePersonIndex={safeActivePersonIndex}
                  remainingTotal={remainingTotal}
                  onMovePerson={movePerson}
                  onBack={() => setStep("people")}
                  onSplitItem={setSplitItem}
                  onSummary={() => setStep("summary")}
                />
              </DndContext>
            )
          )}
          {step === "summary" && (
            totals[safeSummaryIndex] && (
              <SummaryScreen
                complete={isBillComplete(bill)}
                total={totals[safeSummaryIndex]}
                index={safeSummaryIndex}
                count={totals.length}
                onMove={moveSummary}
                onBack={() => setStep("playground")}
              />
            )
          )}
        </AnimatePresence>
      </section>
      <AnimatePresence>
        {splitItem && (
          <SplitModal
            item={splitItem}
            people={bill.people}
            shareCount={shareCount}
            onShareCount={setShareCount}
            onClose={() => setSplitItem(null)}
            onConfirm={splitFocusedItem}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function Screen({
  children,
  className = "",
  onBack,
}: {
  children: React.ReactNode;
  className?: string;
  onBack?: () => void;
}) {
  const backSwipe = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onBack || event.pointerType !== "touch" || event.clientX > 36) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, input, textarea, select, a, [role='button']")
    ) {
      return;
    }

    backSwipe.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onBack || !backSwipe.current) return;

    const dx = event.clientX - backSwipe.current.x;
    const dy = Math.abs(event.clientY - backSwipe.current.y);
    backSwipe.current = null;

    if (dx > 72 && dy < 56) onBack();
  };

  return (
    <motion.div
      className={`screen ${className}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        backSwipe.current = null;
      }}
    >
      {children}
    </motion.div>
  );
}

function HomeScreen({
  quote,
  status,
  busy,
  hasSavedBill,
  onQuote,
  onStart,
  onContinue,
}: {
  quote: string;
  status: string;
  busy: boolean;
  hasSavedBill: boolean;
  onQuote: () => void;
  onStart: () => void;
  onContinue: () => void;
}) {
  return (
    <Screen className="home-screen">
      <TopRail left="DEV BILLS" right="BROWSER" />
      <div className="home-center">
        <h1>Split softly.</h1>
        <motion.button
          key={quote}
          type="button"
          className="quote-line"
          onClick={onQuote}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {quote}
        </motion.button>
        <span className="status-line">{status}</span>
      </div>
      <div className="home-actions">
        {hasSavedBill && (
          <button
            className="ghost-button"
            type="button"
            onClick={onContinue}
            disabled={busy}
          >
            Continue split
          </button>
        )}
        <button className="primary-button" type="button" onClick={onStart} disabled={busy}>
          {busy ? "Working..." : hasSavedBill ? "New split" : "Start Split"}
        </button>
      </div>
    </Screen>
  );
}

function ReviewScreen({
  bill,
  status,
  isScanning,
  isSaving,
  onReceiptFiles,
  onUpdateBill,
  onBack,
  onNext,
}: {
  bill: BillState;
  status: string;
  isScanning: boolean;
  isSaving: boolean;
  onReceiptFiles: (files: File[]) => void;
  onUpdateBill: (
    items: BillItem[],
    charges: NonNullable<ReturnType<typeof parseDraftCharges>>,
  ) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const imageCount = bill.sourceImages?.length ?? 0;
  const [isItemEditorOpen, setIsItemEditorOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(
    bill.items.map(toDraftItem),
  );
  const [draftCharges, setDraftCharges] = useState<DraftCharges>(() =>
    toDraftCharges(bill),
  );
  const chargeParts = useMemo(() => getBillChargeParts(bill), [bill]);
  const itemSubtotal = bill.items.reduce(
    (total, item) => total + item.basePrice * item.quantity,
    0,
  );
  const detectedAddedCharges =
    chargeParts.serviceAmount + chargeParts.taxAmount + chargeParts.roundingDelta;
  const reconcileDelta = chargeParts.total - itemSubtotal - detectedAddedCharges;
  const effectiveMultiplier =
    itemSubtotal > 0 ? chargeParts.total / itemSubtotal : 1;

  const updateDraftItem = (
    itemId: string,
    patch: Partial<Pick<DraftItem, "name" | "basePrice" | "quantity" | "priceMode">>,
  ) => {
    setDraftItems((items) =>
      items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  };

  const addDraftItem = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `item-${crypto.randomUUID().slice(0, 8)}`
        : `item-${Date.now()}`;
    setDraftItems([
      ...draftItems,
      {
        id,
        name: "",
        basePrice: "1000",
        quantity: "1",
        priceMode: "unit",
      },
    ]);
  };

  const removeDraftItem = (itemId: string) => {
    setDraftItems((items) => items.filter((entry) => entry.id !== itemId));
  };

  const updateDraftCharge = (key: keyof DraftCharges, value: string) => {
    setDraftCharges((charges) => ({ ...charges, [key]: value }));
  };

  const saveDraftBill = () => {
    const items = draftItems
      .map(parseDraftItem)
      .filter((item): item is BillItem => item !== null);
    const charges = parseDraftCharges(draftCharges);

    if (items.length === 0 || !charges) return;
    onUpdateBill(items, charges);
    setIsItemEditorOpen(false);
  };

  const openItemEditor = () => {
    setDraftItems(bill.items.map(toDraftItem));
    setDraftCharges(toDraftCharges(bill));
    setIsItemEditorOpen(true);
  };

  return (
    <Screen className="review-screen" onBack={onBack}>
      <TopRail
        left="RECEIPT"
        right={imageCount ? `${imageCount} IMAGES` : "SAMPLE BILL"}
        onBack={onBack}
      />
      <TitleBlock
        title="Import the bill."
        body={
          bill.receiptMeta?.merchant
            ? `${bill.receiptMeta.merchant} is ready for review.`
            : "Use the sample bill or upload receipt images to scan real items."
        }
      />
      <label
        className={`glass-card upload-card ${isScanning ? "is-busy" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onReceiptFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="label amber">UPLOAD ZONE</span>
        <div className="receipt-preview-row">
          <div className="receipt-thumb light" />
          <div className="receipt-thumb dim" />
          <div>
            <strong>{isScanning ? "Scanning receipt" : "Drop receipt images"}</strong>
            <span>{isScanning ? "OCR is running on backend." : status}</span>
          </div>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={isScanning}
          onChange={(event) => {
            onReceiptFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </label>
      <div className="chip-wrap">
        {bill.items.map((item) => (
          <span className="item-chip" key={item.id}>
            <b>{item.name}</b>
            <small>
              {formatRupiah(item.basePrice)} x {item.quantity} ={" "}
              {formatRupiah(item.basePrice * item.quantity)}
            </small>
          </span>
        ))}
      </div>
      <div className="charges-review-block glass-card">
        <span className="label amber">BACKEND THINKING</span>
        <div>
          <span>Item subtotal</span>
          <b>{formatRupiah(itemSubtotal)}</b>
        </div>
        <div>
          <span>Detected subtotal</span>
          <b>{formatRupiah(chargeParts.subtotal)}</b>
        </div>
        <div>
          <span>Service</span>
          <b>{formatRupiah(chargeParts.serviceAmount)}</b>
        </div>
        <div>
          <span>Tax</span>
          <b>{formatRupiah(chargeParts.taxAmount)}</b>
        </div>
        <div>
          <span>Grand total</span>
          <b>{formatRupiah(chargeParts.total)}</b>
        </div>
        <div>
          <span>Final multiplier</span>
          <b>{itemSubtotal > 0 ? `${effectiveMultiplier.toFixed(4)}x` : "1.0000x"}</b>
        </div>
        {(Math.abs(reconcileDelta) > 2 || (bill.receiptMeta?.warnings.length ?? 0) > 0) && (
          <p>
            {bill.receiptMeta?.warnings[0] ??
              `Receipt total differs by ${formatRupiah(reconcileDelta)}.`}
          </p>
        )}
      </div>
      <div className="bottom-actions">
        <div className="secondary-actions">
          <button
            type="button"
            onClick={openItemEditor}
            disabled={isSaving}
          >
            Edit bill
          </button>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={onNext}
          disabled={isScanning || isSaving || bill.items.length === 0}
        >
          Looks right
        </button>
      </div>
      <AnimatePresence>
        {isItemEditorOpen && (
          <ItemEditorSheet
            draftItems={draftItems}
            draftCharges={draftCharges}
            isSaving={isSaving}
            onUpdateItem={updateDraftItem}
            onUpdateCharge={updateDraftCharge}
            onAddItem={addDraftItem}
            onRemoveItem={removeDraftItem}
            onSave={saveDraftBill}
            onClose={() => setIsItemEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </Screen>
  );
}

function ItemEditorSheet({
  draftItems,
  draftCharges,
  isSaving,
  onUpdateItem,
  onUpdateCharge,
  onAddItem,
  onRemoveItem,
  onSave,
  onClose,
}: {
  draftItems: DraftItem[];
  draftCharges: DraftCharges;
  isSaving: boolean;
  onUpdateItem: (
    itemId: string,
    patch: Partial<Pick<DraftItem, "name" | "basePrice" | "quantity" | "priceMode">>,
  ) => void;
  onUpdateCharge: (key: keyof DraftCharges, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const validDraftItems = draftItems
    .map(parseDraftItem)
    .filter((item): item is BillItem => item !== null);
  const draftItemPreviews = draftItems.map(getDraftItemPreview);
  const draftSubtotal = draftItemPreviews.reduce(
    (total, preview) => total + preview.lineTotal,
    0,
  );
  const validDraftCharges = parseDraftCharges(draftCharges);
  const manualRoundingDelta = validDraftCharges
    ? validDraftCharges.total -
      validDraftCharges.subtotal -
      validDraftCharges.serviceAmount -
      validDraftCharges.taxAmount
    : 0;
  const hasDraftItemError = draftItemPreviews.some((preview) => preview.error);
  const canSave =
    validDraftItems.length > 0 &&
    Boolean(validDraftCharges) &&
    !hasDraftItemError &&
    !isSaving;

  return (
    <motion.div
      className="item-editor-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="modal-scrim" type="button" onClick={onClose} />
      <motion.div
        className="item-editor-sheet glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.25 }}
      >
        <div className="item-editor-sheet-head">
          <div>
            <span className="label amber">EDIT BILL</span>
            <h2 id="item-editor-title">Review totals and items</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close bill editor">
            ×
          </button>
        </div>
        <div className="item-editor-sheet-meta">
          <span>Item rows subtotal</span>
          <b>{formatRupiah(draftSubtotal)}</b>
        </div>
        <div className="item-editor-scroll">
          <div className="bill-totals-editor" aria-label="Bill totals">
            <label className="item-editor-field">
              <span>Subtotal</span>
              <input
                value={draftCharges.subtotal}
                type="number"
                min={1}
                step={1000}
                aria-label="Bill subtotal"
                onChange={(event) =>
                  onUpdateCharge("subtotal", event.currentTarget.value)
                }
              />
            </label>
            <label className="item-editor-field">
              <span>Service</span>
              <input
                value={draftCharges.serviceAmount}
                type="number"
                min={0}
                step={1000}
                aria-label="Bill service"
                onChange={(event) =>
                  onUpdateCharge("serviceAmount", event.currentTarget.value)
                }
              />
            </label>
            <label className="item-editor-field">
              <span>Tax</span>
              <input
                value={draftCharges.taxAmount}
                type="number"
                min={0}
                step={1000}
                aria-label="Bill tax"
                onChange={(event) =>
                  onUpdateCharge("taxAmount", event.currentTarget.value)
                }
              />
            </label>
            <label className="item-editor-field">
              <span>Grand total</span>
              <input
                value={draftCharges.total}
                type="number"
                min={1}
                step={1000}
                aria-label="Bill grand total"
                onChange={(event) => onUpdateCharge("total", event.currentTarget.value)}
              />
            </label>
            <div className="bill-totals-note">
              <span>Rounding</span>
              <b>{formatRupiah(manualRoundingDelta)}</b>
            </div>
          </div>
          <div className="item-editor-list">
            {draftItems.map((item, index) => (
              <div className="item-editor-row" key={item.id}>
                <label className="item-editor-field item-editor-name">
                  <span>Name</span>
                  <input
                    value={item.name}
                    placeholder="Item name"
                    aria-label="Item name"
                    onChange={(event) =>
                      onUpdateItem(item.id, { name: event.currentTarget.value })
                    }
                  />
                </label>
                <div className="item-price-editor">
                  <div className="price-mode-tabs" role="tablist" aria-label="Price mode">
                    <button
                      type="button"
                      className={item.priceMode === "unit" ? "active" : ""}
                      onClick={() => onUpdateItem(item.id, { priceMode: "unit" })}
                    >
                      Unit
                    </button>
                    <button
                      type="button"
                      className={item.priceMode === "total" ? "active" : ""}
                      onClick={() => onUpdateItem(item.id, { priceMode: "total" })}
                    >
                      Total
                    </button>
                  </div>
                  <label className="item-editor-field">
                    <span>{item.priceMode === "total" ? "Line price" : "Unit price"}</span>
                    <input
                      value={item.basePrice}
                      type="number"
                      min={1000}
                      step={500}
                      aria-label={
                        item.priceMode === "total" ? "Item line price" : "Item unit price"
                      }
                      aria-invalid={Boolean(draftItemPreviews[index].error)}
                      onChange={(event) =>
                        onUpdateItem(item.id, {
                          basePrice: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="item-editor-field">
                  <span>Qty</span>
                  <input
                    value={item.quantity}
                    type="number"
                    min={1}
                    aria-label="Item quantity"
                    onChange={(event) =>
                      onUpdateItem(item.id, {
                        quantity: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <div className="item-editor-total">
                  <span>Line total</span>
                  <b>{formatRupiah(draftItemPreviews[index].lineTotal)}</b>
                  {draftItemPreviews[index].error && (
                    <em>{draftItemPreviews[index].error}</em>
                  )}
                </div>
                <button
                  className="item-editor-remove-button"
                  type="button"
                  aria-label={`Remove ${item.name || "item"}`}
                  onClick={() => onRemoveItem(item.id)}
                >
                  -
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="item-editor-sheet-actions">
          <button type="button" className="ghost-editor-button" onClick={onAddItem}>
            + Add item
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onSave}
            disabled={!canSave}
          >
            Save bill
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PeopleScreen({
  people,
  isSaving,
  onAddPerson,
  onRenamePerson,
  onRemovePerson,
  onBack,
  onNext,
}: {
  people: Person[];
  isSaving: boolean;
  onAddPerson: () => void;
  onRenamePerson: (personId: string, name: string) => void;
  onRemovePerson: (personId: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const canOpenPlayground =
    people.length > 0 && people.every((person) => person.name.trim());

  return (
    <Screen className="people-screen" onBack={onBack}>
      <TopRail left="PEOPLE" right={`${people.length} SPLITTERS`} onBack={onBack} />
      <TitleBlock
        title="Who was there?"
        body="Everyone can be in the bill, even when only some people share an item."
      />
      <div className="people-list">
        {people.map((person) => (
          <PersonEditorRow
            key={`${person.id}:${person.name}`}
            person={person}
            disabled={isSaving}
            onRename={onRenamePerson}
            onRemove={onRemovePerson}
          />
        ))}
        <button
          className="person-row add-person"
          type="button"
          onClick={onAddPerson}
          disabled={isSaving}
        >
          <strong>Add person</strong>
          <b>+</b>
        </button>
      </div>
      <button
        className="primary-button bottom-pinned"
        type="button"
        onClick={onNext}
        disabled={!canOpenPlayground || isSaving}
      >
        Open playground
      </button>
    </Screen>
  );
}

function PersonEditorRow({
  person,
  disabled,
  onRename,
  onRemove,
}: {
  person: Person;
  disabled: boolean;
  onRename: (personId: string, name: string) => void;
  onRemove: (personId: string) => void;
}) {
  const [name, setName] = useState(person.name);

  const commitName = () => {
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== person.name) {
      onRename(person.id, trimmedName);
    } else {
      setName(person.name);
    }
  };

  return (
    <div className="person-row editable-person-row">
      <span className="person-accent" style={{ backgroundColor: person.accent }} />
      <input
        value={name}
        placeholder="Name"
        disabled={disabled}
        aria-label="Person name"
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        aria-label={`Remove ${person.name || "person"}`}
        disabled={disabled}
        onClick={() => onRemove(person.id)}
      >
        -
      </button>
    </div>
  );
}

function PlaygroundScreen({
  bill,
  activePerson,
  activePersonIndex,
  remainingTotal,
  onMovePerson,
  onBack,
  onSplitItem,
  onSummary,
}: {
  bill: BillState;
  activePerson: Person;
  activePersonIndex: number;
  remainingTotal: number;
  onMovePerson: (direction: 1 | -1) => void;
  onBack: () => void;
  onSplitItem: (item: BillItem) => void;
  onSummary: () => void;
}) {
  const activePortions = bill.portions.filter(
    (portion) => portion.assignedPersonId === activePerson.id,
  );

  return (
    <Screen className="playground-screen" onBack={onBack}>
      <TopRail left="PLAYGROUND" right="SWIPE CARD" onBack={onBack} />
      <div className="remaining-total">
        <span className="label amber">UNASSIGNED</span>
        <strong>{formatRupiah(remainingTotal)}</strong>
      </div>
      <div className="floating-items item-bubble-list" aria-label="Unassigned bill items">
        {bill.portions
          .filter((portion) => !portion.assignedPersonId)
          .map((portion, index) => {
            const item = bill.items.find((entry) => entry.id === portion.itemId);
            return (
              <DraggableBubble
                key={portion.id}
                portion={portion}
                index={index}
                accent={index % 3 === 1 ? "amber" : index % 3 === 2 ? "cyan" : "plain"}
                onOpenSplit={() => item && onSplitItem(item)}
              />
            );
          })}
      </div>
      <PersonDropCard
        activePerson={activePerson}
        activePersonIndex={activePersonIndex}
        count={bill.people.length}
        portions={activePortions}
        onMovePerson={onMovePerson}
        onSummary={onSummary}
      />
    </Screen>
  );
}

function DraggableBubble({
  portion,
  index,
  accent,
  onOpenSplit,
}: {
  portion: Portion;
  index: number;
  accent: "plain" | "amber" | "cyan";
  onOpenSplit: () => void;
}) {
  const holdTimer = useRef<number | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const longPressTriggered = useRef(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: portion.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 5 : 1,
  };

  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const getMoveDistance = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!startPoint.current) return Number.POSITIVE_INFINITY;
    const dx = event.clientX - startPoint.current.x;
    const dy = event.clientY - startPoint.current.y;
    return Math.hypot(dx, dy);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    listeners?.onPointerDown?.(event);
    if (event.pointerType !== "mouse") event.preventDefault();
    startPoint.current = { x: event.clientX, y: event.clientY };
    longPressTriggered.current = false;
    cancelHold();
    if (event.pointerType !== "mouse") {
      holdTimer.current = window.setTimeout(() => {
        longPressTriggered.current = true;
        onOpenSplit();
        holdTimer.current = null;
      }, 520);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    listeners?.onPointerMove?.(event);
    if (!startPoint.current) return;
    const dx = Math.abs(event.clientX - startPoint.current.x);
    const dy = Math.abs(event.clientY - startPoint.current.y);
    if (dx > 8 || dy > 8) cancelHold();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    listeners?.onPointerUp?.(event);
    if (event.pointerType !== "mouse") event.preventDefault();
    const moveDistance = getMoveDistance(event);
    cancelHold();
    startPoint.current = null;

    if (isDragging || longPressTriggered.current || moveDistance > 8) {
      lastTap.current = null;
      return;
    }

    if (event.pointerType === "mouse") return;

    const now = window.performance.now();
    const previousTap = lastTap.current;
    if (
      previousTap &&
      now - previousTap.time <= 360 &&
      Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 18
    ) {
      lastTap.current = null;
      event.stopPropagation();
      onOpenSplit();
      return;
    }

    lastTap.current = { time: now, x: event.clientX, y: event.clientY };
  };

  return (
    <button
      ref={setNodeRef}
      className={`drag-bubble ${accent} ${isDragging ? "dragging" : ""}`}
      style={style}
      type="button"
      draggable={false}
      aria-label={`${portion.label}, ${formatRupiah(portion.baseAmount)}. Double tap to split.`}
      title="Double tap to split"
      {...attributes}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelHold();
        lastTap.current = null;
        onOpenSplit();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        cancelHold();
        startPoint.current = null;
      }}
    >
      {portion.label} · {formatRupiah(portion.baseAmount)}
    </button>
  );
}

function AssignedPortionChip({ portion }: { portion: Portion }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: portion.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <button
      ref={setNodeRef}
      className={`assigned-portion-chip ${isDragging ? "dragging" : ""}`}
      style={style}
      type="button"
      {...listeners}
      {...attributes}
    >
      {portion.label} · {formatRupiah(portion.baseAmount)}
    </button>
  );
}

function PersonDropCard({
  activePerson,
  activePersonIndex,
  count,
  portions,
  onMovePerson,
  onSummary,
}: {
  activePerson: Person;
  activePersonIndex: number;
  count: number;
  portions: Portion[];
  onMovePerson: (direction: 1 | -1) => void;
  onSummary: () => void;
}) {
  const { setNodeRef: setCardNodeRef } = useDroppable({ id: ACTIVE_PERSON_KEEP_ID });
  const { setNodeRef: setDropZoneNodeRef, isOver } = useDroppable({
    id: ACTIVE_PERSON_DROP_ID,
  });
  const subtotal = portions.reduce((total, portion) => total + portion.baseAmount, 0);

  return (
    <div className="person-card-wrap">
      <div className="carousel-controls">
        <button type="button" onClick={() => onMovePerson(-1)} aria-label="Previous person">
          ←
        </button>
        <div className="carousel-dots" aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <span key={index} className={index === activePersonIndex ? "active" : ""} />
          ))}
        </div>
        <button type="button" onClick={() => onMovePerson(1)} aria-label="Next person">
          →
        </button>
      </div>
      <div
        ref={setCardNodeRef}
        className={`glass-card active-person-card ${isOver ? "is-over" : ""}`}
      >
        <div className="person-card-head">
          <div>
            <span className="label">ACTIVE PERSON</span>
            <strong>{activePerson.name}</strong>
          </div>
          <span className="person-count">
            {activePersonIndex + 1} / {count}
          </span>
        </div>
        <div
          ref={setDropZoneNodeRef}
          className={`person-card-drop-zone ${isOver ? "is-over" : ""}`}
        >
          {portions.length ? (
            <div className="assigned-list">
              {portions.map((portion) => (
                <AssignedPortionChip key={portion.id} portion={portion} />
              ))}
            </div>
          ) : (
            <div className="empty-assignment-state" aria-label="No items assigned yet">
              <span className="empty-assignment-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="empty-assignment-copy">No items yet</span>
            </div>
          )}
        </div>
        <div className="person-card-foot">
          <strong>{formatRupiah(subtotal)}</strong>
          <button type="button" onClick={onSummary}>
            Summary
          </button>
        </div>
      </div>
    </div>
  );
}

function SplitModal({
  item,
  people,
  shareCount,
  onShareCount,
  onClose,
  onConfirm,
}: {
  item: BillItem;
  people: Person[];
  shareCount: number;
  onShareCount: (count: number) => void;
  onClose: () => void;
  onConfirm: (splitRequest: SplitRequest) => void;
}) {
  const [mode, setMode] = useState<SplitRequest["mode"]>(
    item.quantity > 1 ? "quantity" : "equal",
  );
  const [quantityAssignments, setQuantityAssignments] = useState<Record<string, number>>(
    {},
  );
  const amount = item.basePrice * item.quantity;
  const base = Math.floor(amount / shareCount);
  const amounts = Array.from({ length: shareCount }, (_, index) =>
    index === shareCount - 1 ? amount - base * (shareCount - 1) : base,
  );
  const assignedQuantity = Object.values(quantityAssignments).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const remainingQuantity = item.quantity - assignedQuantity;
  const canConfirm = mode === "equal" ? shareCount >= 2 : assignedQuantity > 0;

  useEffect(() => {
    if (people.length > 0 && shareCount > people.length) {
      onShareCount(Math.max(2, people.length));
    }
  }, [onShareCount, people.length, shareCount]);

  const updateQuantityAssignment = (personId: string, delta: 1 | -1) => {
    setQuantityAssignments((current) => {
      const currentQuantity = current[personId] ?? 0;
      const currentAssignedQuantity = Object.values(current).reduce(
        (total, quantity) => total + quantity,
        0,
      );
      const nextQuantity =
        delta > 0
          ? Math.min(
              item.quantity - currentAssignedQuantity + currentQuantity,
              currentQuantity + 1,
            )
          : Math.max(0, currentQuantity - 1);
      const next = { ...current, [personId]: nextQuantity };
      if (nextQuantity === 0) delete next[personId];
      return next;
    });
  };

  const confirmSplit = () => {
    if (mode === "equal") {
      onConfirm({ mode: "equal", parts: shareCount });
      return;
    }

    onConfirm({
      mode: "quantity",
      assignments: Object.entries(quantityAssignments).map(([personId, quantity]) => ({
        personId,
        quantity,
      })),
    });
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="modal-scrim" type="button" onClick={onClose} />
      <motion.div
        className="split-modal glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-modal-title"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.25 }}
      >
        <span className="label amber">SPLIT ITEM?</span>
        <h2 id="split-modal-title">Divide {getQuantityLabel(item.name, item.quantity)}</h2>
        <p>
          {formatRupiah(item.basePrice)} per item · {formatRupiah(amount)} total
        </p>
        <div className="split-mode-tabs" role="tablist" aria-label="Split mode">
          <button
            type="button"
            className={mode === "equal" ? "active" : ""}
            onClick={() => setMode("equal")}
          >
            Equal split
          </button>
          <button
            type="button"
            className={mode === "quantity" ? "active" : ""}
            onClick={() => setMode("quantity")}
            disabled={item.quantity <= 1}
          >
            By quantity
          </button>
        </div>
        {mode === "equal" ? (
          <>
            <div className="share-stepper">
              <span>People sharing</span>
              <div>
                <button
                  type="button"
                  onClick={() => onShareCount(Math.max(2, shareCount - 1))}
                >
                  -
                </button>
                <strong>{shareCount}</strong>
                <button
                  type="button"
                  onClick={() => onShareCount(Math.min(people.length, shareCount + 1))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="portion-map">
              {amounts.map((entry, index) => {
                const person = people[index];
                return (
                  <div key={`${item.id}-${index}`} className="portion-row">
                    <span>
                      <i style={{ backgroundColor: person?.accent ?? "#f4b84a" }} />
                      {item.name} {index + 1}/{shareCount}
                    </span>
                    <b>
                      {person?.name ?? "Open"} · {formatRupiah(entry)}
                    </b>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="quantity-split-status">
              <span>Assigned {assignedQuantity} of {item.quantity}</span>
              <b>{remainingQuantity} left</b>
            </div>
            <div className="portion-map quantity-map">
              {people.map((person) => {
                const quantity = quantityAssignments[person.id] ?? 0;
                return (
                  <div key={person.id} className="quantity-row">
                    <span>
                      <i style={{ backgroundColor: person.accent }} />
                      {person.name}
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => updateQuantityAssignment(person.id, -1)}
                        disabled={quantity === 0}
                      >
                        -
                      </button>
                      <strong>x{quantity}</strong>
                      <button
                        type="button"
                        onClick={() => updateQuantityAssignment(person.id, 1)}
                        disabled={remainingQuantity === 0}
                      >
                        +
                      </button>
                    </div>
                    <b>{formatRupiah(quantity * item.basePrice)}</b>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <button
          className="primary-button"
          type="button"
          onClick={confirmSplit}
          disabled={!canConfirm}
        >
          Assign portions
        </button>
      </motion.div>
    </motion.div>
  );
}

function SummaryScreen({
  total,
  complete,
  index,
  count,
  onMove,
  onBack,
}: {
  total: ReturnType<typeof getPersonTotals>[number];
  complete: boolean;
  index: number;
  count: number;
  onMove: (direction: 1 | -1) => void;
  onBack: () => void;
}) {
  return (
    <Screen className="summary-screen" onBack={onBack}>
      <TopRail left="SUMMARY" right={`${index + 1} / ${count}`} onBack={onBack} />
      <TitleBlock
        title="Ready to settle."
        body={
          complete
            ? "Swipe between friends and check each final amount."
            : "Some items are still unassigned. You can return to the playground."
        }
      />
      <div className="summary-stage">
        <button type="button" onClick={() => onMove(-1)} aria-label="Previous summary">
          ←
        </button>
        <motion.div
          key={total.person.id}
          className="summary-card"
          initial={{ opacity: 0, x: 34 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24 }}
        >
          <div className="summary-head">
            <span className="label">TOTAL FOR</span>
            <strong>{total.person.name}</strong>
            <i style={{ backgroundColor: total.person.accent }} />
          </div>
          <div className="summary-lines">
            {total.portions.length ? (
              total.portions.map((portion) => (
                <div key={portion.id}>
                  <span>{portion.label}</span>
                  <b>{formatRupiah(portion.baseAmount)}</b>
                </div>
              ))
            ) : (
              <div>
                <span>No items assigned</span>
                <b>{formatRupiah(0)}</b>
              </div>
            )}
            <div>
              <span>Service</span>
              <b>{formatRupiah(total.serviceShare)}</b>
            </div>
            <div>
              <span>Tax</span>
              <b>{formatRupiah(total.taxShare)}</b>
            </div>
            {total.roundingShare !== 0 && (
              <div>
                <span>Rounding</span>
                <b>{formatRupiah(total.roundingShare)}</b>
              </div>
            )}
            <div>
              <span>Tax + service</span>
              <b>{formatRupiah(total.addedCharges)}</b>
            </div>
          </div>
          <div className="final-total">
            <span className="label">FINAL AMOUNT</span>
            <strong>{formatRupiah(total.total)}</strong>
          </div>
        </motion.div>
        <button type="button" onClick={() => onMove(1)} aria-label="Next summary">
          →
        </button>
      </div>
      <button className="ghost-button" type="button" onClick={onBack}>
        Back to playground
      </button>
    </Screen>
  );
}

function TopRail({
  left,
  right,
  onBack,
}: {
  left: string;
  right: string;
  onBack?: () => void;
}) {
  return (
    <div className={`top-rail ${onBack ? "has-back" : ""}`}>
      <span className="top-rail-left">
        {onBack && (
          <button className="top-back-button" type="button" onClick={onBack}>
            ←
          </button>
        )}
        <span>{left}</span>
      </span>
      <span>{right}</span>
    </div>
  );
}

function TitleBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="title-block">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
