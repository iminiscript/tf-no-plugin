/**
 * GA4 ecommerce event wiring for Google Tag Manager.
 *
 * Wires all 7 required GA4 ecommerce events:
 *   view_item_list, select_item, view_item,
 *   add_to_cart, remove_from_cart, view_cart, begin_checkout
 *
 * Primary signals:
 *   - CartLinesUpdateEvent from @shopify/events (cart mutations)
 *   - ProductSelectEvent from @shopify/events (product card clicks, variant changes)
 *   - theme-drawer:open document event (cart drawer open)
 *   - Liquid JSON data blocks (#ProductDatalayerContext, #CollectionDatalayerContext)
 */

import { pushEvent, money, itemsFromCartLines } from '@theme/datalayer';
import { CartLinesUpdateEvent, ProductSelectEvent } from '@shopify/events';

// ─── Module-level state ────────────────────────────────────────────────────────

/** @type {Object|null} Snapshot of the cart before the latest mutation */
let previousCart = null;

/** @type {boolean} Dedup flag — prevents begin_checkout from firing twice per submission */
let checkoutSubmitting = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches the current cart from the Storefront API.
 * @returns {Promise<Object>} cart.js response
 */
async function fetchCart() {
  const response = await fetch('/cart.js');
  return response.json();
}

/**
 * Returns the collection list context from the JSON data block, or null.
 * @returns {{ id: string, name: string }|null}
 */
function getListContext() {
  const el = document.getElementById('CollectionDatalayerContext');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    return { id: data.list_id, name: data.list_name };
  } catch {
    return null;
  }
}

// ─── 1. view_item_list ────────────────────────────────────────────────────────

/**
 * Fires view_item_list once on collection page load.
 * Reads product data from the #CollectionDatalayerContext JSON block.
 */
function initViewItemList() {
  const el = document.getElementById('CollectionDatalayerContext');
  if (!el) return;

  let data;
  try {
    data = JSON.parse(el.textContent);
  } catch {
    return;
  }

  const { list_id, list_name, currency, products } = data;
  if (!products || !products.length) return;

  const items = products.map((p) => ({
    item_id: p.sku || String(p.variantId),
    item_name: p.title,
    item_brand: p.vendor,
    price: money(p.price),
    quantity: 1,
    item_list_id: list_id,
    item_list_name: list_name,
    index: p.index,
  }));

  pushEvent('view_item_list', {
    currency,
    item_list_id: list_id,
    item_list_name: list_name,
    items,
  });
}

// ─── 2. select_item ───────────────────────────────────────────────────────────

/**
 * Fires select_item when a product card is clicked on a list page.
 * Skips on PDP pages (where view_item handles variant selection instead).
 */
function initSelectItem() {
  document.addEventListener(ProductSelectEvent.eventName, (event) => {
    // Don't fire select_item on the PDP — view_item handles variant selection there
    if (document.getElementById('ProductDatalayerContext')) return;

    const { product, variant } = event.detail || {};
    if (!product || !variant) return;

    const listCtx = getListContext();

    const item = {
      item_id: variant.sku || String(variant.id),
      item_name: product.title,
      item_variant: variant.title === 'Default Title' ? undefined : variant.title,
      item_brand: product.vendor,
      price: money(variant.price),
      quantity: 1,
      ...(listCtx ? { item_list_id: listCtx.id, item_list_name: listCtx.name } : {}),
    };

    pushEvent('select_item', {
      item_list_id: listCtx?.id,
      item_list_name: listCtx?.name,
      items: [item],
    });
  });
}

// ─── 3. view_item ─────────────────────────────────────────────────────────────

/**
 * Fires view_item on PDP load and on variant change.
 * Reads product data from the #ProductDatalayerContext JSON block.
 */
function initViewItem() {
  const el = document.getElementById('ProductDatalayerContext');
  if (!el) return;

  let data;
  try {
    data = JSON.parse(el.textContent);
  } catch {
    return;
  }

  const { product_id, title, vendor, currency, variants } = data;

  /**
   * Pushes view_item for the given variant id.
   * @param {number} variantId
   */
  const pushViewItem = (variantId) => {
    const variant = variants.find((v) => v.id === variantId) || variants[0];
    if (!variant) return;

    pushEvent('view_item', {
      currency,
      value: money(variant.price),
      items: [
        {
          item_id: variant.sku || String(variant.id),
          item_name: title,
          item_variant: variant.title === 'Default Title' ? undefined : variant.title,
          item_brand: vendor,
          price: money(variant.price),
          quantity: 1,
        },
      ],
    });
  };

  // Fire on initial page load for the URL-selected (or first available) variant
  const urlParams = new URLSearchParams(location.search);
  const variantIdFromUrl = urlParams.get('variant');
  const initialVariantId = variantIdFromUrl ? parseInt(variantIdFromUrl, 10) : variants[0]?.id;
  pushViewItem(initialVariantId);

  // Re-fire on variant selection; debounced to one push per user action
  let debounceTimer = null;
  document.addEventListener(ProductSelectEvent.eventName, (event) => {
    const { variant, product } = event.detail || {};
    // Only re-fire if the event is for this PDP's product
    if (!variant || !product) return;
    if (String(product.id) !== String(product_id)) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pushViewItem(variant.id);
    }, 50);
  });
}

// ─── 4 & 5. add_to_cart / remove_from_cart ────────────────────────────────────

/**
 * Fires add_to_cart and/or remove_from_cart by computing quantity deltas
 * between the previousCart snapshot and the incoming CartLinesUpdateEvent payload.
 *
 * Skips the push if the cart token diff is identical (render/morph with no real change).
 */
function initCartEvents() {
  document.addEventListener(CartLinesUpdateEvent.eventName, (event) => {
    const newCart = event.detail?.cart;
    if (!newCart) return;

    // Build a stable token from variant IDs + quantities to detect real changes
    const makeToken = (items) =>
      JSON.stringify((items || []).map((l) => `${l.variant_id}:${l.quantity}`).sort());

    const newToken = makeToken(newCart.items);
    const prevToken = previousCart ? makeToken(previousCart.items) : null;

    // Guard: skip push if nothing actually changed (re-render / morph)
    if (newToken === prevToken) return;

    const currency = newCart.currency;
    const prevItems = previousCart ? previousCart.items || [] : [];
    const newItems = newCart.items || [];

    const prevMap = new Map(prevItems.map((l) => [l.variant_id, l]));
    const newMap = new Map(newItems.map((l) => [l.variant_id, l]));

    const addedItems = [];
    const removedItems = [];

    // Additions and quantity increases
    for (const [variantId, newLine] of newMap) {
      const prevLine = prevMap.get(variantId);
      const delta = prevLine ? newLine.quantity - prevLine.quantity : newLine.quantity;
      if (delta > 0) {
        addedItems.push({
          item_id: newLine.sku || String(newLine.variant_id),
          item_name: newLine.product_title,
          item_variant: newLine.variant_title || undefined,
          item_brand: newLine.vendor,
          price: money(newLine.final_price ?? newLine.price),
          quantity: delta,
        });
      }
    }

    // Removals and quantity decreases
    for (const [variantId, prevLine] of prevMap) {
      const newLine = newMap.get(variantId);
      const delta = newLine ? prevLine.quantity - newLine.quantity : prevLine.quantity;
      if (delta > 0) {
        removedItems.push({
          item_id: prevLine.sku || String(prevLine.variant_id),
          item_name: prevLine.product_title,
          item_variant: prevLine.variant_title || undefined,
          item_brand: prevLine.vendor,
          price: money(prevLine.final_price ?? prevLine.price),
          quantity: delta,
        });
      }
    }

    if (addedItems.length > 0) {
      pushEvent('add_to_cart', {
        currency,
        value: addedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
        items: addedItems,
      });
    }

    if (removedItems.length > 0) {
      pushEvent('remove_from_cart', {
        currency,
        value: removedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
        items: removedItems,
      });
    }

    // Update snapshot for next delta computation
    previousCart = newCart;
  });
}

// ─── 6. view_cart ─────────────────────────────────────────────────────────────

/**
 * Fetches the cart and fires view_cart.
 */
async function pushViewCart() {
  let cartData;
  try {
    cartData = await fetchCart();
  } catch {
    return;
  }
  const items = itemsFromCartLines(cartData.items || []);
  pushEvent('view_cart', {
    currency: cartData.currency,
    value: money(cartData.total_price),
    items,
  });
}

/**
 * Fires view_cart on:
 *   - /cart page load
 *   - Cart drawer open (theme-drawer:open on document, guarded to #cart-drawer)
 */
function initViewCart() {
  // Fire on /cart page
  if (window.location.pathname === '/cart') {
    // init() is called on/after DOMContentLoaded — push immediately
    pushViewCart();
  }

  // Fire when the cart drawer opens.
  // The Horizon theme dispatches 'theme-drawer:open' on document for all drawers.
  // Guard to the cart drawer element specifically (#cart-drawer).
  document.addEventListener('theme-drawer:open', () => {
    const cartDrawer = document.getElementById('cart-drawer');
    if (cartDrawer && cartDrawer.hasAttribute('open')) {
      pushViewCart();
    }
  });
}

// ─── 7. begin_checkout ────────────────────────────────────────────────────────

/**
 * Fires begin_checkout on checkout form submit.
 * Uses a Boolean flag to prevent double-fire from button handler + redirect.
 */
function initBeginCheckout() {
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form || form.getAttribute('action') !== '/checkout') return;

    // Dedup: skip if already submitted (button + redirect double-fire guard)
    if (checkoutSubmitting) return;
    checkoutSubmitting = true;

    // Reset after 500 ms to allow a retry if the submission fails
    setTimeout(() => {
      checkoutSubmitting = false;
    }, 500);

    let cartData;
    try {
      cartData = await fetchCart();
    } catch {
      return;
    }

    const items = itemsFromCartLines(cartData.items || []);
    pushEvent('begin_checkout', {
      currency: cartData.currency,
      value: money(cartData.total_price),
      items,
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function init() {
  // Hydrate previousCart snapshot before any CartLinesUpdateEvent fires.
  // Non-blocking: event listeners are registered immediately below.
  fetchCart()
    .then((cart) => {
      previousCart = cart;
    })
    .catch(() => {
      // previousCart stays null; the first CartLinesUpdateEvent will establish the baseline.
    });

  initViewItemList();
  initSelectItem();
  initViewItem();
  initCartEvents();
  initViewCart();
  initBeginCheckout();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
