# Rivo Loyalty — Handoff Documentation

## What Was Built

This integration adds four Rivo loyalty features to the Horizon theme:

1. **Account link → Rivo widget** — The header account/login button opens the Rivo Account Widget (`#rivo`) via a capture-phase click interceptor. Falls back to the native `<shopify-account>` behaviour with zero JS when Rivo is absent.

2. **Points-earn callouts** — Merchant-placeable on:
   - **PDP** — `_rivo-earn-callout` block (must be added to the product template via theme editor between price and buy-buttons)
   - **Cart drawer** — rendered inside `.cart-drawer__summary`
   - **Cart page** — rendered inside `.cart-totals`

   One shared formula used identically in Liquid SSR and JS re-computation: `Math.ceil((priceCents / 100) / currencyBaseAmount * pointsAmount)`

3. **Cart redemption rail** — Renders the reward catalog for logged-in customers. Rivo mints a discount code; the theme applies the code **before** adding the reward variant to cart. Prefix detection shows a "claimed" banner when a Rivo discount is already applied.

4. **Exclusion hook** — Products whose title, vendor, or type matches the comma-separated `rivo_exclusion_keywords` setting are excluded from earn callout display.

---

## Theme Setting IDs

All settings live under **Theme Settings → Rivo Loyalty & Wishlist**.

| Setting ID | Type | Default | Description |
|---|---|---|---|
| `rivo_account_link` | checkbox | `false` | Open Rivo widget from account link |
| `rivo_earn_pdp` | checkbox | `false` | Show points earn on product pages |
| `rivo_earn_cart` | checkbox | `false` | Show points earn in cart |
| `rivo_earn_copy` | text | `Earn {{points}} points with this purchase` | Earn callout copy — use `{{points}}` as placeholder |
| `rivo_redemption_enabled` | checkbox | `false` | Enable reward redemption in cart |
| `loyalty_collection` | collection | — | Collection of reward products (must match Rivo catalog) |
| `loyalty_discount_prefix` | text | `RIVO` | Rivo discount code prefix for detection |
| `rivo_exclusion_keywords` | text | `protection,warranty` | Comma-separated keywords matched against title/vendor/type |
| `rivo_wishlist_enabled` | checkbox | `false` | Enable wishlist hearts on products |

---

## Merchant Setup Steps

1. **Install Rivo app** — Install from the Shopify App Store.
2. **Enable Rivo app embed** — In the Shopify Theme Customizer, go to **App Embeds** and enable the Rivo embed. This injects `window.RivoJS` and `window.RivoAPI` globals on the storefront.
3. **Configure Rivo admin** — Set up the loyalty widget, rewards catalog, and points rules inside the Rivo dashboard.
4. **Enable theme toggles** — In **Theme Settings → Rivo Loyalty & Wishlist**, enable the desired features:
   - Check **Open Rivo widget from account link** to wire the header account button.
   - Check **Show points earn on product pages** and/or **Show points earn in cart**.
   - Check **Enable reward redemption in cart** and set the **Reward products collection**.
5. **Add the PDP earn callout block** — In the theme editor, open the product template. Add the **Rivo earn callout** block to the product information section, positioned between the price and buy-buttons blocks. This step is required for PDP earn display — it cannot be auto-inserted.
6. **Verify discount prefix** — Confirm the **Rivo discount code prefix** setting matches the prefix Rivo uses when minting codes (default: `RIVO`).

---

## QA Script

### Account link
- [ ] Enable `rivo_account_link` in theme settings.
- [ ] Click the account icon in the header → browser URL changes to `#rivo` and the Rivo widget opens.
- [ ] Disable the Rivo app embed → clicking the account icon falls back to the normal account/login page (no JS errors).

### PDP earn callout
- [ ] Enable `rivo_earn_pdp`; add the `_rivo-earn-callout` block to the product template.
- [ ] Visit a product page → earn callout appears with a points estimate.
- [ ] Change the variant selector → earn callout updates to reflect the new variant price.
- [ ] Log out → earn callout shows a sign-in prompt instead of a points count.
- [ ] Test a product whose title/vendor/type contains an exclusion keyword → callout is hidden.

### Cart earn callout
- [ ] Enable `rivo_earn_cart`.
- [ ] Add products to cart and open the cart drawer → earn callout appears below the cart summary.
- [ ] Open the cart page (`/cart`) → earn callout appears inside the cart totals area.
- [ ] Update cart quantity → earn callout updates with the new subtotal earn estimate.

### Cart redemption rail
- [ ] Enable `rivo_redemption_enabled`; select a **Reward products collection**.
- [ ] Log in with a customer who has redeemable points.
- [ ] Open the cart → redemption rail appears with available reward cards.
- [ ] Click **Redeem** on a reward card → the Rivo discount is applied and the reward product is added to the cart.
- [ ] Apply a code starting with the loyalty prefix manually → the "reward claimed" banner appears instead of the catalog.
- [ ] Log out → the rail shows a sign-in prompt.

---

## Earn Estimates — Honesty Caveat

The points estimates shown on the PDP and in the cart are **theme-side approximations** computed from the Rivo earn rate metafield. They **cannot** reflect:

- Per-product earn-rate overrides configured in Rivo admin
- Bonus earn campaigns or multipliers
- Post-purchase adjustments made by Rivo's order webhooks

Rivo's own Account Widget and order confirmation emails are the source of truth for points actually awarded. A small discrepancy between the displayed estimate and the amount credited is expected and is not a bug in the theme integration.

---

## Files Changed

| File | Action |
|---|---|
| `config/settings_schema.json` | Added Rivo Loyalty & Wishlist settings section |
| `config/settings_data.json` | Added default values for all nine new settings |
| `assets/rivo-account.js` | Created — account widget interceptor |
| `assets/rivo-earn.js` | Created — earn callout JS engine |
| `assets/rivo-redemption.js` | Created — redemption rail JS engine |
| `assets/rivo-wishlist.js` | Created — wishlist dual-layer engine |
| `snippets/rivo-config.liquid` | Created — JSON config block + conditional module loading |
| `snippets/rivo-earn-cart.liquid` | Created — cart earn callout snippet |
| `snippets/rivo-redemption.liquid` | Created — redemption rail snippet |
| `snippets/rivo-wishlist-heart.liquid` | Created — wishlist heart button snippet |
| `blocks/_rivo-earn-callout.liquid` | Created — PDP earn callout theme block |
| `layout/theme.liquid` | Added `{% render 'rivo-config' %}` in `<head>` |
| `snippets/header-actions.liquid` | Added `data-rivo-account` attribute to account button div |
| `snippets/cart-drawer.liquid` | Added earn + redemption renders inside `.cart-drawer__summary` |
| `snippets/cart-summary.liquid` | Added earn + redemption renders inside `.cart-totals` |
| `snippets/product-card.liquid` | Added wishlist heart render inside `<product-card>` |
| `blocks/_product-media-gallery.liquid` | Wrapped gallery in relative container + added wishlist heart |
