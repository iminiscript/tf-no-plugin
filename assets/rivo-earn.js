/**
 * rivo-earn.js — Loyalty points earn callout updater.
 * Reads the shared earn formula from window.RivoTheme.earnPoints and updates
 * [data-loyalty-earn-value] targets on PDP variant changes and initial load.
 *
 * Listens to StandardEvents.productSelect (from @shopify/events) for variant
 * changes on the PDP surface.
 */

import { StandardEvents } from '@shopify/events';

/**
 * Resolves the qualifying price in cents for a given earn container and context.
 * @param {HTMLElement} root - The [data-rivo-earn] container element.
 * @param {string} context - 'pdp' or 'cart'.
 * @returns {number} Price/subtotal in cents.
 */
function resolveQualifyingCents(root, context) {
  if (context === 'cart') {
    return parseInt(root.dataset.subtotal, 10) || 0;
  }
  // pdp: read from the data-subtotal attribute set on initial render by Liquid
  return parseInt(root.dataset.subtotal, 10) || 0;
}

/**
 * Computes and writes the earn points value into [data-loyalty-earn-value] within root.
 * @param {HTMLElement} root - The [data-rivo-earn] container element.
 * @param {number} [overrideCents] - Optional price override in cents (for variant change events).
 */
function updateEarnTargets(root, overrideCents) {
  const config = window.RivoTheme?.config;
  if (!config || !config.earnRate) return;

  const { earnRate } = config;
  const context = root.dataset.rivoContext || 'pdp';
  const cents = overrideCents !== undefined ? overrideCents : resolveQualifyingCents(root, context);

  const points = window.RivoTheme.earnPoints(cents, earnRate);
  const earnValueEl = root.querySelector('[data-loyalty-earn-value]');
  if (earnValueEl) {
    earnValueEl.textContent = points.toLocaleString();
  }
}

/**
 * Initialises all [data-rivo-earn] containers currently in the DOM.
 */
function initAllEarnContainers() {
  const containers = document.querySelectorAll('[data-rivo-earn]');
  for (const container of containers) {
    updateEarnTargets(container);
  }
}

// Run on initial DOM ready
document.addEventListener('DOMContentLoaded', function () {
  initAllEarnContainers();
});

// Re-initialise on section reloads (theme editor)
document.addEventListener('shopify:section:load', function () {
  initAllEarnTargets();
});

function initAllEarnTargets() {
  initAllEarnContainers();
}

// Listen for variant selection events on the PDP
document.addEventListener(StandardEvents.productSelect, function (event) {
  // Only handle productSelect events that originate from a product page (not inside product-card)
  const target = event.target;
  if (!(target instanceof Element)) return;

  // Skip events coming from within product-card elements (those are card-level selects)
  if (target.closest('product-card')) return;

  // Find the parent section for this event
  const closestSection = target.closest('.shopify-section, dialog');
  if (!closestSection) return;

  // Find PDP earn containers within this section
  const earnContainers = closestSection.querySelectorAll('[data-rivo-earn][data-rivo-context="pdp"]');
  if (!earnContainers.length) return;

  // Use event.promise to get the resolved variant price
  const promise = event.promise;
  if (!promise) return;

  promise
    .then(({ detail }) => {
      // detail.resource is the selected variant; its price is in cents
      const variantPriceCents = detail?.resource?.price;
      if (variantPriceCents === undefined || variantPriceCents === null) return;

      for (const container of earnContainers) {
        // Update data-subtotal attribute so it reflects the current variant
        container.dataset.subtotal = String(variantPriceCents);
        updateEarnTargets(container, variantPriceCents);
      }
    })
    .catch((err) => {
      if (err?.name !== 'AbortError') {
        console.warn('[rivo-earn] productSelect promise rejected:', err);
      }
    });
});
