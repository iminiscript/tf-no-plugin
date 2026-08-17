# Rivo Wishlist Integration — Handoff Document

## What Was Built

### Heart Button Surfaces
- **Product cards:** `snippets/product-card.liquid` (modified). A heart button (`snippets/rivo-wishlist-heart.liquid`) is rendered inside `<product-card>` as a positioned overlay, visible when `rivo_show_wishlist` is enabled and the card is not a placeholder.
- **PDP gallery:** `blocks/_product-media-gallery.liquid` (modified). A heart button is rendered as a positioned overlay on the product gallery, visible when `rivo_show_wishlist` is enabled.
- Both surfaces use `aria-pressed="false"` as the default attribute so dynamically-injected buttons hydrate correctly from storage.

### Dual-Layer Engine (`assets/rivo-wishlist.js`)
- **Client storage is the instant UI source of truth.** On page load and on click, the heart state is read from and written to `localStorage` (key: `rivo:favorites:{customerId}`).
- **RivoAPI reconciles in the background.** Staggered attempts (0 ms, 500 ms, 2 s, 5 s, 12 s, 30 s, 60 s) call `RivoAPI.favorite_products()` and compare the server set to the local set. Server wins — but only outside the post-click pause (4 s).

### Optimistic Click Flow
1. Toggle storage + all matching heart buttons immediately (`aria-pressed`).
2. Start the 4 s reconcile pause.
3. Call `window.RivoJS?.addFavoriteProduct(Number(id))` or `removeFavoriteProduct`.
4. On error: revert storage and hearts.
5. On successful add (or any guest click): navigate to `#rivo` to open the Rivo widget.

### Re-hydration
Hearts survive dynamic DOM injection via `document.dispatchEvent(new CustomEvent('rivo:wishlist:hydrate'))`. The engine also listens to `shopify:section:load` and the `window.storage` event for cross-tab sync.

---

## Theme Settings

| Setting ID | Type | Default | Description |
|---|---|---|---|
| `rivo_show_wishlist` | checkbox | `true` | Enables heart buttons on product cards and PDP gallery |

---

## Merchant Setup Steps

1. **Install the Rivo app** and enable the app embed in Shopify admin (Online Store → Themes → Customize → App embeds → Rivo).
2. **Verify the `#rivo` deep link:** Navigate to your storefront and click an account link or manually set `location.hash = '#rivo'` in the browser console. Confirm the Rivo widget opens on the **wishlist/favorites home** tab.
   - **IMPORTANT:** The `#rivo` route can vary between Rivo versions and store configurations. You MUST verify this on your specific store before launching. If `#rivo` does not open the wishlist, contact Rivo support for the correct widget deep link for your store.
3. Enable the `rivo_show_wishlist` setting in theme settings (default: enabled).

---

## Re-hydration Note

If you implement any theme customisation that injects new product card or gallery DOM — such as infinite scroll, load-more pagination, lazy-loaded recommendation sections, or PDP gallery swaps — you must dispatch the following event after the new DOM is inserted so that newly injected heart buttons receive the correct `aria-pressed` state from storage:

```javascript
document.dispatchEvent(new CustomEvent('rivo:wishlist:hydrate'));
```

Without this, newly injected hearts will default to `aria-pressed="false"` (un-hearted) even if the product is already in the shopper's wishlist.

---

## QA Script

1. **Initial hydration:** Log in, add a product to your Rivo wishlist via the Rivo widget. Reload the page. Verify the heart button for that product shows as filled (`aria-pressed="true"`) after the background reconcile runs (may take a few seconds on first load).
2. **Optimistic toggle:** Click a heart button. Verify the heart fills immediately (before API response).
3. **Guest click:** While logged out, click a heart button. Verify the Rivo widget opens (location hash changes to `#rivo`). No API call should be made.
4. **Error revert:** Temporarily disable the Rivo embed (or block network requests to the Rivo API in DevTools). Click a heart button. Verify the heart reverts to its previous state after the API call fails.
5. **Cross-tab sync:** Wishlist a product in one browser tab. The heart should update in another tab within a few seconds (via `localStorage` storage event).
6. **PDP gallery heart:** Navigate to a product detail page. Verify the heart button appears over the product gallery image.
7. **Product card heart:** Navigate to a collection or home page. Verify heart buttons appear on product cards.
8. **`#rivo` route:** Confirm that `#rivo` opens the Rivo widget on the correct wishlist/favorites tab for your specific store configuration.
