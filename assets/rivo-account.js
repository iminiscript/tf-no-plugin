/**
 * rivo-account.js
 *
 * Intercepts clicks on [data-rivo-account] elements and redirects to the
 * Rivo Account Widget via the #rivo hash deep link.
 *
 * Activation is deferred until the `rivo-js-loaded` document event fires.
 * If Rivo never loads (embed off, script blocked), the native <shopify-account>
 * behaviour is entirely unaffected.
 *
 * Side-effect-only module — exports nothing.
 */

function activate() {
  const targets = document.querySelectorAll('[data-rivo-account]');
  if (!targets.length) return;

  targets.forEach((el) => {
    // Progressive enhancement: point any <a> href to #rivo so middle-click /
    // keyboard activation also works.
    if (el.tagName === 'A') {
      el.href = '#rivo';
    }

    // Capture-phase listener intercepts before the native <shopify-account>
    // web component processes the event.
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        location.hash = '#rivo';
      },
      true // useCapture
    );
  });
}

// Queue activation — act only after Rivo's embed fires rivo-js-loaded.
document.addEventListener('rivo-js-loaded', activate, { once: true });
