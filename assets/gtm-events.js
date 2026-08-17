(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Read a JSON script block from the DOM by ID. Returns null if not found. */
  function readJsonBlock(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  /** Wait for window.DL to be available (loaded via defer, should be ready by DOMContentLoaded). */
  function getDL() {
    return window.DL;
  }

  // ---------------------------------------------------------------------------
  // Cart snapshot management
  // ---------------------------------------------------------------------------

  // Cart snapshot: map from variant_id (string) -> quantity (number)
  var cartSnapshot = {};

  // Token guard to avoid double-firing the reconcile when multiple signals fire.
  var reconcileToken = null;

  /** Fetch /cart.js and return the parsed cart object. */
  function fetchCart() {
    return fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }

  /** Build a snapshot map from cart.js lines. */
  function buildSnapshot(cart) {
    var snap = {};
    if (cart && cart.items) {
      cart.items.forEach(function (line) {
        snap[String(line.variant_id)] = line.quantity;
      });
    }
    return snap;
  }

  /** Initialise the cart snapshot from /cart.js. */
  function initCartSnapshot() {
    fetchCart().then(function (cart) {
      cartSnapshot = buildSnapshot(cart);
    }).catch(function () {});
  }

  /**
   * Reconcile current cart against previous snapshot and push add/remove events.
   * @param {object} cart - Freshly fetched /cart.js cart object
   */
  function reconcileCart(cart) {
    var DL = getDL();
    if (!DL) return;

    var newSnap = buildSnapshot(cart);
    var allKeys = {};

    Object.keys(cartSnapshot).forEach(function (k) { allKeys[k] = true; });
    Object.keys(newSnap).forEach(function (k) { allKeys[k] = true; });

    Object.keys(allKeys).forEach(function (variantId) {
      var prev = cartSnapshot[variantId] || 0;
      var curr = newSnap[variantId] || 0;
      var delta = curr - prev;

      if (delta === 0) return;

      // Find the line in the new cart for item data
      var line = cart.items.find(function (l) { return String(l.variant_id) === variantId; });

      if (!line) {
        // Item was removed entirely — use old snapshot data if available.
        // We only know variant_id here; push a minimal event.
        if (delta < 0) {
          DL.pushEvent('remove_from_cart', {
            currency: cart.currency,
            value: 0,
            items: [{
              item_id: variantId,
              quantity: Math.abs(delta)
            }]
          });
        }
        return;
      }

      var item = {
        item_id: (line.sku && line.sku !== '') ? line.sku : String(line.variant_id),
        item_name: line.product_title,
        item_brand: line.vendor,
        price: DL.money(line.final_price != null ? line.final_price : line.price),
        quantity: Math.abs(delta)
      };

      if (line.variant_title && line.variant_title !== 'Default Title') {
        item.item_variant = line.variant_title;
      }

      var eventValue = item.price * Math.abs(delta);

      if (delta > 0) {
        DL.pushEvent('add_to_cart', {
          currency: cart.currency,
          value: eventValue,
          items: [item]
        });
      } else {
        DL.pushEvent('remove_from_cart', {
          currency: cart.currency,
          value: eventValue,
          items: [item]
        });
      }
    });

    cartSnapshot = newSnap;
  }

  /**
   * Trigger a cart reconcile with a dedup token guard.
   * Optionally waits for a promise before fetching.
   * @param {Promise} [promise] - Optional promise to await before fetching
   */
  function triggerReconcile(promise) {
    var token = Math.random().toString(36).slice(2);
    reconcileToken = token;

    var work = promise ? Promise.resolve(promise) : Promise.resolve();
    work.then(function () {
      if (reconcileToken !== token) return; // superseded by a newer signal
      return fetchCart();
    }).then(function (cart) {
      if (!cart || reconcileToken !== token) return;
      reconcileToken = null;
      reconcileCart(cart);
    }).catch(function () {
      reconcileToken = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Fetch interceptor — primary cart-change signal
  // ---------------------------------------------------------------------------

  var cartPathPattern = /\/cart\/(add|change|update|clear)(\?|$|\b)/;

  (function installFetchInterceptor() {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
      var method = (init && init.method ? init.method : (input && input.method ? input.method : 'GET')).toUpperCase();

      var isCartMutation = method === 'POST' && cartPathPattern.test(url);

      var result = originalFetch.apply(this, arguments);

      if (isCartMutation) {
        result.then(function (res) {
          if (res.ok) {
            triggerReconcile();
          }
          return res;
        }).catch(function () {});
      }

      return result;
    };
  })();

  // ---------------------------------------------------------------------------
  // Secondary cart-change signals (Horizon custom events)
  // ---------------------------------------------------------------------------

  var cartEventNames = [
    'cart:updated',
    'cart-drawer:updated',
    'theme:cart:updated',
    'cart-items:change',
    'cart-items:updated'
  ];

  cartEventNames.forEach(function (name) {
    document.addEventListener(name, function (e) {
      var promise = e.detail && e.detail.promise ? e.detail.promise : null;
      triggerReconcile(promise);
    });
  });

  // ---------------------------------------------------------------------------
  // (1) view_item_list — fires on DOMContentLoaded when #dl-list-ctx is present
  // ---------------------------------------------------------------------------

  function fireViewItemList() {
    var DL = getDL();
    if (!DL) return;

    var listCtx = readJsonBlock('dl-list-ctx');
    if (!listCtx) return;

    var anchors = Array.prototype.slice.call(document.querySelectorAll('a[data-dl-id]'));
    if (!anchors.length) return;

    var items = anchors.map(function (a, idx) {
      var item = {
        item_id: a.getAttribute('data-dl-id') || '',
        item_name: a.getAttribute('data-dl-name') || '',
        item_brand: a.getAttribute('data-dl-brand') || '',
        price: DL.money(parseFloat(a.getAttribute('data-dl-price') || '0')),
        quantity: 1,
        item_list_id: listCtx.list_id,
        item_list_name: listCtx.list_name,
        index: idx + 1
      };

      var variant = a.getAttribute('data-dl-variant');
      if (variant && variant !== 'Default Title') {
        item.item_variant = variant;
      }

      return item;
    });

    var value = items.reduce(function (sum, item) { return sum + item.price; }, 0);

    DL.pushEvent('view_item_list', {
      item_list_id: listCtx.list_id,
      item_list_name: listCtx.list_name,
      items: items,
      value: value
    });
  }

  // ---------------------------------------------------------------------------
  // (2) select_item — click delegation on document for a[data-dl-id]
  // ---------------------------------------------------------------------------

  document.addEventListener('click', function (e) {
    var DL = getDL();
    if (!DL) return;

    var anchor = e.target.closest('a[data-dl-id]');
    if (!anchor) return;

    var listCtx = readJsonBlock('dl-list-ctx');

    var item = {
      item_id: anchor.getAttribute('data-dl-id') || '',
      item_name: anchor.getAttribute('data-dl-name') || '',
      item_brand: anchor.getAttribute('data-dl-brand') || '',
      price: DL.money(parseFloat(anchor.getAttribute('data-dl-price') || '0')),
      quantity: 1
    };

    var variant = anchor.getAttribute('data-dl-variant');
    if (variant && variant !== 'Default Title') {
      item.item_variant = variant;
    }

    if (listCtx) {
      item.item_list_id = listCtx.list_id;
      item.item_list_name = listCtx.list_name;

      // Determine index by position among all list anchors
      var allAnchors = Array.prototype.slice.call(document.querySelectorAll('a[data-dl-id]'));
      var idx = allAnchors.indexOf(anchor);
      if (idx !== -1) {
        item.index = idx + 1;
      }
    }

    DL.pushEvent('select_item', {
      item_list_id: listCtx ? listCtx.list_id : undefined,
      item_list_name: listCtx ? listCtx.list_name : undefined,
      items: [item]
    });
  });

  // ---------------------------------------------------------------------------
  // (3) view_item — fires on PDP load and re-fires on variant change
  // ---------------------------------------------------------------------------

  function buildProductCtxMap(productCtx) {
    var map = {};
    if (productCtx && productCtx.product && productCtx.product.variants) {
      productCtx.product.variants.forEach(function (v) {
        map[String(v.id)] = v;
      });
    }
    return map;
  }

  function fireViewItem(productCtx, variantId) {
    var DL = getDL();
    if (!DL || !productCtx) return;

    var variantMap = buildProductCtxMap(productCtx);
    var variant = variantMap[String(variantId)];
    if (!variant) {
      // Fall back to first variant
      variant = productCtx.product && productCtx.product.variants && productCtx.product.variants[0];
    }
    if (!variant) return;

    var item = DL.itemFromVariant(productCtx.product, variant, { quantity: 1 });

    DL.pushEvent('view_item', {
      currency: undefined, // currency not available in product context
      value: item.price,
      items: [item]
    });
  }

  function initViewItem() {
    var productCtx = readJsonBlock('dl-product-ctx');
    if (!productCtx) return;

    // Fire on initial load
    fireViewItem(productCtx, productCtx.selected_variant_id);

    // Re-fire on variant change via hidden input[name='id']
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'id') {
        fireViewItem(productCtx, e.target.value);
      }
    });

    // Re-fire on variant option button/label interactions
    document.addEventListener('click', function (e) {
      var variantBtn = e.target.closest('[data-variant-id]');
      if (variantBtn) {
        fireViewItem(productCtx, variantBtn.getAttribute('data-variant-id'));
        return;
      }

      // Horizon uses <variant-radio> / <variant-select> components; also watch
      // for swatch inputs emitting change which bubbles and is caught above.
    });

    // Also listen for Horizon's own variant change event
    document.addEventListener('variant:change', function (e) {
      var variantId = e.detail && (e.detail.variant_id || (e.detail.variant && e.detail.variant.id));
      if (variantId) {
        fireViewItem(productCtx, variantId);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // (4) view_cart — cart drawer open + /cart page load
  // ---------------------------------------------------------------------------

  function fireViewCart() {
    var DL = getDL();
    if (!DL) return;

    fetchCart().then(function (cart) {
      if (!cart || !cart.items) return;

      var items = DL.itemsFromCartLines(cart.items);
      var value = cart.items.reduce(function (sum, l) {
        return sum + DL.money(l.final_price != null ? l.final_price : l.price) * l.quantity;
      }, 0);

      DL.pushEvent('view_cart', {
        currency: cart.currency,
        value: value,
        items: items
      });
    }).catch(function () {});
  }

  // Cart drawer open events — listen for multiple possible event names from Horizon
  var cartOpenEventNames = [
    'cart-drawer:open',
    'cart:open',
    'theme:cart:open',
    'cart-drawer:opened'
  ];

  cartOpenEventNames.forEach(function (name) {
    document.addEventListener(name, function () {
      fireViewCart();
    });
  });

  // Also observe cart-drawer element becoming visible via the open attribute
  (function observeCartDrawer() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'open' &&
          mutation.target.hasAttribute('open')
        ) {
          fireViewCart();
        }
      });
    });

    function attachObserver() {
      var cartDrawer = document.querySelector('cart-drawer, [id*="cart-drawer"], .cart-drawer');
      if (cartDrawer) {
        observer.observe(cartDrawer, { attributes: true, attributeFilter: ['open'] });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachObserver);
    } else {
      attachObserver();
    }
  })();

  // ---------------------------------------------------------------------------
  // (5) begin_checkout — form submit + link/button click patterns
  // ---------------------------------------------------------------------------

  var checkoutFired = false;

  function fireBeginCheckout() {
    if (checkoutFired) return;
    checkoutFired = true;

    var DL = getDL();
    if (!DL) return;

    fetchCart().then(function (cart) {
      if (!cart || !cart.items) return;

      var items = DL.itemsFromCartLines(cart.items);
      var value = cart.items.reduce(function (sum, l) {
        return sum + DL.money(l.final_price != null ? l.final_price : l.price) * l.quantity;
      }, 0);

      DL.pushEvent('begin_checkout', {
        currency: cart.currency,
        value: value,
        items: items
      });
    }).catch(function () {});
  }

  // Form submit — Horizon cart forms post to /cart with button[name="checkout"]
  document.addEventListener('submit', function (e) {
    if (!e.target) return;
    var submitterName = e.submitter && e.submitter.name;
    var formAction = e.target.action || '';

    if (submitterName === 'checkout' || formAction.indexOf('/checkout') !== -1) {
      fireBeginCheckout();
    }
  });

  // Anchor and button click patterns
  document.addEventListener('click', function (e) {
    var el = e.target;

    // a[href*="/checkout"]
    var checkoutLink = el.closest('a[href*="/checkout"]');
    if (checkoutLink) {
      fireBeginCheckout();
      return;
    }

    // button[name="checkout"] outside a form that would be caught by submit
    var checkoutBtn = el.closest('button[name="checkout"]');
    if (checkoutBtn && !checkoutBtn.form) {
      fireBeginCheckout();
    }
  }, true); // capture phase to fire before navigation

  // Reset the flag on page show (back/forward navigation in bfcache)
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      checkoutFired = false;
    }
  });

  // ---------------------------------------------------------------------------
  // (6) search — search form submit
  // ---------------------------------------------------------------------------

  document.addEventListener('submit', function (e) {
    if (!e.target) return;
    var form = e.target;
    var actionUrl = form.action || '';
    if (actionUrl.indexOf('/search') === -1) return;

    var queryInput = form.querySelector('input[name="q"], input[type="search"]');
    if (!queryInput) return;

    var query = queryInput.value || '';
    if (!query.trim()) return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: 'search',
      search_term: query.trim()
    });
  });

  // ---------------------------------------------------------------------------
  // DOMContentLoaded — fire view_item_list, view_item, view_cart on /cart
  // ---------------------------------------------------------------------------

  function onDOMReady() {
    // Initialise cart snapshot
    initCartSnapshot();

    // (1) view_item_list — collection and search pages
    if (document.getElementById('dl-list-ctx')) {
      fireViewItemList();
    }

    // (3) view_item — product page
    if (document.getElementById('dl-product-ctx')) {
      initViewItem();
    }

    // view_cart — /cart page
    if (window.location.pathname === '/cart') {
      fireViewCart();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }
})();
