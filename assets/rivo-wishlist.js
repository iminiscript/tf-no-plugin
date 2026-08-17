/**
 * rivo-wishlist.js — Rivo wishlist dual-layer storage + reconcile engine.
 *
 * Architecture:
 * - Client-side localStorage is the INSTANT UI source of truth (load + click).
 * - RivoAPI reconciles in the background; server wins ONLY outside the post-click pause.
 * - All RivoJS/RivoAPI accesses use optional chaining so the storefront works unchanged
 *   when the Rivo app embed is disabled.
 */

/** How long (ms) after a click before server-wins reconcile can override storage */
const RECONCILE_PAUSE_MS = 4000;

/** Staggered delays (ms) for background reconcile attempts (API injects late) */
const SYNC_DELAYS_MS = [0, 500, 2000, 5000, 12000, 30000, 60000];

/** @type {number|null} Timestamp of last wishlist click, for reconcile pause gate */
let lastClickTs = null;

/**
 * Derives the customer-scoped localStorage key.
 * @returns {string|null} The storage key, or null if no customer (guest).
 */
function getStorageKey() {
  const customerId = window.RivoTheme?.config?.customerId;
  if (!customerId) return null;
  return `rivo:favorites:${customerId}`;
}

/**
 * Reads the stored wishlist set from localStorage.
 * @returns {Set<string>} Set of numeric product id strings.
 */
function getStoredIds() {
  const key = getStorageKey();
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Persists the wishlist set to localStorage.
 * @param {Set<string>} idSet
 */
function setStoredIds(idSet) {
  const key = getStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...idSet]));
  } catch {
    // localStorage unavailable — fail silently
  }
}

/**
 * Normalises a product id to a numeric string.
 * Handles plain numbers, numeric strings, and Shopify GIDs ("gid://shopify/Product/123").
 * @param {string|number} id
 * @returns {string}
 */
function normaliseId(id) {
  const str = String(id);
  const gidMatch = str.match(/\/(\d+)$/);
  return gidMatch ? gidMatch[1] : str.replace(/\D/g, '');
}

/**
 * Updates aria-pressed on all heart buttons matching storedIds.
 */
function hydrateHearts() {
  const storedIds = getStoredIds();
  const buttons = document.querySelectorAll('[data-rivo-wishlist-heart]');
  for (const btn of buttons) {
    const productId = normaliseId(btn.dataset.productId || '');
    const isWishlisted = storedIds.has(productId);
    btn.setAttribute('aria-pressed', isWishlisted ? 'true' : 'false');
    btn.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
  }
}

/**
 * Unwraps the polymorphic RivoAPI.favorite_products() response.
 * Supports: bare array | { products } | { data: { products } } | { favorite_products }
 * @param {unknown} response
 * @returns {Array<unknown>}
 */
function unwrapFavorites(response) {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object') {
    if (Array.isArray(response.products)) return response.products;
    if (response.data && Array.isArray(response.data.products)) return response.data.products;
    if (Array.isArray(response.favorite_products)) return response.favorite_products;
  }
  return [];
}

/**
 * Extracts a normalised product id string from a Rivo favorites list entry.
 * Tries multiple observed field names.
 * @param {Object} item
 * @returns {string|null}
 */
function extractFavoriteProductId(item) {
  for (const field of ['remote_id', 'shopify_product_id', 'product_id', 'shopify_id', 'id']) {
    if (item[field] !== undefined && item[field] !== null) {
      return normaliseId(item[field]);
    }
  }
  // Also check variants array
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    const vPid = item.variants[0].product_id;
    if (vPid !== undefined && vPid !== null) return normaliseId(vPid);
  }
  return null;
}

/**
 * Compares two id sets for equality.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {boolean}
 */
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * Runs a single reconcile attempt against RivoAPI.
 * Server wins only when outside the RECONCILE_PAUSE_MS window after the last click.
 */
async function runReconcile() {
  if (!window.RivoAPI) return;

  let response;
  try {
    response = await window.RivoAPI.favorite_products('loggedin', Shopify?.currency?.active);
  } catch {
    // Retry without args — some versions accept no parameters
    try {
      response = await window.RivoAPI.favorite_products();
    } catch {
      return; // API unavailable — skip this cycle
    }
  }

  const favorites = unwrapFavorites(response);
  const serverIds = new Set(
    favorites.map(extractFavoriteProductId).filter(Boolean)
  );
  const storedIds = getStoredIds();

  if (setsEqual(serverIds, storedIds)) return;

  // Check if inside the post-click pause window
  const sinceLastClick = lastClickTs !== null ? Date.now() - lastClickTs : Infinity;
  if (sinceLastClick < RECONCILE_PAUSE_MS) return; // Server wins next cycle

  // Server wins — update storage and repaint hearts
  setStoredIds(serverIds);
  hydrateHearts();
}

/**
 * Schedules staggered reconcile attempts.
 */
function scheduleReconcile() {
  for (const delay of SYNC_DELAYS_MS) {
    setTimeout(runReconcile, delay);
  }
}

/**
 * Handles a click on a heart button.
 * Optimistic: toggle storage + UI immediately, then call RivoJS API.
 * @param {MouseEvent} event
 */
async function handleHeartClick(event) {
  const btn = event.currentTarget;
  const productId = normaliseId(btn.dataset.productId || '');
  if (!productId) return;

  const customerId = window.RivoTheme?.config?.customerId;

  // Guest click: navigate to Rivo widget
  if (!customerId) {
    location.hash = '#rivo';
    return;
  }

  const storedIds = getStoredIds();
  const wasWishlisted = storedIds.has(productId);

  // (1) Optimistic toggle — storage + all matching buttons immediately
  if (wasWishlisted) {
    storedIds.delete(productId);
  } else {
    storedIds.add(productId);
  }
  setStoredIds(storedIds);
  hydrateHearts();

  // (2) Start reconcile pause
  lastClickTs = Date.now();

  // (3) Call RivoJS API
  const numericId = Number(productId);
  try {
    if (wasWishlisted) {
      await window.RivoJS?.removeFavoriteProduct(numericId);
    } else {
      await window.RivoJS?.addFavoriteProduct(numericId);
      // (5) On successful add: open Rivo widget
      location.hash = '#rivo';
      // Optionally refresh Rivo's internal cache if available
      window.rivoRefreshFavoriteProducts?.();
    }
  } catch {
    // (4) On error: revert storage + UI
    if (wasWishlisted) {
      storedIds.add(productId);
    } else {
      storedIds.delete(productId);
    }
    setStoredIds(storedIds);
    hydrateHearts();
  }
}

/**
 * Attaches click handlers to all [data-rivo-wishlist-heart] buttons in the DOM.
 * Safe to call multiple times (uses bound handler reference via event delegation on document).
 */
function attachHeartListeners() {
  // Use event delegation on document to catch dynamically injected buttons
  // (We remove+re-add to avoid duplicates on re-init calls)
  document.removeEventListener('click', heartDelegationHandler);
  document.addEventListener('click', heartDelegationHandler);
}

/**
 * Delegated click handler on document for wishlist hearts.
 * @param {MouseEvent} event
 */
function heartDelegationHandler(event) {
  const btn = event.target.closest('[data-rivo-wishlist-heart]');
  if (!btn) return;
  handleHeartClick(Object.assign(event, { currentTarget: btn }));
}

// ─── Initialisation ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  // Always hydrate — logged-out users get all-false hearts (storage key returns empty set)
  hydrateHearts();
  attachHeartListeners();

  const customerId = window.RivoTheme?.config?.customerId;
  if (customerId) {
    // Schedule staggered background reconcile for logged-in customers
    window.RivoTheme?.onRivoReady(scheduleReconcile);
  }
});

// Re-hydrate on dynamic DOM injection events
document.addEventListener('rivo:wishlist:hydrate', hydrateHearts);
document.addEventListener('shopify:section:load', hydrateHearts);

// Cross-tab sync via storage event
window.addEventListener('storage', function (event) {
  const key = getStorageKey();
  if (!key || event.key !== key) return;
  // Another tab updated — re-parse from event.newValue and repaint
  try {
    const newIds = new Set(event.newValue ? JSON.parse(event.newValue) : []);
    setStoredIds(newIds);
  } catch {
    // Ignore malformed storage data
  }
  hydrateHearts();
});
