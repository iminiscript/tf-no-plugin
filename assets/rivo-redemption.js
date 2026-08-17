/**
 * rivo-redemption.js — Rivo loyalty cart redemption rail.
 *
 * Flow:
 * 1. Finds .rivo-redemption containers after rivo-js-loaded.
 * 2. Loads customer state (balance + unused purchases) in parallel.
 * 3. Sets per-card data-state: claimed | redeemable | hidden.
 * 4. Handles redeem clicks: discount-code apply FIRST, then cart/add.js.
 * 5. Prefix detection: if a Rivo-prefixed code is in cart, shows claimed banner.
 * 6. Stale-refresh guard: sequence counter per root drops late async completions.
 */

/**
 * Normalises a Shopify product or variant id to a plain numeric string.
 * Handles GIDs ("gid://shopify/Product/123") and plain numbers.
 * @param {string|number|null|undefined} id
 * @returns {string}
 */
function normaliseId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id);
  const gidMatch = str.match(/\/(\d+)$/);
  return gidMatch ? gidMatch[1] : str.replace(/\D/g, '');
}

/**
 * Unwraps polymorphic getCustomerDetails response.
 * Returns the customer object or null.
 * @param {unknown} res
 * @returns {{ points_tally?: number, [key: string]: unknown }|null}
 */
function unwrapCustomerDetails(res) {
  if (!res || typeof res !== 'object') return null;
  if (typeof res.customer === 'object') return res.customer;
  // Some versions return points_tally flat on the root
  if (typeof res.points_tally === 'number') return res;
  return null;
}

/**
 * Extracts the points balance from getCustomerDetails response.
 * @param {unknown} res
 * @returns {number}
 */
function extractBalance(res) {
  const customer = unwrapCustomerDetails(res);
  if (!customer) return 0;
  return typeof customer.points_tally === 'number' ? customer.points_tally : 0;
}

/**
 * Unwraps polymorphic getCustomerPointsPurchases response.
 * @param {unknown} res
 * @returns {Array<unknown>}
 */
function unwrapPurchases(res) {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    if (Array.isArray(res.points_purchases)) return res.points_purchases;
  }
  return [];
}

/**
 * Picks the discount code from a points_purchase row.
 * Tries the production-verified field chain.
 * @param {Object} purchase
 * @returns {string|null}
 */
function pickDiscountCode(purchase) {
  if (!purchase) return null;
  for (const field of [
    'discount_code',
    'code',
    'redemption_code',
    'coupon_code',
    'shopify_discount_code',
  ]) {
    if (purchase[field]) return purchase[field];
  }
  // Try metadata.*
  if (purchase.metadata && typeof purchase.metadata === 'object') {
    for (const val of Object.values(purchase.metadata)) {
      if (val && typeof val === 'string') return val;
    }
  }
  return null;
}

/**
 * Picks the variant id from a reward object.
 * Tries multiple observed field names; handles GIDs and comma/JSON-array forms.
 * @param {Object} reward
 * @returns {number|null}
 */
function pickVariantId(reward) {
  if (!reward) return null;

  // variant_ids array
  if (Array.isArray(reward.variant_ids) && reward.variant_ids.length > 0) {
    return Number(normaliseId(reward.variant_ids[0]));
  }

  for (const field of ['shopify_variant_id', 'variant_id']) {
    if (reward[field] !== undefined && reward[field] !== null) {
      const raw = String(reward[field]);
      // Handle comma-separated list
      const first = raw.split(',')[0].trim();
      return Number(normaliseId(first));
    }
  }

  if (reward.variant) {
    return Number(normaliseId(reward.variant.id || reward.variant));
  }

  return null;
}

/**
 * Unwraps the polymorphic redeemReward response.
 * Returns { reward, pointsPurchase } or null.
 * @param {unknown} res
 * @returns {{ reward: Object|null, pointsPurchase: Object|null }|null}
 */
function unwrapRedeemResponse(res) {
  if (!res || typeof res !== 'object') return null;

  // Shape 1: { reward }
  if (res.reward) return { reward: res.reward, pointsPurchase: res };

  // Shape 2: { points_purchase: { reward } }
  if (res.points_purchase) {
    return { reward: res.points_purchase.reward || null, pointsPurchase: res.points_purchase };
  }

  // Shape 3: { points_purchases: [...] }
  if (Array.isArray(res.points_purchases) && res.points_purchases.length > 0) {
    const pp = res.points_purchases[0];
    return { reward: pp.reward || null, pointsPurchase: pp };
  }

  return null;
}

/**
 * Applies a discount code to the cart (comma-joining with existing codes).
 * @param {string} newCode
 * @param {string[]} sectionIds - Section IDs to include in the sections response.
 * @returns {Promise<Object>} Updated cart object.
 */
async function applyDiscountCode(newCode, sectionIds = []) {
  // Read current cart to get existing discount codes
  const cartRes = await fetch('/cart.js');
  if (!cartRes.ok) throw new Error('Failed to read cart');
  const cart = await cartRes.json();

  const existingCodes = (cart.discount_codes || []).map((dc) => dc.code).filter(Boolean);
  if (!existingCodes.includes(newCode)) {
    existingCodes.push(newCode);
  }

  const body = {
    discount: existingCodes.join(','),
  };

  if (sectionIds.length) {
    body.sections = sectionIds;
  }

  const updateRes = await fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!updateRes.ok) throw new Error('Failed to apply discount code');
  return await updateRes.json();
}

/**
 * Adds a reward variant to the cart.
 * @param {number} variantId
 * @param {string[]} sectionIds
 * @returns {Promise<Object>}
 */
async function addRewardVariant(variantId, sectionIds = []) {
  const body = {
    items: [{ id: variantId, quantity: 1 }],
  };

  if (sectionIds.length) {
    body.sections = sectionIds;
  }

  const res = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Failed to add reward variant');
  return await res.json();
}

/**
 * Dispatches theme cart refresh events so the drawer/page re-renders.
 */
function dispatchCartRefresh() {
  document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
  document.dispatchEvent(new CustomEvent('cart-drawer:open', { bubbles: true }));
}

/**
 * Checks whether a Rivo-prefixed discount code is already applied to the cart.
 * @param {string} prefix - The configured discount prefix.
 * @returns {Promise<boolean>}
 */
async function hasRivoPrefixedCode(prefix) {
  if (!prefix) return false;
  try {
    const res = await fetch('/cart.js');
    if (!res.ok) return false;
    const cart = await res.json();
    const codes = (cart.discount_codes || []).map((dc) => dc.code || '');
    return codes.some((code) => code.toUpperCase().startsWith(prefix.toUpperCase()));
  } catch {
    return false;
  }
}

/**
 * Loads redemption state for a single rail root.
 * @param {HTMLElement} root - The .rivo-redemption element.
 * @param {number} seq - Current sequence number; used to detect stale completions.
 * @param {Map<HTMLElement, number>} seqMap - Shared sequence counter map.
 */
async function loadRedemptionState(root, seq, seqMap) {
  const prefix = root.dataset.prefix || '';
  const config = window.RivoTheme?.config;

  // Check if a Rivo code is already applied — show claimed banner
  const alreadyClaimed = await hasRivoPrefixedCode(prefix);
  if (seqMap.get(root) !== seq) return; // Stale

  if (alreadyClaimed) {
    root.setAttribute('data-rail-claimed', '');
    return;
  } else {
    root.removeAttribute('data-rail-claimed');
  }

  // Load customer details and unused purchases in parallel
  let detailsRes, purchasesRes;
  try {
    [detailsRes, purchasesRes] = await Promise.all([
      window.RivoJS?.getCustomerDetails(),
      window.RivoJS?.getCustomerPointsPurchases({ used: false }),
    ]);
  } catch {
    return; // API error — leave rail in default state
  }

  if (seqMap.get(root) !== seq) return; // Stale

  const balance = extractBalance(detailsRes);
  const purchases = unwrapPurchases(purchasesRes);

  // Write balance
  const balanceEl = root.querySelector('[data-rivo-balance]');
  if (balanceEl) balanceEl.textContent = balance.toLocaleString();

  // Update card states
  const cards = root.querySelectorAll('.rivo-redemption__card');
  for (const card of cards) {
    const cardProductId = normaliseId(card.dataset.productId || '');
    const cardRewardId = normaliseId(card.dataset.rewardId || '');
    const pointsCost = parseInt(card.dataset.pointsCost, 10) || 0;

    // Find matching unused purchase by product id or reward id
    const matchedPurchase = purchases.find((p) => {
      const pRewardId = normaliseId(
        p.reward?.id || p.reward?.shopify_product_id || p.product_id || ''
      );
      const pProductId = normaliseId(p.reward?.product_id || p.product_id || '');
      return pRewardId === cardRewardId || pProductId === cardProductId;
    });

    if (matchedPurchase) {
      // Claimed — stamp variant id + discount code for direct redemption
      const reward = matchedPurchase.reward || {};
      const variantId = pickVariantId(reward);
      const discountCode = pickDiscountCode(matchedPurchase);

      card.setAttribute('data-state', 'claimed');
      if (variantId) card.dataset.variantId = String(variantId);
      if (discountCode) card.dataset.code = discountCode;
    } else if (pointsCost > balance) {
      card.setAttribute('data-state', 'hidden');
    } else {
      card.setAttribute('data-state', 'redeemable');
    }
  }
}

/**
 * Handles a redeem button click on a reward card.
 * @param {HTMLElement} root - The .rivo-redemption container.
 * @param {HTMLElement} card - The .rivo-redemption__card element.
 * @param {Map<HTMLElement, number>} seqMap
 */
async function handleRedeemClick(root, card, seqMap) {
  const btn = card.querySelector('.rivo-redemption__redeem-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing…';
  }

  const state = card.dataset.state;
  const cardProductId = normaliseId(card.dataset.productId || '');
  const rewardId = card.dataset.rewardId || '';
  const sectionIds = ['cart-drawer-section'];

  try {
    let variantId, discountCode;

    if (state === 'claimed') {
      // Already redeemed — use stamped values
      variantId = Number(card.dataset.variantId);
      discountCode = card.dataset.code;
    } else {
      // Redeemable — call redeemReward with NUMERIC id
      const numericRewardId = Number(normaliseId(rewardId));
      const redeemRes = await window.RivoJS?.redeemReward(numericRewardId);

      const unwrapped = unwrapRedeemResponse(redeemRes);
      if (!unwrapped) throw new Error('Invalid redeemReward response');

      const { reward, pointsPurchase } = unwrapped;

      // VALIDATE: returned reward's product id must match the clicked card's product id
      const returnedProductId = normaliseId(
        reward?.product_id || reward?.shopify_product_id || ''
      );
      if (returnedProductId && returnedProductId !== cardProductId) {
        throw new Error(
          `Product id mismatch: expected ${cardProductId}, got ${returnedProductId}`
        );
      }

      variantId = pickVariantId(reward);
      discountCode = pickDiscountCode(pointsPurchase);
    }

    if (!variantId) throw new Error('Could not determine reward variant id');

    // APPLY discount code FIRST, then add variant
    if (discountCode) {
      await applyDiscountCode(discountCode, sectionIds);
    }

    await addRewardVariant(variantId, sectionIds);

    // Refresh cart UI
    dispatchCartRefresh();

    // Increment sequence to trigger a fresh state load
    const newSeq = (seqMap.get(root) || 0) + 1;
    seqMap.set(root, newSeq);
    await loadRedemptionState(root, newSeq, seqMap);
  } catch (err) {
    console.warn('[rivo-redemption] Redeem failed:', err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Redeem';
    }
  }
}

/**
 * Initialises all .rivo-redemption containers.
 */
function initRedemptionRails() {
  const rails = document.querySelectorAll('.rivo-redemption');
  if (!rails.length) return;

  /** @type {Map<HTMLElement, number>} Sequence counter per rail root */
  const seqMap = new Map();

  for (const root of rails) {
    const seq = 1;
    seqMap.set(root, seq);

    // Kick off state load
    loadRedemptionState(root, seq, seqMap).catch((err) =>
      console.warn('[rivo-redemption] State load error:', err)
    );

    // Attach click delegation for redeem buttons
    root.addEventListener('click', function (event) {
      const btn = event.target.closest('.rivo-redemption__redeem-btn');
      if (!btn) return;

      const card = btn.closest('.rivo-redemption__card');
      if (!card) return;

      handleRedeemClick(root, card, seqMap).catch((err) =>
        console.warn('[rivo-redemption] handleRedeemClick error:', err)
      );
    });
  }

  // Re-init after cart refresh events (drawer morphs)
  document.addEventListener('cart:refresh', function () {
    for (const root of document.querySelectorAll('.rivo-redemption')) {
      const seq = (seqMap.get(root) || 0) + 1;
      seqMap.set(root, seq);
      loadRedemptionState(root, seq, seqMap).catch(() => {});
    }
  });

  document.addEventListener('shopify:section:load', function () {
    for (const root of document.querySelectorAll('.rivo-redemption')) {
      const seq = (seqMap.get(root) || 0) + 1;
      seqMap.set(root, seq);
      loadRedemptionState(root, seq, seqMap).catch(() => {});
    }
  });
}

// Boot after rivo-js-loaded
window.RivoTheme?.onRivoReady(function () {
  initRedemptionRails();
});
