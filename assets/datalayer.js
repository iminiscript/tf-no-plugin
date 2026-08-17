(function () {
  'use strict';

  /**
   * Converts Shopify cents to major currency units.
   * This is the ONLY place where this conversion should be performed.
   * @param {number} cents - Price in cents (e.g. 1495)
   * @returns {number} Price in major units (e.g. 14.95)
   */
  function money(cents) {
    return Math.round(cents) / 100;
  }

  /**
   * Pushes a GA4 ecommerce event to the dataLayer.
   * Always clears ecommerce before pushing to prevent GTM from merging
   * previous event's items into this one.
   * @param {string} event - The GA4 event name (e.g. 'add_to_cart')
   * @param {object} ecommerce - The GA4 ecommerce payload object
   */
  function pushEvent(event, ecommerce) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event: event, ecommerce: ecommerce });

    if (window.__dlDebug === true || new URLSearchParams(window.location.search).has('dl_debug')) {
      console.table([{
        event: event,
        value: ecommerce && ecommerce.value,
        items: ecommerce && ecommerce.items ? ecommerce.items.length : 0
      }]);
      console.log('[DL]', event, ecommerce);
    }
  }

  /**
   * Builds a GA4 item object from a Shopify product + variant.
   * @param {object} product - Object with title, vendor properties
   * @param {object} variant - Object with id, sku, title, price properties
   * @param {object} [ctx] - Optional context object
   * @param {number} [ctx.quantity] - Item quantity
   * @param {object} [ctx.list] - List context with id and name properties
   * @param {number} [ctx.index] - Position index in the list (1-based)
   * @returns {object} GA4 item object
   */
  function itemFromVariant(product, variant, ctx) {
    ctx = ctx || {};

    var item = {
      item_id: (variant.sku && variant.sku !== '') ? variant.sku : String(variant.id),
      item_name: product.title,
      item_brand: product.vendor,
      price: money(variant.price),
      quantity: ctx.quantity || 1
    };

    if (variant.title && variant.title !== 'Default Title') {
      item.item_variant = variant.title;
    }

    if (ctx.list) {
      item.item_list_id = ctx.list.id;
      item.item_list_name = ctx.list.name;
      if (ctx.index !== undefined) {
        item.index = ctx.index;
      }
    }

    return item;
  }

  /**
   * Builds GA4 item objects from /cart.js line items.
   * Note: cart.js prices are in cents — converted via money().
   * @param {Array} lines - Array of cart line objects from /cart.js
   * @returns {Array} Array of GA4 item objects
   */
  function itemsFromCartLines(lines) {
    return lines.map(function (line) {
      var item = {
        item_id: (line.sku && line.sku !== '') ? line.sku : String(line.variant_id),
        item_name: line.product_title,
        item_brand: line.vendor,
        price: money(line.final_price != null ? line.final_price : line.price),
        quantity: line.quantity
      };

      if (line.variant_title && line.variant_title !== 'Default Title') {
        item.item_variant = line.variant_title;
      }

      return item;
    });
  }

  window.DL = {
    pushEvent: pushEvent,
    money: money,
    itemFromVariant: itemFromVariant,
    itemsFromCartLines: itemsFromCartLines
  };
})();
