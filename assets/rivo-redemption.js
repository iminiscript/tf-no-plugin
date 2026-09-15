/**
 * rivo-redemption.js
 *
 * Cart redemption rail — Rivo mints the discount code, the THEME applies it.
 *
 * Key mechanic: Rivo NEVER touches the cart. After redeemReward():
 *   1. Apply discount code to cart FIRST (before adding the variant).
 *   2. Then add the reward variant to the cart.
 *
 * Per-root sequence numbers prevent stale async completions from overwriting
 * newer state when overlapping refreshes occur.
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
// ID normalisation (GID → numeric string)
// ---------------------------------------------------------------------------

/**
 * Normalise a Shopify GID or numeric id to a plain digit string.
 * @param {string|number|null|undefined} id
 * @returns {string}
 */
function normaliseId(id) {
  if (!id) return '';
  const s = String(id);
  const slashIdx = s.lastIndexOf('/');
  return slashIdx >= 0 ? s.slice(slashIdx + 1) : s;
}

// ---------------------------------------------------------------------------
// Polymorphic response parsers
// ---------------------------------------------------------------------------

/**
 * Extract the reward object from a polymorphic redeemReward() response.
 * Checks: res.reward → res.points_purchase?.reward → res.points_purchases?.[0]?.reward
 * @param {*} res
 * @returns {{ reward: object|null, pointsPurchase: object|null }}
 */
function parseRedeemResponse(res) {
  if (!res) return { reward: null, pointsPurchase: null };

  // Prefer top-level reward
  if (res.reward) {
    return { reward: res.reward, pointsPurchase: res.points_purchase || null };
  }
  if (res.points_purchase?.reward) {
    return { reward: res.points_purchase.reward, pointsPurchase: res.points_purchase };
  }
  if (Array.isArray(res.points_purchases) && res.points_purchases[0]?.reward) {
    return {
      reward: res.points_purchases[0].reward,
      pointsPurchase: res.points_purchases[0]
    };
  }
  return { reward: null, pointsPurchase: null };
}

/**
 * Extract discount code from a points_purchase object.
 * Tries: discount_code, code, redemption_code, coupon_code, shopify_discount_code,
 * then metadata.* keys.
 * @param {object|null} pointsPurchase
 * @returns {string|null}
 */
function pickDiscountCode(pointsPurchase) {
  if (!pointsPurchase) return null;
  const fields = [
    'discount_code',
    'code',
    'redemption_code',
    'coupon_code',
    'shopify_discount_code'
  ];
  for (const field of fields) {
    if (pointsPurchase[field]) return String(pointsPurchase[field]);
  }
  // Try metadata.*
  if (pointsPurchase.metadata && typeof pointsPurchase.metadata === 'object') {
    for (const val of Object.values(pointsPurchase.metadata)) {
      if (val && typeof val === 'string') return val;
    }
  }
  return null;
}

/**
 * Extract variant id from a reward object.
 * Tries: variant_ids[0], shopify_variant_id, variant_id, variant.id — normalises GIDs.
 * @param {object} reward
 * @returns {string|null}
 */
function pickVariantId(reward) {
  if (!reward) return null;
  if (Array.isArray(reward.variant_ids) && reward.variant_ids[0]) {
    return normaliseId(reward.variant_ids[0]);
  }
  if (reward.shopify_variant_id) return normaliseId(reward.shopify_variant_id);
  if (reward.variant_id) return normaliseId(reward.variant_id);
  if (reward.variant?.id) return normaliseId(reward.variant.id);
  return null;
}

// ---------------------------------------------------------------------------
// Cart API helpers
// ---------------------------------------------------------------------------

async function fetchCartJs() {
  const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
  return res.json();
}

/**
 * Apply discount codes to the cart, preserving existing codes.
 * @param {string} newCode
 * @returns {Promise}
 */
async function applyDiscountToCart(newCode) {
  const cart = await fetchCartJs();
  const existing = (cart.discount_codes || []).map((d) => d.code || d);
  const allCodes = [...new Set([...existing, newCode])];
  const body = JSON.stringify({
    discount: allCodes.join(','),
    sections: 'cart-drawer-section'
  });
  return fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body
  }).then((r) => r.json());
}

/**
 * Add a variant to the cart.
 * @param {string|number} variantId
 * @returns {Promise}
 */
async function addVariantToCart(variantId) {
  const body = JSON.stringify({
    id: Number(variantId),
    quantity: 1,
    sections: 'cart-drawer-section'
  });
  return fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body
  }).then((r) => r.json());
}

// ---------------------------------------------------------------------------
// Prefix detection
// ---------------------------------------------------------------------------

/**
 * Check if any applied discount code starts with the loyalty prefix.
 * @param {object[]} discountCodes - array of { code: string } objects
 * @param {string} prefix
 * @returns {boolean}
 */
function hasRivoDiscount(discountCodes, prefix) {
  if (!prefix) return false;
  return discountCodes.some((d) =>
    String(d.code || d).toUpperCase().startsWith(prefix.toUpperCase())
  );
}

// ---------------------------------------------------------------------------
// Per-root sequence guard
// ---------------------------------------------------------------------------

const sequenceMap = new WeakMap();

function nextSeq(root) {
  const seq = (sequenceMap.get(root) || 0) + 1;
  sequenceMap.set(root, seq);
  return seq;
}

function isStale(root, seq) {
  return seq < (sequenceMap.get(root) || 0);
}

// ---------------------------------------------------------------------------
// State refresh
// ---------------------------------------------------------------------------

/**
 * Load customer state (balance + unused purchases) and update card UI.
 * @param {Element} railEl - The redemption rail root element
 * @param {object} config
 */
async function refreshState(railEl, config) {
  const seq = nextSeq(railEl);

  let balance = 0;
  let unusedPurchases = [];

  try {
    const [detailsRes, purchasesRes] = await Promise.all([
      window.RivoJS?.getCustomerDetails?.(),
      window.RivoJS?.getCustomerPointsPurchases?.({ used: false })
    ]);

    if (isStale(railEl, seq)) return;

    balance =
      detailsRes?.customer?.points_tally ||
      detailsRes?.points_tally ||
      0;
    unusedPurchases =
      purchasesRes?.points_purchases ||
      (Array.isArray(purchasesRes) ? purchasesRes : []);
  } catch {
    // Non-fatal: proceed with zero balance
  }

  if (isStale(railEl, seq)) return;

  const cards = railEl.querySelectorAll('[data-reward-id]');
  cards.forEach((card) => {
    const cost = Number(card.dataset.pointsCost || 0);
    const productId = normaliseId(card.dataset.productId);
    const rewardId = normaliseId(card.dataset.rewardId);

    // Check if already claimed (unused purchase matches)
    const claimedPurchase = unusedPurchases.find((p) => {
      const pProductId = normaliseId(
        p.reward?.product_id || p.reward?.shopify_product_id
      );
      const pRewardId = normaliseId(p.reward?.id || p.id);
      return pProductId === productId || pRewardId === rewardId;
    });

    const redeemBtn = card.querySelector('[data-rivo-redeem]');
    const claimedBanner = card.querySelector('[data-rivo-claimed]');

    if (claimedPurchase) {
      // Store claimed state on button for click handler
      if (redeemBtn) {
        redeemBtn.dataset.claimedVariantId = normaliseId(
          claimedPurchase.reward?.variant_ids?.[0] ||
          claimedPurchase.reward?.shopify_variant_id ||
          claimedPurchase.reward?.variant_id
        );
        redeemBtn.dataset.claimedCode = pickDiscountCode(claimedPurchase) || '';
        redeemBtn.hidden = true;
      }
      if (claimedBanner) claimedBanner.hidden = false;
    } else if (cost > balance) {
      card.hidden = true;
    } else {
      card.hidden = false;
      if (redeemBtn) redeemBtn.hidden = false;
      if (claimedBanner) claimedBanner.hidden = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Redeem handler
// ---------------------------------------------------------------------------

async function handleRedeem(btn, railEl, config) {
  if (btn.disabled) return;
  btn.disabled = true;

  const card = btn.closest('[data-reward-id]');
  const rewardId = card?.dataset.rewardId;
  const expectedProductId = normaliseId(card?.dataset.productId);

  try {
    // Claimed path — reuse stored code + variant
    if (btn.dataset.claimedCode && btn.dataset.claimedVariantId) {
      await applyDiscountToCart(btn.dataset.claimedCode);
      await addVariantToCart(btn.dataset.claimedVariantId);
      document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
      return;
    }

    // Redeem path — call Rivo API
    const res = await window.RivoJS?.redeemReward?.(Number(rewardId));
    const { reward, pointsPurchase } = parseRedeemResponse(res);

    if (!reward) throw new Error('No reward in redeemReward response');

    // Validate product id matches clicked card
    const returnedProductId = normaliseId(
      reward.product_id || reward.shopify_product_id
    );
    if (returnedProductId && returnedProductId !== expectedProductId) {
      throw new Error('Reward product id mismatch — aborting cart mutation');
    }

    const discountCode = pickDiscountCode(pointsPurchase || res);
    const variantId = pickVariantId(reward);

    if (!variantId) throw new Error('Could not resolve variant id from reward');

    // CRITICAL ORDER: discount FIRST, then add variant
    if (discountCode) {
      await applyDiscountToCart(discountCode);
    }
    await addVariantToCart(variantId);

    document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
  } catch (err) {
    console.error('[rivo-redemption] Redeem error:', err);
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Rail initialisation
// ---------------------------------------------------------------------------

function initRail(railEl, config) {
  // Attach redeem click handlers
  railEl.querySelectorAll('[data-rivo-redeem]').forEach((btn) => {
    btn.addEventListener('click', () => handleRedeem(btn, railEl, config));
  });

  // Load state for logged-in customer
  if (config.customerId) {
    refreshState(railEl, config);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function init() {
  const config = getConfig();
  if (!config || !config.redemption) return;

  const rails = document.querySelectorAll('[data-rivo-redemption-rail]');
  rails.forEach((rail) => initRail(rail, config));

  // Re-init after cart morphs / section loads
  const reInit = () => {
    const updatedRails = document.querySelectorAll('[data-rivo-redemption-rail]');
    updatedRails.forEach((rail) => {
      // Re-attach handlers and refresh state
      initRail(rail, config);
    });
  };

  document.addEventListener('cart:updated', reInit);
  document.addEventListener('shopify:section:load', reInit);
}

document.addEventListener('rivo-js-loaded', () => { init(); }, { once: true });
