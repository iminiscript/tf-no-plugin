/**
 * intelligems.js
 *
 * Intelligems price-testing integration for Horizon.
 * Tags all price surfaces and wires the restart/sync contract so Intelligems
 * price swaps remain correct after cart changes, drawer opens, and variant
 * selections (Section Rendering API replaceWith() on [ref="priceContainer"]).
 *
 * The Intelligems SDK is loaded by the app embed in:
 *   Online Store → Themes → Customize → App embeds → Intelligems
 * This module only wires the integration — it never hardcodes an SDK URL,
 * org ID, or API key.
 */

/**
 * Computes a stable cache-key for the current cart state.
 * Used to skip igRestart() when the drawer opens but the cart hasn't changed.
 *
 * @param {object} cart - Cart JSON object from /cart.js
 * @returns {string}
 */
function cartToken(cart) {
  const items = (cart.items || []).map((i) => `${i.variant_id}:${i.quantity}`).join(',');
  return `${cart.item_count}|${cart.total_price}|${items}`;
}

/** @type {ReturnType<typeof setTimeout>|null} */
let timer = null;

/** Cart state token captured at the last known cart fetch. */
let lastToken = null;

/**
 * When true, the quantity-selector:update handler skips igRestart() to
 * prevent a feedback loop triggered by the ig:CartUpdated sync.
 * @type {boolean}
 */
let suppress = false;

/**
 * Debounced wrapper around window.igData?.restart().
 * Collapses rapid successive calls into one restart after 150 ms.
 * Every window.igData access uses optional chaining so the theme works
 * identically when the Intelligems app embed is disabled.
 */
function igRestart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (typeof window.igData?.restart === 'function') {
      try {
        window.igData?.restart();
      } catch (e) {
        console.error('[Intelligems]', e);
      }
    }
  }, 150);
}

/**
 * Fetches the current cart from Shopify's /cart.js endpoint.
 * Uses Theme.routes.cart_url when available (set by snippets/scripts.liquid).
 * @returns {Promise<object>}
 */
function fetchCart() {
  const base =
    typeof window.Theme !== 'undefined' && window.Theme.routes?.cart_url
      ? window.Theme.routes.cart_url
      : '/cart';
  return fetch(base + '.js').then((r) => r.json());
}

/**
 * Attaches a MutationObserver (childList: true) to every `product-price`
 * custom element not yet marked `_igObserved`.
 *
 * product-price.js (Horizon's variant-price updater) calls replaceWith() on
 * [ref="priceContainer"] — a direct child of the product-price element. The
 * childList observer fires when that replacement happens, so Intelligems can
 * re-swap the new price HTML immediately.
 */
function observePriceContainers() {
  document.querySelectorAll('product-price:not([_igObserved])').forEach((el) => {
    el.setAttribute('_igObserved', '');
    new MutationObserver(() => {
      igRestart();
    }).observe(el, { childList: true });
  });
}

// ---------------------------------------------------------------------------
// Drawer-open detection
//
// theme-drawer.js sets the `open` attribute on the <theme-drawer> element
// when the drawer opens (line: this.setAttribute('open', '')). We observe
// document.body with { subtree, attributes, attributeFilter: ['open'] } to
// catch this mutation and trigger igRestart() only when the cart has changed
// since the last restart (token-compare gate to skip no-op opens).
// ---------------------------------------------------------------------------
const drawerObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName !== 'open') continue;

    const target = /** @type {Element} */ (mutation.target);
    if (!target.hasAttribute('open')) continue;

    // Match the theme-drawer element or the dialog inside #cart-drawer
    const isCartDrawer =
      target.id === 'cart-drawer' ||
      (target.tagName === 'DIALOG' && target.closest('#cart-drawer') !== null);

    if (!isCartDrawer) continue;

    // Drawer just opened — compare cart token before restarting
    fetchCart()
      .then((cart) => {
        const token = cartToken(cart);
        if (token !== lastToken) {
          lastToken = token;
          igRestart();
        }
        // Re-observe any product-price elements newly rendered in the drawer
        observePriceContainers();
      })
      .catch(() => {});

    break; // Only process one drawer-open mutation per batch
  }
});

// ---------------------------------------------------------------------------
// ig:CartUpdated — Intelligems mutated the cart (offer/shipping test).
// Refresh the theme's cart state and store the new token. The suppress flag
// prevents the quantity-selector:update handler from calling igRestart() in
// response to the cart:refresh dispatch, avoiding a feedback loop.
// ---------------------------------------------------------------------------
window.addEventListener('ig:CartUpdated', () => {
  suppress = true;
  fetchCart()
    .then((cart) => {
      lastToken = cartToken(cart);
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    })
    .catch(() => {})
    .finally(() => {
      suppress = false;
    });
});

// ---------------------------------------------------------------------------
// quantity-selector:update — fires when the shopper adjusts a cart quantity.
// Calls igRestart() so Intelligems re-swaps any updated price surfaces,
// unless suppress is active (ig:CartUpdated handler in progress).
// ---------------------------------------------------------------------------
document.addEventListener('quantity-selector:update', () => {
  if (suppress) return;
  igRestart();
});

// ---------------------------------------------------------------------------
// Bootstrap on DOMContentLoaded
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Snapshot the initial cart so the first drawer open can diff against it.
  fetchCart()
    .then((cart) => {
      lastToken = cartToken(cart);
    })
    .catch(() => {});

  // Tag all product-price elements already in the DOM at page load.
  observePriceContainers();

  // Begin watching for the cart drawer opening.
  drawerObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
});
