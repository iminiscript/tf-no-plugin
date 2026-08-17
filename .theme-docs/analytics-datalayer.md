# GA4 ecommerce dataLayer — Handoff Documentation

This document covers the Google Tag Manager + GA4 ecommerce dataLayer integration added to the Horizon theme.

---

## 1. How to Configure

### Google Tag Manager Container ID

1. In the Shopify Admin, go to **Online Store → Themes → Customize**.
2. Open **Theme Settings** (bottom-left gear icon).
3. Scroll down to the **Analytics** section.
4. Enter your GTM container ID (e.g. `GTM-XXXXXXX`) in the **Google Tag Manager container ID** field.
5. Leave the field **blank** to disable GTM loading (the dataLayer still initialises and events still fire — useful for custom tag setups or testing without GTM).

### Debug Mode

Toggle **dataLayer debug mode** in the same Analytics section to log every event to the browser console. Turn this **off** before going to production.

You can also append `?dl_debug=1` to any storefront URL for a one-off debug session without changing the theme setting.

---

## 2. Events Table

All 7 GA4 ecommerce events are emitted. Every event is preceded by `dataLayer.push({ ecommerce: null })` to prevent GTM from merging items across events.

| Event | Trigger | Key fields |
|---|---|---|
| `view_item_list` | DOMContentLoaded on collection/search pages | `item_list_id`, `item_list_name`, `items[]` (full list of visible product cards) |
| `select_item` | Click on a product card link (`a[data-dl-id]`) | `item_list_id`, `item_list_name`, `items[0]` (the clicked product) |
| `view_item` | PDP load; re-fires on variant selection | `value`, `items[0]` (selected variant) |
| `add_to_cart` | After any cart mutation that increases a variant's quantity | `currency`, `value`, `items[0]` (delta quantity — NOT the new total) |
| `remove_from_cart` | After any cart mutation that decreases a variant's quantity | `currency`, `value`, `items[0]` (delta quantity) |
| `view_cart` | Cart drawer open; DOMContentLoaded on `/cart` | `currency`, `value`, `items[]` (full cart) |
| `begin_checkout` | Checkout button/link activated (once per navigation) | `currency`, `value`, `items[]` (full cart at checkout time) |

### Sample Payload — `add_to_cart`

```js
// Shopify line prices are in cents; window.DL.money() converts to major units.
// Example: price field of 1495 (cents) → item.price of 14.95 (dollars)
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: "add_to_cart",
  ecommerce: {
    currency: "USD",
    value: 29.90,           // major units — sum of item.price × delta quantity
    items: [{
      item_id: "SKU-123",   // variant.sku, falling back to String(variant.id)
      item_name: "Classic Snowboard",
      item_variant: "Blue / M",   // omitted when variant.title === "Default Title"
      item_brand: "Acme Co",
      price: 14.95,         // major units (NOT cents)
      quantity: 2           // DELTA added, not the new cart total
    }]
  }
});
```

### Item ID Scheme

The same scheme is used shopwide: **`variant.sku` when non-empty, otherwise `String(variant.id)`**. This applies to `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, and `begin_checkout`. Mixing schemes breaks attribution joins with product feeds and ads — never override this in GTM.

---

## 3. Scope Boundary — What Is NOT Included

**Checkout events (purchase, payment_info, add_payment_info, add_shipping_info, etc.) are OUT OF SCOPE for this integration.**

Shopify's checkout runs on a separate domain (`checkout.shopify.com`) where theme Liquid is not executed. These events must be implemented via **Shopify's Web Pixel** (Customer Events) or the **GA4 Sales Channel**.

To configure:
- Go to **Shopify Admin → Settings → Customer events** and add a pixel for the `checkout_completed` (purchase) event.
- OR use the GA4 Sales Channel, which handles checkout events automatically.

This integration ends at `begin_checkout`. Tag your GTM container to handle downstream checkout events from the pixel channel.

---

## 4. GTM Preview QA Steps

1. Open [GTM Preview mode](https://tagmanager.google.com/) and connect to your storefront URL.
2. Load a **collection page** (`/collections/*`):
   - Verify `view_item_list` fires with the correct `item_list_id` (collection handle), `item_list_name`, and one item per visible product card.
3. **Click a product card**:
   - Verify `select_item` fires with `item_list_id`, `item_list_name`, and `items[0]` matching the clicked product.
4. Load a **product page** (`/products/*`):
   - Verify `view_item` fires on page load with the correct variant.
   - Switch a variant option — verify `view_item` re-fires with the updated variant data.
5. **Add a product to the cart**:
   - Verify `add_to_cart` fires with the correct quantity **delta** (e.g. if you add 2 units, quantity should be `2`).
   - Verify `value` equals `price × quantity` in major units.
6. **Open the cart drawer**:
   - Verify `view_cart` fires with the full cart contents.
7. **Click the checkout button**:
   - Verify `begin_checkout` fires exactly **once** — not again on the redirect.
8. Load the **Search Results page** after a search:
   - Verify `view_item_list` fires with `item_list_id: "search"` and `item_list_name: "Search Results"`.

---

## 5. Debug Mode Details

Two ways to enable debug logging:

| Method | How |
|---|---|
| Theme setting | Toggle **dataLayer debug mode** in Shopify Admin → Theme Customizer → Analytics |
| URL parameter | Append `?dl_debug=1` to any storefront URL |

When enabled, every `pushEvent()` call outputs a `console.table` summary and a `console.log` of the full payload. Disable in production.

---

## 6. ⚠️ Duplicate GTM Container Warning

If another Shopify app (e.g. Elevar, Littledata, or a custom app embed) already loads a GTM container via `content_for_header`, you will have **two GTM containers** on every page. This causes every tag to double-fire, inflating all conversion and event metrics.

**Before going live:**
1. Open browser DevTools → Network tab, filter for `gtm.js`.
2. If you see two requests to `gtm.js`, there is a conflict.
3. Identify the duplicate container (it may be in a Shopify app's embed code).
4. Disable the duplicate — either remove the app embed or leave this theme setting blank and rely solely on the app's container.

Only ONE GTM container should load per page. If you need to merge containers, use GTM's built-in container sharing or destination publishing — do not load two separate containers.
