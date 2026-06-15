-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "serviceRate" DOUBLE PRECISION NOT NULL,
    "chargesIncluded" BOOLEAN NOT NULL,
    "sourceImages" JSONB,
    "merchant" TEXT,
    "receiptDate" TEXT,
    "subtotal" INTEGER,
    "taxAmount" INTEGER,
    "serviceAmount" INTEGER,
    "total" INTEGER,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "components" JSONB,
    "confidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN,
    "rawLines" JSONB,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portion" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "assignedPersonId" TEXT,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Portion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_billId_sortOrder_idx" ON "Person"("billId", "sortOrder");

-- CreateIndex
CREATE INDEX "BillItem_billId_sortOrder_idx" ON "BillItem"("billId", "sortOrder");

-- CreateIndex
CREATE INDEX "Portion_billId_sortOrder_idx" ON "Portion"("billId", "sortOrder");

-- CreateIndex
CREATE INDEX "Portion_itemId_idx" ON "Portion"("itemId");

-- CreateIndex
CREATE INDEX "Portion_assignedPersonId_idx" ON "Portion"("assignedPersonId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portion" ADD CONSTRAINT "Portion_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portion" ADD CONSTRAINT "Portion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BillItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portion" ADD CONSTRAINT "Portion_assignedPersonId_fkey" FOREIGN KEY ("assignedPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

