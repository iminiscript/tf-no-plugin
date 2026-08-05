# Okendo Reviews — Handoff Documentation

## Integration Path: App-Block Path

**Why app-block path?**
All three target placements accept `@app` blocks natively through Horizon's `{% content_for 'blocks' %}` architecture — no custom Liquid code is required:

- `sections/product-information.liquid` uses `{% content_for 'blocks' %}` for its dynamic block area, accepting `@app` blocks (verified in source).
- `blocks/_product-details.liquid` schema declares `{"type": "@app"}` in its `blocks` array, enabling the Okendo Star Rating block to be added near the Product title inside the product details panel.
- `blocks/_product-card.liquid` schema declares `{"type": "@app"}` in its `blocks` array, enabling the Okendo Star Rating as a configurable child block inside every product card on collection and search results pages.
- `sections/search-results.liquid` renders product cards via `{% content_for 'block', type: '_product-card', id: 'product-card', ... %}` (static theme blocks) — those cards accept `@app` child blocks natively.

Manual Widget Plus markup is **not used**. Combining manual markup with app blocks in the same placement would violate Okendo's no-duplicate rule and is unnecessary given full native `@app` support.

---

## Merchant Prerequisites

Before any Okendo widget will render on the storefront, the merchant must complete both steps:

1. **Install the Okendo Reviews Shopify app** from the Shopify App Store and complete the Okendo onboarding flow.
2. **Enable the Okendo Reviews app embed**: in the Shopify Admin go to **Online Store → Themes → Customize → Theme settings → App embeds**, find **Okendo Reviews**, and toggle it **on**. Theme code alone cannot enable this setting — it must be activated by the merchant.

> **Note:** Widget appearance, review moderation, and widget behavior settings are all controlled in the Okendo Admin, not in the theme editor.

---

## Editor Steps — Product Page

**Goal:** Add the Okendo Star Rating near the product title and the Okendo Reviews Widget below the product information area.

1. In the Shopify Admin, go to **Online Store → Themes → Customize**.
2. Navigate to the **Product** template.
3. In the left panel, locate the **Product information** section.
4. Expand the **Details** block (type: `_product-details`) inside that section.
5. Click **Add block** within the Details block.
6. Select **Apps** → **Okendo Star Rating**.
7. Drag the Okendo Star Rating block to position it **near the Product title block** (above the price, not below the buy buttons).
8. Return to the **Product information** section level (not inside Details).
9. Click **Add section** at the page level (below Product information, still within the Product template).
10. Select **Apps** → **Okendo Reviews Widget**.
11. The Okendo Reviews Widget should appear as a full-width app section below the product information area. Do not add it as a nested block inside Product information — it must be a top-level section for correct full-width rendering.
12. Click **Save**.

---

## Editor Steps — Collection Page

**Goal:** Add the Okendo Star Rating inside every product card displayed in the collection grid.

1. In the Shopify Admin, go to **Online Store → Themes → Customize**.
2. Navigate to the **Collection** template.
3. In the left panel, locate the **Collection** section (type: `main-collection`).
4. Find the **Product card** block inside it.
5. Click **Add block** within the Product card block.
6. Select **Apps** → **Okendo Star Rating**.
7. Position the Okendo Star Rating block appropriately within the card (typically below the product title).
8. This single configuration applies to **all product cards** in the collection grid — no per-product setup is needed.
9. Click **Save**.

> **Conflict note — remove the native Review stars block to avoid duplicates:** If the Product card block currently has a native **Review stars** block (`blocks/review.liquid`) configured inside it, remove it after adding the Okendo Star Rating. Leaving both blocks in place will display duplicate ratings (one native, one Okendo) on every product card.

---

## Editor Steps — Search Results Page

**Goal:** Add the Okendo Star Rating inside every product card displayed in search results.

1. In the Shopify Admin, go to **Online Store → Themes → Customize**.
2. Navigate to the **Search** template.
3. In the left panel, locate the **Search results** section (type: `search-results`).
4. Find the **Product card** block inside it.
5. Click **Add block** within the Product card block.
6. Select **Apps** → **Okendo Star Rating**.
7. Position the Okendo Star Rating block within the card as desired.
8. This single configuration applies to **all product cards** in the search results grid.
9. Click **Save**.

> **Conflict note:** Same as collection page — if the native Review stars block is present inside the Product card block, remove it to avoid duplicate ratings.

---

## Conflict Note — Native Review Stars Block

The theme ships a native **Review stars** block (`blocks/review.liquid`). This block is **not deleted or modified** by this integration — it remains available for merchants who are not using Okendo.

However, if the merchant is adopting Okendo Reviews, they **must remove the native Review stars block** from any product card or product details configuration where they add an Okendo Star Rating block. Running both simultaneously will produce two separate rating displays (native placeholder stars + Okendo live data) in the same location.

---

## QA Checklist

Work through this checklist after the merchant has installed the Okendo app, enabled the app embed, and added the blocks in the theme editor.

- [ ] **App embed enabled** — Okendo Reviews app embed is toggled on under Theme settings → App embeds; widgets appear without a hard-coded script URL.
- [ ] **Star Rating on a card with reviews** — On the collection page and search results page, a product card for a product that has published Okendo reviews displays the correct star rating and review count.
- [ ] **Star Rating on a card with no reviews** — A product card for a product with zero reviews shows no broken layout, empty stars, or placeholder content; Okendo controls the empty state.
- [ ] **Reviews Widget — correct product scope** — On a product page, the Okendo Reviews Widget displays reviews belonging to that specific product (not a different product's reviews).
- [ ] **Reviews Widget — full-width rendering** — The Reviews Widget spans the full content width expected for a top-level app section; it is not unnaturally narrow due to incorrect placement inside a nested block.
- [ ] **Click-to-scroll behavior** — Clicking the star rating on the product page navigates or scrolls to the Okendo Reviews Widget below. This is Okendo's default behavior; do not disable it unless explicitly required.
- [ ] **No duplicate ratings — product page** — The product page shows exactly one rating display (Okendo Star Rating) and one full review experience (Okendo Reviews Widget). No native Review stars block is rendering alongside Okendo.
- [ ] **No duplicate ratings — product cards** — Collection and search results cards show exactly one rating display per card (Okendo Star Rating only, no native Review stars block).
- [ ] **Mobile layout integrity** — On a 375 px viewport, check the product page, collection page, and search results page for: no horizontal overflow, no broken spacing around the star rating blocks, no obscured interactive controls, no excessive empty space around the Reviews Widget.
- [ ] **Theme editor design mode** — Opening the theme editor with the Okendo blocks configured does not produce duplicate widget renders or visual conflicts in the editor preview.

---

## Edge Case — Okendo App Block Not Available Inside Product Card

In some Okendo app extension versions, the Star Rating block may not be surfaced as an addable child block within the `_product-card` block configuration in the Shopify editor (rare, depends on the app extension's `available_as_child` or `allowed_in` config).

If during QA step the "Add block → Apps → Okendo Star Rating" option does not appear inside the Product card block on collection or search results pages:

1. Check that the Okendo app embed is enabled and the Okendo Reviews app extension is up to date.
2. Contact Okendo support to confirm their Star Rating block supports child-block placement inside third-party theme blocks.
3. If the issue persists, switch to the **Manual Widget Plus path** for product-card ratings only: create `snippets/okendo-reviews-product-rating-summary.liquid` and `blocks/okendo-star-rating.liquid` (a theme block wrapper rendering the snippet) — then add this theme block inside the product card via the editor. Refer to Okendo's Widget Plus documentation for the required `data-oke-star-rating` and `data-oke-reviews-product-id` markup. The product-page placements (Star Rating inside Details and Reviews Widget as app section) are unaffected by this edge case.

---

## Technical Verification (Source Confirmations)

The following were confirmed by reading the actual theme source files before writing this document:

| Claim | Source confirmation |
|---|---|
| `sections/product-information.liquid` uses `{% content_for 'blocks' %}` | Line 22 of that file |
| `blocks/_product-details.liquid` schema contains `{"type": "@app"}` | Line 79 of that file |
| `blocks/_product-card.liquid` schema contains `{"type": "@app"}` | Line 61 of that file |
| `sections/search-results.liquid` renders via `{% content_for 'block', type: '_product-card', id: 'product-card', ... %}` | Lines 56–58 of that file |

No Okendo SDK URL, script loader, API key, account identifier, or credential is hardcoded anywhere in the theme. No new snippets were created without a render caller. No existing theme files were modified.
