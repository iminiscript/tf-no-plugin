/**
 * rivo.js — Core Rivo loyalty module.
 * Side-effect module: sets up window.RivoTheme namespace, reads #rivo-config,
 * implements onRivoReady queue, defines the ONE shared earn formula, and wires
 * the account link interception after rivo-js-loaded.
 *
 * All other Rivo modules (rivo-earn.js, rivo-wishlist.js, rivo-redemption.js)
 * depend on window.RivoTheme being defined first — load this script first.
 */

/** @type {Array<Function>} Pending callbacks waiting for rivo-js-loaded */
const pendingCallbacks = [];
let rivoReady = false;

/**
 * @namespace RivoTheme
 * @type {{
 *   config: Object|null,
 *   onRivoReady: function(fn: Function): void,
 *   earnPoints: function(cents: number, rate: {pointsAmount: number, currencyBaseAmount: number}): number,
 *   isExcludedLine: function(line: Object): boolean,
 * }}
 */
window.RivoTheme = {
  config: null,

  /**
   * Queue a callback to run once the Rivo embed has loaded.
   * If Rivo is already ready, the callback is invoked immediately.
   * @param {Function} fn - Callback to execute when Rivo is ready.
   */
  onRivoReady(fn) {
    if (rivoReady) {
      fn();
    } else {
      pendingCallbacks.push(fn);
    }
  },

  /**
   * ONE shared earn formula — used by rivo-earn.js and rivo-redemption.js.
   * Never duplicated elsewhere.
   * @param {number} cents - Price or subtotal in cents.
   * @param {{pointsAmount: number, currencyBaseAmount: number}} rate - Earn rate from #rivo-config.
   * @returns {number} Estimated loyalty points (rounded up).
   */
  earnPoints(cents, rate) {
    if (!rate || !rate.currencyBaseAmount || rate.currencyBaseAmount <= 0) return 0;
    const dollars = cents / 100;
    return Math.ceil(dollars / rate.currencyBaseAmount * rate.pointsAmount);
  },

  /**
   * Checks whether a cart line should be excluded from earn calculations.
   * Matches vendor, title, or product_type against protection/warranty/gift terms.
   * @param {{ vendor?: string, title?: string, product_type?: string }} line - Cart line item.
   * @returns {boolean} True if the line should be excluded.
   */
  isExcludedLine(line) {
    const exclusionTerms = ['protection', 'warranty', 'gift'];
    const fields = [line.vendor, line.title, line.product_type].map(
      (v) => (v || '').toLowerCase()
    );
    return exclusionTerms.some((term) =>
      fields.some((field) => field.includes(term))
    );
  },
};

// Read and cache #rivo-config
(function readConfig() {
  const configEl = document.getElementById('rivo-config');
  if (!configEl) return;
  try {
    window.RivoTheme.config = JSON.parse(configEl.textContent);
  } catch {
    // Config element malformed — Rivo features will be silently disabled
  }
})();

// Listen for the rivo-js-loaded event and drain pending callbacks
document.addEventListener('rivo-js-loaded', function onRivoLoaded() {
  rivoReady = true;
  for (const fn of pendingCallbacks) {
    try {
      fn();
    } catch (err) {
      console.warn('[rivo] Callback error:', err);
    }
  }
  pendingCallbacks.length = 0;
  wireAccountLink();
});

/**
 * Attaches a capture-phase click interceptor on shopify-account elements
 * inside [data-rivo-enabled='true'] wrappers, redirecting to #rivo.
 * Called only inside the onRivoReady callback (after rivo-js-loaded fires).
 */
function wireAccountLink() {
  const config = window.RivoTheme.config;
  if (!config || config.accountLink !== true) return;

  const accountComponents = document.querySelectorAll('[data-rivo-enabled="true"] shopify-account');
  for (const el of accountComponents) {
    el.addEventListener('click', handleAccountLinkClick, true);
  }
}

/**
 * Capture-phase click handler — intercepts clicks on shopify-account and
 * navigates to the Rivo widget deep link instead.
 * @param {MouseEvent} event
 */
function handleAccountLinkClick(event) {
  event.stopPropagation();
  event.preventDefault();
  location.hash = '#rivo';
}
