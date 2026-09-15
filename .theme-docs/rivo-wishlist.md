# Rivo Wishlist — Handoff Documentation

## What Was Built

A wishlist/favorites feature that pairs a client-side localStorage layer (instant UI) with Rivo's API (server authority) to deliver responsive heart buttons on product cards and the PDP gallery.

### Architecture: Why Two Layers?

Two verified production facts make an API-only approach impossible:
- `RivoAPI` injects **late** (often seconds after page load) — UI cannot wait for it.
- `RivoAPI.favorite_products()` returns a **stale list right after a write** — reading it back immediately after a click reverts what the shopper just did.

**Solution:** localStorage owns the UI state on load and on click. Rivo is the server authority, but only reconciles in the background — never within 4 000 ms of a click.

### Components

- **`snippets/rivo-wishlist-heart.liquid`** — The heart button rendered on product cards and PDP gallery. Defaults to `aria-pressed="false"` so async-injected buttons hydrate correctly.
- **`assets/rivo-wishlist.js`** — The dual-layer engine: storage, background sync, optimistic click flow, hydration.
- **`snippets/product-card.liquid`** — Heart button added as a sibling of `.product-card__content` inside `<product-card>`, gated by `rivo_wishlist_enabled`.
- **`blocks/_product-media-gallery.liquid`** — Heart button added inside the gallery wrapper (position:relative), gated by `rivo_wishlist_enabled`.

---

## Theme Setting

| Setting ID | Type | Default | Description |
|---|---|---|---|
| `rivo_wishlist_enabled` | checkbox | `false` | Enable wishlist hearts on products |

---

## Merchant Setup Steps

1. **Install Rivo** — The Rivo app must be installed from the Shopify App Store.
2. **Enable Rivo app embed** — In the Shopify Theme Customizer → **App Embeds**, enable the Rivo embed. This injects `window.RivoJS` and `window.RivoAPI` on the storefront.
3. **Enable wishlist hearts** — In **Theme Settings → Rivo Loyalty & Wishlist**, check **Enable wishlist hearts on products**.
4. **Verify `#rivo` opens the widget** — After enabling the embed, visit the storefront and navigate to `#rivo` in the browser. Confirm the Rivo Account Widget opens (this is the widget home route; it may differ on some store configurations — verify in a real browser session and update documentation if the route differs).

---

## QA Script

### Heart button rendering
- [ ] Enable `rivo_wishlist_enabled`.
- [ ] Visit the shop / collection page → heart buttons appear on product cards, positioned top-right.
- [ ] Visit a product detail page → heart button appears overlaying the product gallery, top-right.

### Optimistic click flow
- [ ] Click a heart button → `aria-pressed` toggles **immediately** (optimistic, before any API response).
- [ ] Reload the page → heart is still pressed (persisted in localStorage).
- [ ] On a successful **add**: the Rivo widget opens (`#rivo`).

### Guest behaviour
- [ ] Log out → clicking a heart button navigates to `#rivo` (the Rivo widget handles auth).
- [ ] No localStorage key is written for guests.

### Cross-tab sync
- [ ] Open the store in two tabs (logged in).
- [ ] Toggle a wishlist heart in Tab A → after a few seconds Tab B's hearts update to match.

### Persistence across navigation
- [ ] Add a product to wishlist; navigate away and back → heart remains pressed.

### Degradation when Rivo is disabled
- [ ] Disable the Rivo app embed in App Embeds.
- [ ] Open the store → heart buttons render (default `aria-pressed="false"`); clicking them navigates to `#rivo` for guests, does nothing unexpected for logged-in users (API calls fail silently, no console errors from the integration code).

---

## Important Note for Infinite Scroll / Load-More / Lazy Recommendations

Hearts on **newly injected product cards** (from infinite scroll, load-more, or lazy-loaded recommendation sections) will default to `aria-pressed="false"` until hydration runs. To hydrate hearts on new cards, the feature that injects them must dispatch:

```javascript
document.dispatchEvent(new CustomEvent('rivo:wishlist:hydrate'));
```

This is a follow-up task if the store uses infinite scroll or lazy recommendation sections. The rivo-wishlist.js engine listens for this event and immediately re-applies the correct `aria-pressed` state from localStorage to all `[data-rivo-wishlist-heart]` buttons in the DOM.

---

## Storage Format

- **Key:** `rivo:favorites:{customerId}` (e.g. `rivo:favorites:1234567890`)
- **Value:** JSON array of normalised numeric product id strings, e.g. `["1234","5678"]`
- **Scope:** localStorage (persists across sessions; per-tab synchronisation via the `storage` event)

---

## Files Changed

| File | Action |
|---|---|
| `assets/rivo-wishlist.js` | Created — dual-layer wishlist engine |
| `snippets/rivo-wishlist-heart.liquid` | Created — heart button snippet |
| `snippets/product-card.liquid` | Added heart render inside `<product-card>` |
| `blocks/_product-media-gallery.liquid` | Added heart render inside gallery wrapper |
| `config/settings_schema.json` | Added `rivo_wishlist_enabled` setting |
| `config/settings_data.json` | Added `rivo_wishlist_enabled: false` default |
| `snippets/rivo-config.liquid` | Centralised config + conditional script loading |
