/**
 * rivo-earn.js
 *
 * Points-earn callouts for PDP and cart surfaces.
 *
 * ONE shared earn formula — one rounding decision — used identically for the
 * initial Liquid SSR estimate and every JS re-computation.
 *
 * All configuration comes exclusively from <script id="rivo-config"> JSON.
 * No earn rate values are hardcoded here.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** @returns {{ pointsAmount: number, currencyBaseAmount: number, earnCopyTemplate: string, exclusionKeywords: string[], earnPdp: boolean, earnCart: boolean, customerId: number }} */
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
// THE ONE shared earn formula — do not add another one
// ---------------------------------------------------------------------------

/**
 * Compute earn points.
 * @param {number} priceCents - Price in cents (Shopify money format).
 * @param {{ pointsAmount: number, currencyBaseAmount: number }} rateConfig
 * @returns {number}
 */
function earnPoints(priceCents, rateConfig) {
  return Math.ceil(
    (priceCents / 100) / rateConfig.currencyBaseAmount * rateConfig.pointsAmount
  );
}

// ---------------------------------------------------------------------------
// Exclusion guard
// ---------------------------------------------------------------------------

/**
 * Returns true if this product should be excluded from earn callouts.
 * Checks product title, vendor, and type against the exclusion keywords list.
 * @param {{ title?: string, vendor?: string, type?: string }} product
 * @param {string[]} keywords
 * @returns {boolean}
 */
function isExcluded(product, keywords) {
  if (!keywords || !keywords.length) return false;
  const haystack = [
    product?.title || '',
    product?.vendor || '',
    product?.type || ''
  ]
    .join(' ')
    .toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.trim().toLowerCase()));
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/**
 * Replace {{points}} token in the earn copy template.
 * @param {string} template
 * @param {number} points
 * @returns {string}
 */
function buildEarnCopy(template, points) {
  return template.replace('{{points}}', points);
}

// ---------------------------------------------------------------------------
// Price resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the qualifying price in cents from the DOM.
 * @param {'pdp'|'cart'} surface
 * @param {Element} root - Container element
 * @returns {number|null}
 */
function resolveQualifyingCents(surface, root) {
  if (surface === 'pdp') {
    // Read from Shopify's native variant JSON (serialised on product page)
    const variantJson = document.querySelector('[data-product-json]');
    if (variantJson) {
      try {
        const data = JSON.parse(variantJson.textContent);
        // Prefer currently selected variant; fall back to first
        const url = new URL(window.location.href);
        const variantId = url.searchParams.get('variant');
        if (variantId && data.variants) {
          const match = data.variants.find(
            (v) => String(v.id) === String(variantId)
          );
          if (match) return match.price;
        }
        return data?.price ?? null;
      } catch {
        // pass
      }
    }
    // Fallback: read from [data-loyalty-earn-value] SSR value already in DOM
    const ssrEl = root?.querySelector('[data-loyalty-earn-value]');
    if (ssrEl) {
      const price = ssrEl.dataset.loyaltyPriceCents;
      if (price) return Number(price);
    }
    return null;
  }

  if (surface === 'cart') {
    // [data-cart-subtotal] is set by Horizon's cart total text-component
    const subtotalEl = document.querySelector('[data-cart-subtotal]');
    if (subtotalEl) {
      // The element may hold money-formatted text; we need raw cents.
      // cart:updated payloads carry it, or we fall back to cart.js.
      const cents = subtotalEl.dataset.cartSubtotalCents;
      if (cents) return Number(cents);
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// DOM updater
// ---------------------------------------------------------------------------

/** @param {Element} el - An element with [data-loyalty-earn-value] */
function updateEarnEl(el, points, earnCopyTemplate, isGuest) {
  if (isGuest) {
    el.textContent = 'Sign in to earn points on this purchase';
    return;
  }
  if (points === null || points <= 0) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = buildEarnCopy(earnCopyTemplate, points);
}

// ---------------------------------------------------------------------------
// Surface-specific handlers
// ---------------------------------------------------------------------------

function refreshPdpCallouts(config) {
  const targets = document.querySelectorAll('[data-loyalty-earn-pdp]');
  if (!targets.length) return;

  // Resolve product data for exclusion guard
  let productData = null;
  const variantJsonEl = document.querySelector('[data-product-json]');
  if (variantJsonEl) {
    try { productData = JSON.parse(variantJsonEl.textContent); } catch { /* pass */ }
  }

  // If this product matches an exclusion keyword, hide all PDP earn targets and stop
  if (isExcluded(productData, config.exclusionKeywords)) {
    targets.forEach((target) => { target.hidden = true; });
    return;
  }

  const isGuest = !config.customerId;
  targets.forEach((target) => {
    const priceCents = resolveQualifyingCents('pdp', target);
    const points =
      priceCents !== null ? earnPoints(priceCents, config) : null;
    updateEarnEl(target, points, config.earnCopyTemplate, isGuest);
  });
}

function refreshCartCallouts(config) {
  const targets = document.querySelectorAll('[data-loyalty-earn-cart]');
  if (!targets.length) return;

  // For cart-level earn, check each target's own product context attributes
  // (populated on line-level callouts) or fall back to any product JSON on the page.
  // A null / empty product resolves to isExcluded=false so the cart-total callout shows.
  let pageProductData = null;
  const variantJsonEl = document.querySelector('[data-product-json]');
  if (variantJsonEl) {
    try { pageProductData = JSON.parse(variantJsonEl.textContent); } catch { /* pass */ }
  }

  const isGuest = !config.customerId;
  targets.forEach((target) => {
    // Prefer target-level product data attributes; fall back to page-level product JSON
    const targetProduct = {
      title: target.dataset.productTitle || pageProductData?.title || '',
      vendor: target.dataset.productVendor || pageProductData?.vendor || '',
      type: target.dataset.productType || pageProductData?.type || ''
    };
    if (isExcluded(targetProduct, config.exclusionKeywords)) {
      target.hidden = true;
      return;
    }
    const priceCents = resolveQualifyingCents('cart', target);
    const points =
      priceCents !== null ? earnPoints(priceCents, config) : null;
    updateEarnEl(target, points, config.earnCopyTemplate, isGuest);
  });
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

function init() {
  const config = getConfig();
  if (!config) return;

  // PDP surface
  if (config.earnPdp) {
    refreshPdpCallouts(config);

    // Re-compute on variant change (Horizon dispatches variant:change)
    document.addEventListener('variant:change', () => refreshPdpCallouts(config));
    // Also handle Shopify's native variant URL change
    document.addEventListener('shopify:section:load', () => refreshPdpCallouts(config));
  }

  // Cart surface
  if (config.earnCart) {
    refreshCartCallouts(config);

    document.addEventListener('cart:updated', () => refreshCartCallouts(config));
    document.addEventListener('shopify:section:load', () => refreshCartCallouts(config));
  }
}

// Activate only after Rivo fires rivo-js-loaded; guard every global.
document.addEventListener(
  'rivo-js-loaded',
  () => {
    init();
  },
  { once: true }
);
