# Analytics dataLayer — Handoff Documentation

GA4 ecommerce dataLayer + Google Tag Manager loader for the Horizon theme.
Vendor-neutral: works with plain GTM, Elevar-style pipelines, or any tag manager that consumes `window.dataLayer`.

---

## Setup

1. Open your Shopify Admin → **Online Store → Themes → Customize**
2. In the left panel, click **Theme settings** (the gear icon)
3. Scroll to the **Analytics** section
4. Paste your GTM container ID (e.g. `GTM-XXXXXXX`) into the **Google Tag Manager container ID** field
5. Click **Save**

Leaving the field blank disables both the GTM loader and the `datalayer.js` helper — nothing is loaded.

---

## Events Table

| Event | Trigger | Key payload fields |
|---|---|---|
| `view_item_list` | Collection page loads | `currency`, `item_list_id`, `item_list_name`, `items[]` |
| `select_item` | User clicks a product card in a list | `item_list_id`, `item_list_name`, `items[0]` |
| `view_item` | PDP loads; also fires on variant change | `currency`, `value`, `items[0]` |
| `add_to_cart` | Any add path (PDP, quick-add, etc.) | `currency`, `value` (delta), `items[]` (delta qty) |
| `remove_from_cart` | Line removed or quantity decreased | `currency`, `value` (delta), `items[]` (delta qty) |
| `view_cart` | Cart drawer opens; `/cart` page loads | `currency`, `value`, `items[]` |
| `begin_checkout` | Checkout form submitted | `currency`, `value`, `items[]` |

### Sample payloads

#### view_item_list
```json
{
  "event": "view_item_list",
  "ecommerce": {
    "currency": "USD",
    "item_list_id": "all",
    "item_list_name": "All Products",
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 1,
        "item_list_id": "all",
        "item_list_name": "All Products",
        "index": 1
      }
    ]
  }
}
```

#### select_item
```json
{
  "event": "select_item",
  "ecommerce": {
    "item_list_id": "all",
    "item_list_name": "All Products",
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 1,
        "item_list_id": "all",
        "item_list_name": "All Products"
      }
    ]
  }
}
```

#### view_item
```json
{
  "event": "view_item",
  "ecommerce": {
    "currency": "USD",
    "value": 29.95,
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 1
      }
    ]
  }
}
```

#### add_to_cart (quantity delta)
```json
{
  "event": "add_to_cart",
  "ecommerce": {
    "currency": "USD",
    "value": 29.95,
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 1
      }
    ]
  }
}
```

#### remove_from_cart
```json
{
  "event": "remove_from_cart",
  "ecommerce": {
    "currency": "USD",
    "value": 29.95,
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 1
      }
    ]
  }
}
```

#### view_cart
```json
{
  "event": "view_cart",
  "ecommerce": {
    "currency": "USD",
    "value": 59.90,
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 2
      }
    ]
  }
}
```

#### begin_checkout
```json
{
  "event": "begin_checkout",
  "ecommerce": {
    "currency": "USD",
    "value": 59.90,
    "items": [
      {
        "item_id": "SKU-001",
        "item_name": "Classic Tee",
        "item_variant": "Blue / M",
        "item_brand": "Acme",
        "price": 29.95,
        "quantity": 2
      }
    ]
  }
}
```

---

## Debugging

Append `?dl_debug=1` to any storefront URL to enable `console.table` output for every `pushEvent` call. Example:

```
https://your-store.myshopify.com/collections/all?dl_debug=1
```

Each event logs: `{ event, value, items (count) }`.

---

## GTM Preview QA Steps

1. Open GTM → **Preview** mode and enter your store URL
2. Append `?dl_debug=1` to the URL in the GTM Preview dialog
3. Walk through the following scenarios and verify events in both the **GTM debug panel** and the browser **console**:

| Scenario | Expected event(s) |
|---|---|
| Land on a collection page | `view_item_list` |
| Click a product card | `select_item` |
| Land on a PDP | `view_item` |
| Select a different variant on PDP | `view_item` (re-fires) |
| Click "Add to cart" | `add_to_cart` |
| Open the cart drawer | `view_cart` |
| Decrease quantity in cart | `remove_from_cart` |
| Remove line from cart | `remove_from_cart` |
| Click "Checkout" in cart | `begin_checkout` |
| Navigate to `/cart` | `view_cart` |

4. For each event, confirm:
   - `ecommerce: null` clear appears **before** the event in the dataLayer array
   - `price` values are in major units (e.g. `29.95`, not `2995`)
   - `quantity` reflects the **delta**, not the running total (for cart events)
   - `item_id` uses SKU where present, falling back to variant ID — consistent shopwide

---

## Architecture Notes

### Files

| File | Role |
|---|---|
| `snippets/gtm.liquid` | Synchronous GTM loader (plain `<script>`, non-module); renders nothing when `gtm_container_id` is blank |
| `assets/datalayer.js` | ES module: `pushEvent`, `money`, `itemFromVariant`, `itemsFromCartLines` |
| `assets/gtm-events.js` | ES module: wires all 7 GA4 events using @shopify/events + DOM signals |

### `item_id` scheme

One scheme shopwide: **SKU, falling back to variant ID** (`variant.sku || String(variant.id)`). Never mix. If products don't have SKUs, variant IDs are used consistently everywhere.

### Money conversion

All Shopify prices (Liquid and cart.js) are in **cents**. The `money(cents)` function in `assets/datalayer.js` is the **single conversion point** — `Math.round(cents) / 100`. A second conversion site would be a bug.

### Quantity deltas

`add_to_cart` and `remove_from_cart` push the **delta** (change), not the running total. Qty 2→5 fires `add_to_cart` with qty 3. Qty 5→2 fires `remove_from_cart` with qty 3. This requires comparing the previous cart snapshot against `CartLinesUpdateEvent.detail.cart`.

---

## Scope — What Is and Is Not Included

### In scope (this implementation)

- GTM container loader
- GA4 ecommerce events up to and including `begin_checkout`

### Out of scope — handled by Shopify's Web Pixel / GA4 sales channel

Checkout and post-purchase events (`purchase`, `order_completed`, etc.) are **not** emitted by this implementation. These events are owned by Shopify's Web Pixel channel and the GA4 sales-channel app. Configure them in the Shopify Admin under **Settings → Customer events** or through the GA4 Sales Channel integration.

---

## Duplicate-Container Warning

If another app (e.g. Elevar, Littledata, or a third-party tag manager embed) already injects your GTM container via `content_for_header`, **leave `gtm_container_id` blank** — do not fill both. Two GTM containers with the same ID will double-fire every tag and inflate all metrics.

To confirm whether GTM is already loading: open the browser network tab and search for `gtm.js` requests. If you see one loading before this theme's snippet, another source is already loading it.
