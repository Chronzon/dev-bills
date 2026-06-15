# Dev Bills PRD

Last updated: 2026-06-15

## Purpose

This document is the living product and implementation source of context for Dev Bills. Keep it updated whenever product decisions, UI direction, calculation rules, deployment behavior, or feature scope changes. The base language is English; Indonesian should only be used when it is clearer for local receipt or domain context.

## Product Summary

Dev Bills is a browser-based split bill app for the creator and their friends. It is designed for restaurant receipts, shared activities, and mixed bills where different people consume different items. The core interaction is a visual assignment playground: bill portions appear as text-only bubbles, and users assign them to people through drag, swipe, and focused split interactions.

The app should feel like a premium modern iOS-style browser product: calm, glassy, responsive, and smooth. It should support both mobile and desktop without showing fake phone chrome such as iOS status bars.

## Target Users

- Primary users: the creator and friends.
- Main use cases: eating out, playing billiards, shared activities, and bills with mixed personal/shared items.
- Common scenario: several people share a table charge, food and drinks are individual or partially shared, and the receipt includes service charge and tax.

## Product Goals

- Make bill splitting intuitive, visual, and pleasant.
- Let users assign each item or quantity portion to the correct person without using a spreadsheet-like calculator.
- Support real receipt scanning as a draft input, with review and manual correction before assignment.
- Support full-item assignment, equal splits, uneven quantity splits, service charge, tax, and rounding reconciliation.
- Persist bill state so users can refresh and continue the same split.
- Keep deterministic bill calculation in application code. OCR and parsing only pre-fill editable draft data.

## Non-Goals

- Authentication or user accounts.
- Payment collection.
- Marking a bill as paid.
- Export/share image generation.
- Literal food/product illustrations.
- Literal basket UI for people.
- Trusting OCR output without user review.

## Design Direction

The visual direction is dark, cinematic, abstract, and calm:

- Dark monochrome base with black, graphite, white, translucent glass, and restrained amber/cyan accents.
- Dynamic dotted particle surface as the primary full-viewport background motif.
- Dots should feel active, not like a static pattern: drift, pulse, central light, pointer response, and device-orientation response where available.
- Sparse technical layout rather than colorful playful UI.
- Text-only item bubbles and chips, not literal product or food imagery.
- Minimal iOS-like surfaces with smooth screen and modal transitions.
- Desktop should have intentional responsive compositions, not a framed mobile mockup.

## Core User Flow

### 1. Home

The home screen starts the split and sets the mood.

Required behavior:

- Full-viewport animated dotted surface.
- `Split softly.` headline.
- Rotating quote directly under the headline.
- Start/new split action.
- Continue existing split when an active bill id is stored locally.
- Desktop layout should use a distinct composition with a polished top rail and larger call-to-action area.

### 2. Receipt Input

Users can upload one or more receipt images. The backend scans images with local OCR and returns a draft bill. The draft is not treated as final truth.

Current behavior:

- `POST /api/receipts/scan` accepts receipt images.
- OCR uses Tesseract.js with Sharp preprocessing variants.
- Parsed draft bill includes items, quantities, raw lines, confidence, service charge, tax, totals, and warnings when reconciliation is suspicious.
- Manual review remains mandatory before entering the playground.

### 3. Item Review

The review screen lets users inspect and correct detected bill data.

Current behavior:

- Item rows show name, unit price, quantity, and line total.
- Users can edit item names, unit prices, and quantities.
- Draft input values are held as strings while typing so values like `1` can be deleted and replaced with `7`.
- Users can add missing items or remove wrong items.
- Review shows the backend calculation context: item subtotal, detected subtotal, service, tax, grand total, effective multiplier, and reconciliation warning.

### 4. People Setup

Users add and name the people involved in the bill.

Current behavior:

- People are name-first with subtle accent colors.
- Users can add, rename, and remove people.
- Removing a person clears assignments that referenced that person.

### 5. Assignment Playground

The playground is the main bill assignment surface.

Current behavior:

- Unassigned portions appear as draggable text-only bubbles.
- Remaining unassigned subtotal updates as portions are assigned.
- One active person card is shown at the bottom.
- Users navigate between people using carousel controls.
- Users drag bubbles onto the active person card to assign them.
- The active card uses a lower-card drop zone so assignment feels intentional.
- Assigned portions remain draggable and can be dragged out to become unassigned again.

Known interaction gap:

- Touch swipe navigation between people is part of the desired product behavior, but current implementation uses carousel controls rather than a dedicated swipe gesture for person navigation.

### 6. Split Item Interaction

Shared items are handled from an item-level split modal.

Current behavior:

- Long-pressing an item opens a focused split modal.
- Equal split mode creates labeled portions such as `Pizza 1/3`, `Pizza 2/3`, and `Pizza 3/3`.
- Quantity split mode is the default for items with quantity greater than 1.
- Quantity split mode assigns grouped item counts directly to people, for example `Sate Telur Gulung x4`, `x2`, and `x1`.
- Partial quantity split leaves a grouped unassigned remainder bubble, for example `Sate Telur Gulung x3`.
- Quantity portions store assigned quantity and unit amount instead of creating one bubble per item count.

### 7. Final Summary

The summary screen shows one person at a time.

Current behavior:

- Each person card shows assigned portions, subtotal, service share, tax share, rounding share when nonzero, added charges, and final total.
- Final totals include proportional tax/service allocation.
- Rounding is reconciled so the sum of person totals matches the detected receipt grand total when receipt totals are available.

## Bill Calculation Requirements

The app must support restaurant bills where service and tax are added after item subtotal, and bills where charges are already included.

Current calculation rules:

- `BillItem.basePrice` is the unit price.
- `BillItem.quantity` is the ordered quantity.
- `Portion.baseAmount` is the assigned base subtotal for that portion.
- `Portion.quantity` stores assigned item count for quantity splits.
- `Portion.unitAmount` stores unit price for quantity splits.
- `Portion.splitMode` is `full`, `equal`, or `quantity`.
- Service share, tax share, and rounding share are allocated proportionally by each person's assigned base subtotal.
- Rounding leftover is assigned deterministically by largest fractional remainder.
- If receipt subtotal, service, tax, and grand total are detected, raw receipt amounts win over inferred rates.
- Indonesian restaurant receipts default to tax on `subtotal + service` when that reconciles best; fallback is tax on subtotal.
- Contradictory OCR totals should surface a review warning and remain editable.

Required parser behavior:

- `3x AMERICANO 96.000` should parse as quantity `3`, unit price `32.000`, and line total `96.000`.
- `335.000 + 16.750 + 35.175 = 386.925` should infer service `5%`, tax `10%` on subtotal plus service, and total `386.925`.

## Data Model

### Bill

- `id`
- `currency`
- `people`
- `items`
- `portions`
- `charges`
- `sourceImages`
- `receiptMeta`

### Bill Item

- `id`
- `name`
- `basePrice`
- `quantity`
- `components`
- `confidence`
- `needsReview`
- `rawLines`

### Portion

- `id`
- `itemId`
- `label`
- `baseAmount`
- `assignedPersonId`
- `source`
- `quantity`
- `unitAmount`
- `splitMode`

### Charges

- `taxRate`
- `serviceRate`
- `included`
- `subtotal`
- `serviceAmount`
- `taxAmount`
- `total`
- `taxBase`
- `roundingDelta`

### Receipt Meta

- `merchant`
- `receiptDate`
- `subtotal`
- `taxAmount`
- `serviceAmount`
- `total`
- `warnings`

## Technical Direction

Current stack:

- Next.js App Router with TypeScript.
- Custom CSS for the glass UI and responsive layout.
- Motion for React for screen and modal animation.
- dnd-kit for touch and mouse drag assignment.
- Tesseract.js and Sharp for local receipt OCR.
- Prisma with PostgreSQL for persistent bill storage.
- In-memory fallback storage when `DATABASE_URL` is not set.
- Docker Compose for the production-style stack.

Important files:

- `components/dev-bills-app.tsx`: main browser flow.
- `components/dotted-surface.tsx`: animated dotted background.
- `features/bill/engine.ts`: split creation, assignment, charge allocation, and summary totals.
- `features/bill/store.ts`: memory/Postgres bill persistence and mutations.
- `features/bill/types.ts`: shared bill types.
- `features/receipt/ocr.ts`: OCR worker and image preprocessing.
- `features/receipt/parser.ts`: deterministic receipt parser and charge inference.
- `app/api/receipts/scan/route.ts`: receipt upload/scan API.
- `app/api/bills/**`: bill, people, item, split, assignment, and summary APIs.
- `prisma/schema.prisma`: database schema.
- `prisma/migrations/**`: migration history.
- `docker-compose.yml`: local production-style app and Postgres stack.
- `Dockerfile`: production image build and startup command.

Useful scripts:

- `npm run dev`: start local development server.
- `npm run typecheck`: Prisma generate plus TypeScript validation.
- `npm run lint`: ESLint validation.
- `npm run build`: production build validation.
- `npm run db:migrate:deploy`: apply migrations to the configured database.
- `npm run test:scan`: scan every image in `data-test-bill` against the running local API.

## Deployment And Database

Local Docker flow:

- `docker compose up --build -d` starts Postgres, runs migrations, and starts the app.
- Compose requires `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` from environment variables.
- In Coolify, those values should come from shared/environment variables, not committed files.
- The `migrate` service runs `npm run db:migrate:deploy` as a one-off step before the app starts.
- The app container only runs `npm run start`.
- Postgres is not published to the host by default; only the app port is exposed.

Production guidance:

- Production deploys should apply Prisma migrations before serving the new app version.
- The current Compose file uses a separate `migrate` service so the app startup command does not run migrations repeatedly.
- If the app is scaled beyond one instance, keep migration execution as a one-off deploy step and avoid running migrations from every app replica.

## OCR And Receipt Parsing Direction

The backend should remain small and focused on receipt intelligence plus persistence:

- Receive receipt image uploads.
- Run OCR or receipt parsing.
- Return structured item suggestions as JSON.
- Validate and normalize prices, quantities, subtotal, tax, service, and total values.
- Let the review screen remain the user-confirmed source of truth.

Receipt parsing tiers:

- Local OCR with Tesseract.js is the current default scanner.
- Optional cloud receipt parser may be added later for better structured JSON.
- Optional vision LLM fallback may be used for difficult receipts, but never as the default calculation engine.

LLM or advanced parser output must be schema-validated and must not directly control final bill calculation without user review.

Important limitation:

- No OCR system will perfectly handle every bill. Clean printed receipts should work best. Crumpled, blurry, unusual, or handwritten bills may require manual correction.
- The current parser is deterministic and intentionally conservative; scan results are suggestions for the review screen, not final bill truth.

## Accessibility And Responsiveness

- Touch and mouse interactions must both work.
- The app should be responsive as a real browser product, not a fixed mobile mockup inside a desktop frame.
- Desktop layouts may use wider compositions while preserving the same product flow.
- Drag actions should have a fallback for users who cannot drag.
- Text must remain readable on small screens.
- Important actions should not rely on motion alone.
- Respect `prefers-reduced-motion`.
- Avoid excessive blur where it harms readability.

## Open Questions

- What is the final app name?
- Should discounts be split proportionally, assigned manually, or both?
- Should final cards support sharing/export later?
- Should there be a manual "tax/service included" toggle in review?
- Should the playground support undo/redo?
- Should person navigation add direct swipe gestures in addition to carousel controls?
- Should production eventually use an external managed Postgres service instead of the bundled Compose Postgres service?

## Product Decisions So Far

- The app is for the creator and friends first.
- The app runs in the browser and adapts between mobile and desktop.
- The visual mood is minimalist, elegant, glassy, dark, and calm.
- The home background uses a dynamic dotted surface and reacts to gyro, cursor, or touch movement.
- Food and product items remain text-only bubbles or chips.
- People are navigated through one active person card rather than four simultaneous default cards.
- Assignment requires dragging lower and closer to the active card before it accepts an item.
- Assigned items can be dragged out of the active card to return them to the playground.
- Shared items support both equal splits and quantity-based uneven splits.
- Receipt scanning is implemented as a draft input, not an authority.
- Item editing is required because OCR is imperfect.
- Tax, service, and rounding are allocated proportionally by assigned subtotal.
- Raw receipt totals are preserved and shown during review.
- PostgreSQL persistence is the production path, with memory fallback only for quick local UI work.
- Production secrets must be supplied through environment variables, such as Coolify shared variables.
- Migrations are managed by a dedicated Compose `migrate` service.
- The `dev` branch is the active development branch; `main` is reserved for production promotion after explicit approval.

## Maintenance Note

When future work changes product direction or implementation reality, update this PRD in the same turn. Remove stale planned features when they are dropped, and move answered questions into product decisions.
