// Turns a raw BigCartel /products.json array into the catalog shape our
// generator consumes: adds the `.image` (singular, first image) convenience
// field the real templates expect, computes the derived `categories` list,
// and fills in a minimal `store` object (BigCartel's own /store.json only
// exposes currency/name, and even that wasn't reachable when this fixture
// was captured - see generator/README.md).
'use strict';

function normalize(rawProducts, opts) {
  opts = opts || {};
  const products = rawProducts.map((p) => Object.assign({}, p, {
    image: (p.images && p.images[0]) || null,
    css_class: '',
  }));

  const catMap = new Map();
  for (const p of products) {
    for (const c of p.categories || []) {
      if (!catMap.has(c.permalink)) catMap.set(c.permalink, { id: c.id, name: c.name, permalink: c.permalink, url: c.url });
    }
  }
  const categories = Array.from(catMap.values());

  return {
    fetched_at: opts.fetchedAt || new Date().toISOString(),
    source: opts.source || 'unknown',
    store: opts.store || { name: 'vgthmind', currency: { code: 'EUR' } },
    products,
    categories,
  };
}

module.exports = { normalize };
