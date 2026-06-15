# Dev Bills PRD

Last updated: 2026-05-20

## Purpose

This document captures the product direction for a browser-based split bill application. It should be treated as the living source of context for future design and implementation work. Keep this file updated whenever product decisions, UI direction, calculation rules, or scope change.

## Product Summary

Dev Bills is a split bill app for the creator and their friends. The product should make splitting a receipt feel calm, elegant, and lightly interactive instead of flat and transactional. The core interaction is a browser-based "playground" where bill items are represented as text-only bubbles and users assign them to people through drag, swipe, and focused split interactions.

The app should feel like a premium modern iOS app running in the browser: minimalist, glassy, responsive, and smooth. It should support both mobile and desktop users. The browser app should not show literal phone chrome such as iOS time, signal, or battery indicators; those belong only in design mockups.

## Target Users

- Primary users: the creator and their friends.
- Main use cases: eating out, playing billiards, shared activities, mixed bills where different people consume different items.
- Example scenario: four people are in one bill, three people split the billiard table charge, and the fourth person only pays for food.

## Product Goals

- Make splitting a bill feel intuitive, visual, and pleasant.
- Let users assign each bill item to the correct person without feeling like they are filling out a boring calculator.
- Support shared items where only some people pay for an item.
- Keep the first version focused on UI/UX and frontend interactions.
- Make the product easy to continue in future chats by keeping this PRD up to date.

## Non-Goals For The First Version

- Real receipt OCR or backend-powered item detection.
- Authentication or user accounts.
- Payment collection.
- Marking a bill as paid.
- Export/share image generation.
- Literal food/product illustrations.
- Literal basket UI for people.

## Design Direction

The visual direction should be inspired by dark, cinematic, abstract interfaces like the provided DOSS, Ethereal Shadows, and Dotted Surface references:

- Dark monochrome base with black, graphite, white, and translucent glass.
- Dynamic dotted particle surface as the primary background motif.
- Dots should feel like an active responsive particle field across the whole viewport, not a static pattern and not only a floor at the bottom.
- The particle field should have subtle individual dot drift, alpha/size pulsing, a central light source, and cursor/touch/phone movement response.
- Subtle grids, shadows, and grain can support the background, but ribbons are no longer the preferred direction.
- Sparse, technical, elegant layout rather than colorful playful UI.
- Tiny accent labels are acceptable, but avoid random fake text.
- Neon should be restrained and used as a focus glow, not as the whole palette.
- The app should feel iOS-like: beautiful, minimal, precise, and smooth.
- Use system light/dark preference where possible.
- Avoid childish game aesthetics.
- Avoid literal baskets.
- Avoid food/product images; use text-only bubbles or chips for bill items.
- Avoid cluttered multi-card layouts.

## Interaction Principles

- Interactions should feel "buttery": smooth, responsive, and calm.
- Every interactive element should work on both touch and pointer devices.
- Motion should support reduced-motion preferences.
- Mobile should feel first-class, but desktop should still feel intentional.
- Desktop should use its own responsive browser layout instead of showing a framed mobile app centered on the page.
- The playful part is the interaction, not the visual style.

## Core User Flow

### 1. Home

The home screen should be very simple.

Required elements:

- Abstract live background with subtle movement.
- Dynamic dotted surface inspired by the latest reference.
- Dots should be visible on mobile and desktop at the same background layer level.
- Phone gyro support for parallax or background movement where available.
- Desktop pointer movement fallback for parallax.
- Rotating quote that refreshes every couple of minutes with a smooth transition.
- The rotating quote should live directly below the main `Split softly.` headline using the existing quiet subtitle style.
- Do not use a separate quote card or label such as `Refreshing quote` on the home screen.
- Minimal primary action: Start Split.
- Desktop home should have a distinct responsive composition, not a stretched mobile layout. Current direction: large editorial headline/quote on the left and a proportionally larger CTA on the right.
- Desktop top rail should be refined: `DEV BILLS` has a small geometric mark, while `BROWSER` appears as a restrained glass pill.

The background should feel like a live shader or procedural abstract art, not a decorative static image.

### 2. Receipt Input

Users should be able to upload one or more receipt images in the eventual product.

For the first frontend-focused version:

- Use mock receipt data or manual placeholder data.
- The UI can still show an upload step for flow completeness.
- Real OCR/detection will be handled later.

### 3. Item Review

After receipt input, the system shows detected/categorized bill items.

For the first version:

- Items are text-only bubbles/chips/cards.
- Each item has a name and price.
- Users should have manual fallback controls to edit detected items or add missing items if the scanner/OCR result is wrong.
- Users should be able to understand that the data is editable later, even if editing is not fully implemented in the first prototype.

Example items:

- Billiard Table
- Pizza
- Iced Tea
- Fries

### 4. People Setup

The app asks how many people are involved in the bill and lets the user name them.

People should be represented elegantly:

- Name-first design.
- Minimal, beautiful person cards.
- Optional initials or subtle color accents.
- No cartoon avatars required.

The design should allow adding a new person later from the playground if needed.

### 5. Assignment Playground

This is the main interaction area.

Required behavior:

- Bill items float as text-only bubbles/chips.
- A remaining bill total is visible and updates as items are assigned.
- The bottom of the screen contains one large full-width person card.
- Users swipe horizontally across the bottom card to move between people.
- Desktop users can use drag, click, keyboard, or carousel controls as appropriate.
- Users drag an item bubble onto the currently active person card to assign it.
- The active person card should only catch a dragged item when the pointer is lower and close to the card, not from a loose high-distance "magnet" interaction.
- Assigned items should remain draggable from the person card. Dragging one back outside the card returns it to the unassigned playground so users can fix mistakes.
- Assigned items reduce the remaining unassigned bill cost.
- Items should be movable/reassignable.

Important design decision:

- Do not show four person cards at the same time as the default.
- The primary pattern is one active card at the bottom, with swipe/slide navigation between people.
- On desktop, the playground can use a three-column composition: remaining total, floating item field, and active person card.

### 6. Split Item Interaction

Shared items should be handled flexibly at the item level.

Preferred interaction:

- User holds, long-presses, or opens an action on an item such as "Pizza."
- The rest of the screen blurs or dims.
- The selected item remains in focus.
- A minimal iOS-style overlay asks whether to split the item.
- User chooses how many people should share it.
- The item visually splits into equal text fragments/portions.
- Each split portion should become a labeled token such as `Pizza 1/3`, `Pizza 2/3`, and `Pizza 3/3`.
- Each portion token should show the assigned person and amount once assigned, such as `Andi · Rp13.333`.
- Each portion can then be assigned to a person.

Example:

- Pizza costs Rp40.000.
- User splits it by 3 people.
- The app creates three equal portions of Rp13.333 or handles rounding clearly.
- Each portion can be dragged to a different person card.

The split interaction should feel elegant and satisfying, not childish. Prefer a scalable "portion ownership map" over literal food pieces, because it will work better when there are many people or many items.

### 7. Final Summary

The final page shows one person at a time using swipeable cards.

Design direction:

- Similar feeling to a Spotify-style card or modern iOS summary card.
- One large card is active.
- User slides between people.
- Each card shows the person's name, assigned items, subtotal, tax/service, and final total.

For the first version, viewing the result is enough.

## Bill Calculation Requirements

The app must support bills where tax and service are added at the end, as well as bills where tax/service are already included.

Example rule from user:

- Tax: 10%
- Service: 5%
- Combined multiplier: 1.155
- If a person's base subtotal is Rp40.000, final total is Rp40.000 x 1.155.

Required calculation concepts:

- Each item has a base price.
- Each item can be assigned to one person or split between multiple people.
- Each person's base subtotal is calculated from assigned full items and shared portions.
- Bill-level charges can be applied after assignment.
- The app should support a tax/service multiplier model internally when useful. For example, 10% tax plus 5% service can be treated as a combined multiplier of `1.155` for easier calculation.
- The UI should show the exact added charge amount per person, not only the multiplier. Example: show `Tax + service Rp4.857` instead of `x1.155`.
- The app should eventually support bills where tax/service are included in item prices.

Rounding should be handled explicitly, especially for split portions.

## Suggested Data Model

### Receipt

- id
- sourceImages
- items
- charges
- currency
- createdAt

### Bill Item

- id
- name
- basePrice
- quantity
- assignmentStatus
- portions

### Person

- id
- name
- accentColor
- assignedPortions

### Portion

- id
- itemId
- label
- baseAmount
- assignedPersonId

### Charges

- taxRate
- serviceRate
- multiplier
- chargesIncluded
- discountAmount
- roundingMode

## MVP Scope

The first interactive frontend prototype should include:

- Browser app shell.
- Home screen with procedural dotted particle background.
- System light/dark mode support.
- Gyro parallax on supported phones.
- Pointer parallax on desktop.
- Rotating quote directly under the main home headline.
- Start Split button.
- Mock upload/receipt flow.
- Mock bill items as text bubbles.
- Manual `Edit items` and `Add item` actions on the item review screen.
- People setup with names.
- One active bottom person card with swipe navigation.
- Drag item bubbles to the active person card.
- Remaining bill total updates.
- Long-press or action-based split item modal.
- Split item into equal portions.
- Final swipeable summary cards.

Current implementation status:

- Implemented as a Next.js App Router + TypeScript frontend app.
- The current UI is still running from mock bill data; backend OCR exists but is not wired into the UI yet.
- The app is responsive and no longer uses a fake phone frame or literal iOS status bar.
- The dynamic dotted particle background is implemented as a full-viewport canvas layer.
- The particle field currently has per-dot drift, size/alpha pulsing, pointer response, and device-orientation response.
- The UI includes the home, review, people setup, playground, split modal, and summary screens.
- Drag assignment uses dnd-kit.
- Drag assignment uses a lower-card drop zone instead of a broad nearest-card magnet.
- Assigned items on the active person card can be dragged back out of the card to become unassigned again.
- The active person card empty state is intentionally quiet: a subtle slot marker with a short `No items yet` status instead of instructional helper copy.
- Post-home screens include a back control and support a left-edge touch swipe back gesture for returning to the previous step.
- Screen/modal animation uses Motion for React.
- Bill calculation is deterministic TypeScript logic.
- A backend-first OCR/API pass is implemented with Next.js route handlers.
- `POST /api/receipts/scan` accepts receipt image uploads, runs local OCR with Tesseract.js, preprocesses images with Sharp, and returns raw OCR lines plus parsed bill suggestions.
- Backend bill APIs exist for creating bills, fetching bills, updating people, splitting items, assigning portions, and reading summaries.
- Backend bill storage is currently in memory and resets when the dev server restarts.
- OCR/parser testing uses sample receipt images from `data-test-bill`.
- Current OCR quality is best on the high-resolution phone photos. The older low-resolution samples still require manual review and are expected to produce imperfect item names.
- Current local dev URL: `http://localhost:3000` when `npm run dev` is running.

## Technical Direction

The app should run in the browser and remain simple enough for Node-based deployment, potentially on Dewacloud.

Preferred first implementation direction:

- Frontend-first prototype.
- Use mock data before backend/OCR.
- Keep architecture simple.
- Use browser APIs for interaction where possible.
- Use `prefers-color-scheme` for system theme.
- Use `DeviceOrientationEvent` for gyro where supported.
- Use pointer movement fallback for desktop parallax.
- Store prototype state locally in memory or local storage.

Chosen first-build stack:

- Next.js App Router with TypeScript.
- Custom CSS for the iOS/glass/dotted-surface visual system.
- Motion for React for screen and modal animation.
- dnd-kit for touch and mouse drag assignment.
- Frontend prototype still uses mock receipt data and deterministic bill logic.
- Backend OCR uses Tesseract.js with local English trained data and Sharp image preprocessing.

Important implementation files:

- `app/page.tsx`: app entry.
- `app/globals.css`: global responsive layout, glass UI, desktop/mobile composition, and visual styling.
- `components/dev-bills-app.tsx`: main interactive prototype flow.
- `components/dotted-surface.tsx`: full-viewport animated particle background.
- `features/bill/engine.ts`: bill calculation, split portions, assignment, remaining total, per-person totals.
- `features/bill/types.ts`: bill data types.
- `features/bill/store.ts`: in-memory backend bill store and bill mutations.
- `features/receipt/ocr.ts`: local OCR worker, preprocessing variants, and receipt scan orchestration.
- `features/receipt/parser.ts`: deterministic parser for OCR lines, charge rows, totals, and chargeable item suggestions.
- `app/api/receipts/scan/route.ts`: receipt image upload and scan API.
- `data/mock-bill.ts`: mock receipt/person data.
- `data-test-bill`: local receipt images used for scan testing.

Useful scripts:

- `npm run dev`: start local development server.
- `npm run typecheck`: TypeScript validation.
- `npm run lint`: ESLint validation.
- `npm run build`: production build validation.
- `npm run test:scan`: scan every image in `data-test-bill` against the running local API.

## Future Backend And Receipt Parsing Direction

The product does not need a large backend with admin/customer roles. The backend should remain small and focused on the "brain" of the operation:

- Receive receipt image uploads.
- Run OCR or receipt parsing.
- Return structured item suggestions as JSON.
- Validate and normalize prices, totals, tax, and service values.
- Let the frontend review screen remain the source of truth after user confirmation.

Recommended principle:

- Calculation logic should be deterministic application code, not an LLM.
- AI/OCR should only help pre-fill receipt data.
- The user must always be able to edit or add items after scanning.

Possible receipt parsing tiers:

- Manual/mock input for the first frontend prototype.
- Local OCR with Tesseract.js for low-cost printed text extraction. This is now implemented as the first backend scanner.
- Optional cloud receipt parser later for better structured JSON.
- Optional vision LLM fallback through a provider such as OpenRouter only for difficult receipts, not as the default calculation engine.

Fallback vision LLM use case:

- Use when local OCR returns low confidence, messy text, or a complex receipt hierarchy.
- Useful for receipts where bundles/packages contain child components that should not become separate chargeable split items.
- Example: a McDonald's package such as `PaNas 2M` should be treated as the main chargeable item, while `M Frutea Lemon` and similar indented lines can be stored as child components of that package.
- The parser should distinguish chargeable top-level items from included package components, modifiers, notes, discounts, tax rows, and payment rows.
- Even when the LLM is used, the review screen remains mandatory.

Receipt item structure should eventually support:

- `name`
- `price`
- `quantity`
- `isChargeable`
- `parentItemId`
- `components`
- `confidence`
- `needsReview`
- `rawLines`

Important limitation:

- No OCR or vision system will perfectly handle every bill. Clean printed receipts should work best. Crumpled, blurry, unusual, or handwritten bills may require manual correction.
- The current parser is deterministic and intentionally conservative; scan results are suggestions for the review screen, not final bill truth.
- The next backend step should improve parser reconciliation and then wire scan results into the review UI.
- LLM output must be schema-validated and should never directly control final bill calculation without user confirmation.

## Accessibility And Responsiveness

- Touch and mouse interactions must both work.
- The app should be responsive as a real browser product, not a fixed mobile mockup inside a desktop frame.
- Desktop layouts may use wider multi-column compositions while preserving the same product flow.
- Actual browser UI should never include mock-only phone chrome such as time, 5G, battery, or iPhone status indicators.
- Drag actions should have a fallback for users who cannot drag.
- Text must remain readable on small screens.
- Important actions should not rely on motion alone.
- Respect `prefers-reduced-motion`.
- Avoid excessive blur where it harms readability.

## Open Questions

- What is the final app name?
- Should item quantities be supported immediately?
- How should rounding differences be assigned when splitting unevenly?
- Should discounts be split proportionally or assigned manually?
- Should final cards support sharing/export later?
- Should there be a manual "bill included tax/service" toggle?
- Should people have accent colors, initials, or only names?
- Should the playground support undo/redo?
- Should `Edit items` and `+ Add item` become fully functional before OCR work starts?
- Should the next iteration prioritize interaction polish, item editing, or scanner/OCR research?

## Product Decisions So Far

- The app is for the creator and friends first.
- The first priority is UI/UX and frontend interaction, not backend/OCR.
- The app should run in the browser.
- The implemented browser UI should fill the available viewport and adapt between mobile and desktop rather than rendering inside a fake device frame.
- The design should feel like a modern iOS app.
- The visual mood should be minimalist, elegant, glassy, dark/light capable, and calm.
- The home screen should be simpler than earlier mockups.
- The home background should use a dynamic dotted surface and react to gyro, cursor, or touch movement.
- The dotted surface should be full-screen, visible on mobile, and feel like active particles with subtle individual movement.
- The home quote should sit below `Split softly.` and should not appear in a separate frosted card.
- The desktop home layout should use its own proportions, with a polished top rail and desktop-sized CTA rather than a mobile button stretched across the viewport.
- Food and product items should not be image-based.
- Items should be text-only bubbles or chips.
- People should not appear as four simultaneous cards by default.
- The bottom interaction should use one full-width active person card that can be swiped between people.
- Assignment should feel intentional: the user must drag lower and closer to the active card before it accepts an item.
- Assigned items can be dragged out of the active card to return them to the playground.
- Shared items should be splittable through an item-level focused interaction.
- Backend/OCR work is now in scope before UI integration, but the UI should only consume scanned draft data after the backend output is reviewed and stable.

## Maintenance Note

When future work changes the product direction, update this PRD in the same turn. This file exists so a new chat can quickly understand what has already been discussed and continue without losing context.
