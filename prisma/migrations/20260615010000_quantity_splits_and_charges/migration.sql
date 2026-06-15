ALTER TABLE "Bill"
ADD COLUMN "taxBase" TEXT NOT NULL DEFAULT 'subtotal_plus_service',
ADD COLUMN "roundingDelta" INTEGER;

ALTER TABLE "Portion"
ADD COLUMN "quantity" INTEGER,
ADD COLUMN "unitAmount" INTEGER,
ADD COLUMN "splitMode" TEXT NOT NULL DEFAULT 'full';

UPDATE "Portion"
SET "splitMode" = CASE
    WHEN "source" = 'split' THEN 'equal'
    ELSE 'full'
  END;
