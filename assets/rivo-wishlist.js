/**
 * rivo-wishlist.js
 *
 * Wishlist / favorites dual-layer engine.
 *
 * CLIENT STORAGE is the instant UI source of truth on load and on click.
 * RIVO API reconciles in the background — server wins, EXCEPT during the
 * 4 000 ms post-click pause (favorite_products() is stale right after a write).
 *
 * Staggered sync attempts handle the late-injecting Rivo embed.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  const el = document.getElementById('rivo-config');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ID normalisation
// ---------------------------------------------------------------------------

/**
 * Convert any Shopify GID or numeric value to a plain digit string.
 * @param {string|number|null|undefined} id
 * @returns {string}
 */
function normaliseId(id) {
  if (!id && id !== 0) return '';
  const s = String(id);
  const slashIdx = s.lastIndexOf('/');
  return slashIdx >= 0 ? s.slice(slashIdx + 1) : s;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const RECONCILE_PAUSE_MS = 4000;
const SYNC_DELAYS_MS = [0, 500, 2000, 5000, 12000, 30000, 60000];

/**
 * Build the customer-scoped localStorage key.
 * @param {number|string} customerId
 * @returns {string}
 */
function storageKey(customerId) {
  return `rivo:favorites:${customerId}`;
}

/**
 * Read stored favorites as a Set of normalised id strings.
 * @param {string} key
 * @returns {Set<string>}
 */
function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

/**
 * Write a Set of normalised id strings to localStorage.
 * @param {string} key
 * @param {Set<string>} ids
 */
function writeStorage(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Storage quota or private-browsing restriction — degrade silently.
  }
}

// ---------------------------------------------------------------------------
// DOM hydration
// ---------------------------------------------------------------------------

/**
 * Re-apply aria-pressed to all wishlist heart buttons from storage.
 * @param {string} key - localStorage key
 */
function hydrate(key) {
  const ids = readStorage(key);
  document.querySelectorAll('[data-rivo-wishlist-heart][data-product-id]').forEach((btn) => {
    const pid = normaliseId(btn.dataset.productId);
    btn.setAttribute('aria-pressed', ids.has(pid) ? 'true' : 'false');
  });
}

// ---------------------------------------------------------------------------
// Polymorphic favorites response parser
// ---------------------------------------------------------------------------

/**
 * Extract a Set of normalised product ids from a Rivo favorite_products response.
 * Handles: bare array | { products } | { data: { products } } | { favorite_products }
 * @param {*} res
 * @returns {Set<string>}
 */
function parseFavoritesResponse(res) {
  let items = [];
  if (Array.isArray(res)) {
    items = res;
  } else if (Array.isArray(res?.products)) {
    items = res.products;
  } else if (Array.isArray(res?.data?.products)) {
    items = res.data.products;
  } else if (Array.isArray(res?.favorite_products)) {
    items = res.favorite_products;
  }

  const ids = new Set();
  items.forEach((item) => {
    // Try known id field candidates
    const candidates = [
      item?.remote_id,
      item?.shopify_product_id,
      item?.product_id,
      item?.shopify_id,
      item?.id
    ];
    for (const c of candidates) {
      const n = normaliseId(c);
      if (n) { ids.add(n); break; }
    }
    // Also check variants
    if (Array.isArray(item?.variants)) {
      item.variants.forEach((v) => {
        const n = normaliseId(v?.product_id);
        if (n) ids.add(n);
      });
    }
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Background reconcile
// ---------------------------------------------------------------------------

let lastClickTime = 0;

/**
 * Compare server set against local storage; server wins unless inside
 * the post-click reconcile pause.
 * @param {Set<string>} serverIds
 * @param {string} key
 */
function reconcile(serverIds, key) {
  const withinPause = Date.now() - lastClickTime < RECONCILE_PAUSE_MS;
  if (withinPause) return;

  const localIds = readStorage(key);

  // Check equality
  if (
    serverIds.size === localIds.size &&
    [...serverIds].every((id) => localIds.has(id))
  ) {
    return; // Nothing to update
  }

  // Server wins — update storage and repaint
  writeStorage(key, serverIds);
  hydrate(key);
}

/**
 * Attempt to fetch Rivo favorites with a no-arg retry on throw.
 * @returns {Promise<*>}
 */
async function fetchFavorites() {
  try {
    return await window.RivoAPI?.favorite_products?.('loggedin', Shopify?.currency?.active);
  } catch {
    // No-arg retry
    try {
      return await window.RivoAPI?.favorite_products?.();
    } catch {
      return null;
    }
  }
}

/**
 * Run staggered background sync attempts.
 * @param {string} key
 */
function startBackgroundSync(key) {
  SYNC_DELAYS_MS.forEach((delay) => {
    setTimeout(async () => {
      const res = await fetchFavorites();
      if (res === null) return;
      const serverIds = parseFavoritesResponse(res);
      reconcile(serverIds, key);
    }, delay);
  });
}

// ---------------------------------------------------------------------------
// Click flow
// ---------------------------------------------------------------------------

/**
 * Handle a wishlist heart button click.
 * @param {Element} btn
 * @param {string} key
 * @param {number} customerId
 */
async function handleHeartClick(btn, key, customerId) {
  const productId = normaliseId(btn.dataset.productId);
  if (!productId) return;

  // Guest: open Rivo widget and bail
  if (!customerId) {
    location.hash = '#rivo';
    return;
  }

  const ids = readStorage(key);
  const wasPressed = btn.getAttribute('aria-pressed') === 'true';
  const nowPressed = !wasPressed;

  // 1. Optimistic: toggle storage + ALL matching buttons immediately
  lastClickTime = Date.now();
  if (nowPressed) {
    ids.add(productId);
  } else {
    ids.delete(productId);
  }
  writeStorage(key, ids);
  hydrate(key);

  // 2. Call Rivo API (numeric id required)
  try {
    if (nowPressed) {
      await window.RivoJS?.addFavoriteProduct?.(Number(productId));
      // On successful add: open the Rivo widget
      location.hash = '#rivo';
      // Optionally refresh Rivo's internal cache (guarded)
      window.rivoRefreshFavoriteProducts?.();
    } else {
      await window.RivoJS?.removeFavoriteProduct?.(Number(productId));
    }
  } catch {
    // 3. On error: revert storage + UI
    if (nowPressed) {
      ids.delete(productId);
    } else {
      ids.add(productId);
    }
    writeStorage(key, ids);
    hydrate(key);
  }
}

// ---------------------------------------------------------------------------
// Attach click handlers
// ---------------------------------------------------------------------------

/**
 * Attach click handlers to all current wishlist heart buttons.
 * @param {string} key
 * @param {number} customerId
 */
function attachHandlers(key, customerId) {
  document.querySelectorAll('[data-rivo-wishlist-heart]').forEach((btn) => {
    if (btn.dataset.rivoHandlerAttached) return;
    btn.dataset.rivoHandlerAttached = 'true';
    btn.addEventListener('click', () => handleHeartClick(btn, key, customerId));
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function init() {
  const config = getConfig();
  if (!config || !config.wishlist) return;

  const customerId = config.customerId;
  // Guests: no storage — clicks go straight to #rivo (handled in click flow)
  const key = customerId ? storageKey(customerId) : null;

  // Initial hydration from storage
  if (key) hydrate(key);

  // Attach click handlers
  attachHandlers(key, customerId);

  // Background sync (logged-in only)
  if (key) startBackgroundSync(key);

  // Re-hydrate events
  const reHydrate = () => {
    if (key) hydrate(key);
    attachHandlers(key, customerId);
  };

  document.addEventListener('rivo:wishlist:hydrate', reHydrate);
  document.addEventListener('shopify:section:load', reHydrate);

  // Cross-tab storage sync
  window.addEventListener('storage', (event) => {
    if (key && event.key === key) reHydrate();
  });
}

document.addEventListener('rivo-js-loaded', () => { init(); }, { once: true });
