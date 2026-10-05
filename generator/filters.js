// Filter implementations for the Liquid-subset engine (see liquid.js).
// BigCartel-platform filters (product_image_url, instant_checkout_button,
// hidden_option_input, contact_input...) are re-implemented here to target
// OUR OWN site (local/downloaded images, our own cart+Stripe Checkout flow -
// step 3, not built yet) instead of BigCartel's backend. Anything that would
// only make sense wired to BigCartel's own servers (PayPal/Stripe "buy now"
// messaging, native inventory bars) is stubbed to render nothing rather than
// a broken/misleading control.

'use strict';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount, format) {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (format && format.includes('{{amount}}')) return format.replace('{{amount}}', formatted);
  return formatted + ' €';
}

// Rewrites a BigCartel product-image URL (…/product_images/…?w=&h=…) to our
// locally-hosted copy, matching the width so the same srcset markup works.
// Falls back to the original remote URL if no local copy is registered yet
// (import-catalog.js not yet run against a real network) - the generator
// still renders end-to-end even without images, just with broken <img>s the
// browser reports individually rather than a build failure.
function productImageUrl(image, ctx) {
  if (!image || !image.url) return '';
  const local = ctx && ctx.__imageMap && ctx.__imageMap[image.url];
  return local || image.url;
}

function constrain(url, width) {
  if (!url) return '';
  try {
    if (url.startsWith('/')) return `${url}?w=${Math.round(width)}`;
    const u = new URL(url);
    u.searchParams.set('w', Math.round(width));
    if (u.searchParams.has('h')) u.searchParams.set('h', Math.round(width));
    return u.toString();
  } catch (e) {
    return url;
  }
}

function productPrice(product) {
  if (!product) return '';
  if (product.price_suffix && product.variable_pricing) return money(product.default_price) + '+';
  return money(product.default_price != null ? product.default_price : product.price);
}

// Our own DOM-compatible "Add to cart" control: keeps the same class names
// vg-transitions-dev.js/.css already target (form.product-form,
// #add-to-cart-button) but the actual cart wiring is step 3 (not built this
// turn) - marked with data-vg-todo so it's easy to grep for later.
function hiddenOptionInput(option) {
  if (!option) return '';
  return `<input type="hidden" name="cart[add][id]" value="${escapeHtml(option.id)}" data-vg-todo="cart-wiring-step-3">`;
}

// Stubbed: BigCartel's native PayPal/Stripe "buy now" button. Our own
// checkout (Stripe Checkout via Cloudflare Worker) is step 3 - rendering
// nothing here rather than a non-functional button.
function instantCheckoutButton() {
  return '';
}

function contactInput(field) {
  const name = (field && field.name) || '';
  const label = escapeHtml(name);
  const id = 'contact-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (field && field.type === 'text_area') {
    return `<label for="${id}">${label}</label><textarea id="${id}" name="${escapeHtml(name)}"></textarea>`;
  }
  return `<label for="${id}">${label}</label><input id="${id}" type="text" name="${escapeHtml(name)}">`;
}

function defaultPagination() {
  // Static site: everything renders on one page, so no pager markup.
  return '';
}

function themeCssUrl() { return '/assets/theme.css'; }
function themeJsUrl() { return '/assets/theme.js'; }

function fontFamily(name) {
  return name || 'inherit';
}

function linkTo(value, url) {
  // Real BigCartel usage in these templates is always the 1-arg form:
  // {{ category | link_to }} / {{ custom_page | link_to }} - `value` is an
  // object with .url/.name, not text. No 2-arg call site exists in the
  // templates we render, but the 2-arg form is kept for completeness.
  if (url === undefined && value && typeof value === 'object') {
    return `<a href="${escapeHtml(value.url)}">${escapeHtml(value.name)}</a>`;
  }
  return `<a href="${escapeHtml(url)}">${escapeHtml(value)}</a>`;
}

function paragraphs(text) {
  if (!text) return '';
  return String(text).split(/\r?\n\r?\n/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('\n');
}

function pluralize(n, singular, plural) {
  return Number(n) === 1 ? singular : plural;
}

module.exports = {
  default: (v, d) => (v === undefined || v === null || v === '' ? d : v),
  escape: (v) => escapeHtml(v),
  strip: (v) => String(v == null ? '' : v).trim(),
  replace: (v, a, b) => String(v == null ? '' : v).split(a).join(b),
  append: (v, a) => String(v == null ? '' : v) + String(a == null ? '' : a),
  plus: (v, a) => Number(v || 0) + Number(a || 0),
  times: (v, a) => Number(v || 0) * Number(a || 0),
  divided_by: (v, a) => (Number(a) === 0 ? 0 : Number(v || 0) / Number(a)),
  pluralize: (v, a, b) => pluralize(v, a, b),
  paragraphs: (v) => paragraphs(v),
  money: (v, fmt) => money(v, fmt),
  link_to: (v, url) => linkTo(v, url),
  product_image_url: (v, ctx) => productImageUrl(v, ctx),
  constrain: (v, w) => constrain(v, w),
  product_price: (v, fmt) => productPrice(v),
  hidden_option_input: (v) => hiddenOptionInput(v),
  instant_checkout_button: () => instantCheckoutButton(),
  contact_input: (v) => contactInput(v),
  default_pagination: () => defaultPagination(),
  theme_css_url: () => themeCssUrl(),
  theme_js_url: () => themeJsUrl(),
  font_family: (v) => fontFamily(v),
  age: () => '',
  photoswipe: (v) => v,
};
