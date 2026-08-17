# Rivo Loyalty Integration — Handoff Document

## What Was Built

### 1. Account Link → Rivo Widget
- **File:** `snippets/header-actions.liquid` (modified), `assets/rivo.js`
- When the `rivo_account_link` theme setting is enabled, clicking the header account / login button opens the Rivo Account Widget via `location.hash = '#rivo'` instead of navigating to the native account page.
- Progressive enhancement: the native `shopify-account` web component functions normally until the `rivo-js-loaded` event fires. If the Rivo embed is disabled or blocked, the button continues to work as a native account link.
- Implementation: capture-phase click listener (`addEventListener('click', handler, true)`) attached to `shopify-account` inside `[data-rivo-enabled="true"]` wrappers, only after `rivo-js-loaded`.

### 2. PDP Earn Callout Block (`_rivo-earn`)
- **Files:** `blocks/_rivo-earn.liquid`, `snippets/rivo-earn.liquid`, `assets/rivo-earn.js`
- A merchant-placeable theme block ("Loyalty points earn") that renders in the product detail page via the theme editor. Add it under the product section using the **Add block** picker.
- Displays "Earn {{points}} points with this purchase" for logged-in customers; a sign-in prompt for guests.
- Initial Liquid render computes the earn estimate for the default variant. `rivo-earn.js` listens to `StandardEvents.productSelect` (from `@shopify/events`) and updates `[data-loyalty-earn-value]` on variant change without page reload.

### 3. Cart Earn Callout
- **Files:** `snippets/cart-drawer.liquid` (modified), `blocks/_cart-summary.liquid` (modified)
- Earn estimate rendered in the cart drawer (inside `.cart-drawer__summary`) and the cart page (inside `.cart-summary__inner`), each behind the `rivo_show_cart_earn` setting toggle.

### 4. Cart Redemption Rail
- **Files:** `snippets/rivo-redemption.liquid`, `assets/rivo-redemption.js`
- Renders reward cards from `shop.metafields.rivo.loy` joined to the merchant's configured `rivo_loyalty_collection`.
- Only visible for logged-in customers.
- JS loads customer balance + unused purchases, sets per-card state (redeemable / claimed / hidden).
- Redeem flow: `RivoJS.redeemReward(numericId)` → validate product id → apply discount code **first** → add reward variant → dispatch cart refresh events.
- Prefix detection: if a code starting with `rivo_discount_prefix` is already in the cart, the rail shows a "reward applied" banner instead of the card list.

---

## Theme Settings Reference

| Setting ID | Type | Default | Description |
|---|---|---|---|
| `rivo_account_link` | checkbox | `false` | Opens Rivo widget from the header account/login link |
| `rivo_show_cart_earn` | checkbox | `true` | Shows earn callout in cart drawer and cart page |
| `rivo_earn_callout_text` | text | `Earn {{points}} points with this purchase` | Earn callout copy for logged-in customers. Use `{{points}}` for the computed value. |
| `rivo_earn_callout_guest_text` | text | `Sign in to earn loyalty points` | Earn callout copy for guest visitors |
| `rivo_show_redemption` | checkbox | `true` | Shows the cart redemption rail |
| `rivo_loyalty_collection` | collection | — | Collection containing Rivo reward products |
| `rivo_discount_prefix` | text | `RIVO` | Prefix for Rivo-minted discount codes (must match Rivo admin setting) |
| `rivo_show_wishlist` | checkbox | `true` | Shows heart buttons on product cards and PDP gallery |

---

## Merchant Setup Steps

1. **Install the Rivo app** from the Shopify App Store and complete the onboarding inside the Rivo admin dashboard.
2. **Enable the Rivo app embed** in Shopify admin: Online Store → Themes → Customize → App embeds → enable Rivo.
3. **Configure Reward products collection:** In the theme editor, navigate to Theme settings → Rivo loyalty & wishlist → select your reward products collection under "Reward products collection".
4. **Set the discount code prefix:** In the theme editor, set "Rivo discount code prefix" to the same prefix configured in your Rivo admin (default: `RIVO`).
5. **Enable the account link widget** (optional): Enable "Open Rivo widget from account link" in theme settings.
6. **Add the earn block to the product page:** In the theme editor, open the product template → product section → click **Add block** → find "Loyalty points earn" → position it near the price or below the add-to-cart button.

---

## QA Script

1. **Config block:** With Rivo installed and app embed on, view page source and verify `<script id="rivo-config">` is present and contains `earnRate.pointsAmount` and `earnRate.currencyBaseAmount`.
2. **Account link:** Enable `rivo_account_link` in theme settings. Click the header account icon. Verify the Rivo widget opens (URL hash becomes `#rivo`). Disable the embed and verify the button still navigates to the account page.
3. **PDP earn block:** Add the "Loyalty points earn" block to a product template. Load a product page as a logged-in customer. Verify "Earn X points" text appears. Switch variant and verify the points value updates without page reload.
4. **Guest earn:** Load the product page while logged out. Verify the sign-in prompt appears with a link to the account login page.
5. **Cart earn:** Add a product to cart. Open the cart drawer. Verify the earn callout appears in the cart summary area.
6. **Redemption rail:** As a logged-in customer with enough points, open the cart drawer. Verify reward cards appear with correct points costs. Click "Redeem" on a card. Verify the cart updates with the reward item and the discount code is applied.
7. **Prefix detection:** If a Rivo-prefixed code is applied, verify the rail shows the "A reward has been applied" banner instead of the card list.

---

## Earn Estimate Caveat

> **Important:** Theme-side earn numbers are **estimates**. They cannot reflect Rivo-side rules such as per-product rates, bonus campaigns, or post-purchase adjustments. Rivo's own widget and order webhooks are the authoritative source for actual points awarded to a customer. A mismatch between the displayed estimate and the actual points credited is **expected behaviour, not a bug**.
