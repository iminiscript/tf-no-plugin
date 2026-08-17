# Intelligems Price-Testing Integration

This document describes what was wired in the Horizon theme to make it Intelligems-ready for price A/B testing.

---

## 1. What Was Tagged

Every price surface in the theme has been tagged with the Intelligems DOM contract:
- `igPrice` class + `data-product-id` on the **selling price** element
- `igComparePrice` class + `data-product-id` on the **compare-at price** element (when present)

### Tagged Surfaces

| Surface | File(s) |
|---|---|
| PDP selling price | `snippets/price.liquid` → `blocks/price.liquid` → `sections/product-information.liquid` |
| PDP compare-at price | `snippets/price.liquid` |
| Product cards (collection, search, recommendations) | `snippets/price.liquid` → `blocks/price.liquid` → `blocks/_product-card.liquid` |
| Featured product section | `snippets/price.liquid` → `blocks/price.liquid` → `sections/featured-product-information.liquid` |
| Recommended products | `snippets/price.liquid` (same shared snippet) |
| Cart page line-item unit price | `snippets/cart-products.liquid` (per-unit price in `cart-items__unit-price-wrapper`) |
| Cart drawer line-item unit price | `snippets/cart-products.liquid` (same snippet, rendered via `snippets/cart-drawer.liquid`) |

All tagging in `snippets/price.liquid` is behind an `enable_intelligems` parameter that defaults to `true`. Pass `enable_intelligems: false` explicitly at any `{% render 'price' %}` call site to opt a specific surface out.

### Morph-Skip Wrapper

A `<div class="cart-drawer__ig-inject" data-skip-subtree-update></div>` has been added between the cart items and cart summary in `snippets/cart-drawer.liquid`. This zone is invisible by default; Intelligems can inject content here (e.g. `<ig-progress-bar>` for shipping-threshold tests) and cart morphs will not remove it.

---

## 2. What Was Wired (`assets/intelligems.js`)

The module `assets/intelligems.js` is loaded as `type="module"` from `snippets/scripts.liquid` and runs as a side-effect. It implements the full Intelligems integration contract:

### igRestart() — debounced, guarded restart
- Clears any pending timer, then after **150 ms** calls `window.igData?.restart()`
- Every access uses optional chaining (`?.`) so the theme works identically when the Intelligems app embed is disabled (no console errors, no broken UI)

### MutationObserver on `product-price` elements (`observePriceContainers`)
- Horizon's `product-price.js` calls `replaceWith()` on `[ref="priceContainer"]` (a direct child of each `product-price` element) when the shopper picks a variant via the Section Rendering API
- A `{ childList: true }` observer fires on this replacement and calls `igRestart()` so Intelligems re-swaps the new price HTML
- Elements are marked `_igObserved` to prevent duplicate observers

### Drawer-open detection with cart-token gate
- A `MutationObserver` on `document.body` watches for the `open` attribute being set on `#cart-drawer` (the `theme-drawer` custom element sets this when opening)
- On open: fetches `/cart.js`, computes a cart token (`item_count|total_price|variant:qty,...`), and calls `igRestart()` **only when the token differs** from the last known state — skipping no-op drawer opens where nothing changed
- After every open, `observePriceContainers()` is called again to tag any `product-price` elements newly rendered inside the drawer

### `ig:CartUpdated` sync-back with suppress flag
- When Intelligems fires `ig:CartUpdated` on `window` (signalling it mutated the cart for an offer/shipping test), the handler fetches `/cart.js` to update `lastToken` and dispatches `cart:refresh` to sync the theme's cart state
- `suppress` is set to `true` before the fetch and reset in a `finally` block
- The `quantity-selector:update` handler checks `if (suppress) return;` before calling `igRestart()`, preventing a feedback loop

### `quantity-selector:update` listener
- Fires `igRestart()` whenever the shopper adjusts a cart quantity (Horizon's `QuantitySelectorUpdateEvent` dispatched as `'quantity-selector:update'` on `document`)
- Skipped when `suppress` is active

---

## 3. Merchant Setup Steps

1. **Install Intelligems** from the [Shopify App Store](https://apps.shopify.com/intelligems-price-testing)
2. **Enable the Intelligems app embed** in your store:
   - Shopify Admin → Online Store → Themes → Customize → App embeds
   - Toggle on **Intelligems** and save
   - ⚠️ **This step is required.** The app embed loads the Intelligems SDK. Without it, no prices will be swapped — the theme code above only wires the integration, it does not load the SDK.
3. **Configure tests, offers, and audiences** in the [Intelligems dashboard](https://app.intelligems.io/)
   - Create price tests, shipping-threshold offers, and audience rules there
   - No theme code changes are needed for individual test configuration

---

## 4. QA Script

Run this sequence to verify the integration is working end-to-end.

### Prerequisites
- Intelligems app installed and app embed enabled
- At least one active price test or use Intelligems preview mode (append `?igprice=true` or use the Intelligems Chrome extension)

### Test Steps

| # | Action | Expected result |
|---|---|---|
| 1 | Open the PDP for a product in the price test | Selling price shows the test price; Intelligems swapped `.igPrice[data-product-id]` |
| 2 | Select a different variant | Price updates via Section Rendering API; the new price span still shows the test price (MutationObserver triggered igRestart) |
| 3 | Open the cart drawer | Drawer price matches the PDP price; no original price flash (token-compare called igRestart on open) |
| 4 | Navigate to a collection page | Product card prices show the test price (`igPrice` on card price spans) |
| 5 | Add a product to cart from the collection page | Fly-to-cart animation plays; open the drawer — drawer price matches card price |
| 6 | In the cart drawer, change quantity with the +/− selector | `quantity-selector:update` fires; Intelligems price persists after quantity change |
| 7 | Disable the Intelligems app embed (temporarily) and reload | All prices render as normal; no JS errors in the console (optional-chaining guard) |

---

## 5. File Reference

| File | Change |
|---|---|
| `snippets/price.liquid` | Added `enable_intelligems` param (default `true`); all price span branches carry `igPrice`/`igComparePrice` + `data-product-id` when enabled |
| `snippets/cart-products.liquid` | Cart line-item unit-price spans tagged with `igPrice`/`igComparePrice` + `data-product-id="{{ item.product_id }}"` |
| `snippets/cart-drawer.liquid` | Added `<div class="cart-drawer__ig-inject" data-skip-subtree-update></div>` morph-skip zone between cart items and cart summary |
| `assets/intelligems.js` | New file — implements the full Intelligems contract (restart, observers, sync) |
| `snippets/scripts.liquid` | Added `@theme/intelligems` importmap entry; loads `intelligems.js` as a deferred module |
