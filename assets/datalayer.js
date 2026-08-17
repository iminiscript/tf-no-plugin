/**
 * Central dataLayer helper for GA4 ecommerce events.
 *
 * This is the single source of truth for all dataLayer pushes in the theme.
 * Every ecommerce event must go through pushEvent() — never push ecommerce
 * objects directly to window.dataLayer from other modules.
 */

const DEBUG = new URLSearchParams(location.search).has('dl_debug');

/**
 * Converts Shopify's cent-based prices to major currency units.
 * This is the ONLY cents-to-major-units conversion in the entire codebase.
 * @param {number} cents - Price in cents (e.g. 1495)
 * @returns {number} Price in major units (e.g. 14.95)
 */
export const money = (cents) => Math.round(cents) / 100;

/**
 * Pushes a GA4 ecommerce event to the dataLayer.
 * Always issues an ecommerce:null clear before each event push to prevent
 * GTM from merging previous event's items into the current event.
 *
 * @param {string} event - The GA4 event name (e.g. 'view_item', 'add_to_cart')
 * @param {Object} ecommerce - The GA4 ecommerce payload object
 */
export function pushEvent(event, ecommerce) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event, ecommerce });
  if (DEBUG) {
    console.table([{ event, value: ecommerce?.value, items: ecommerce?.items?.length }]);
  }
}

/**
 * Builds a GA4 item object from a product and one of its variants.
 * Uses variant.sku || String(variant.id) as item_id (one scheme shopwide).
 * Prices must be provided in cents; they are converted via money().
 *
 * @param {{ title: string, vendor: string }} product - The product object
 * @param {{ id: number|string, sku: string, title: string, price: number }} variant - Variant (price in cents)
 * @param {{ quantity?: number, list?: { id: string, name: string }, index?: number }} [ctx] - Optional context
 * @returns {Object} GA4 item object ready for a dataLayer push
 */
export function itemFromVariant(product, variant, ctx = {}) {
  return {
    item_id: variant.sku || String(variant.id),
    item_name: product.title,
    item_variant: variant.title === 'Default Title' ? undefined : variant.title,
    item_brand: product.vendor,
    price: money(variant.price),
    quantity: ctx.quantity || 1,
    ...(ctx.list
      ? { item_list_id: ctx.list.id, item_list_name: ctx.list.name, index: ctx.index }
      : {}),
  };
}

/**
 * Maps cart.js line-item objects to GA4 items.
 * Cart line prices (final_price / price) are in cents.
 *
 * @param {Array<{ sku: string, variant_id: number, product_title: string, variant_title: string, vendor: string, final_price: number, price: number, quantity: number }>} lines
 * @returns {Array<Object>} GA4 items array
 */
export function itemsFromCartLines(lines) {
  return lines.map((l) => ({
    item_id: l.sku || String(l.variant_id),
    item_name: l.product_title,
    item_variant: l.variant_title || undefined,
    item_brand: l.vendor,
    price: money(l.final_price ?? l.price),
    quantity: l.quantity,
  }));
}
