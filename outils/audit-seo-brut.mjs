// Audit brut : statut, redirections, canonical, robots pour une liste d'URL (lecture seule).
const O = 'https://www.vgthmind.org';
const sm = await (await fetch(O + '/sitemap.xml')).text();
const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const extra = ['/product/t-shirt-custom','/product/t-shirt-custom/','/assets/','/assets','/assets/products-sized/','/products','/product/ch_0006','/product/sc_0008','/product/sma_0001','/product/short-ge0001','/product/pantalon-vc001','/product/ch_0003','/product/gp_0002','/product/short-sg001','/contact','/contact/','/contact-914a3d/','/contact-914a3d','/suivi','/suivi/','/cart','/cart/','/merci/','/admin/','/product/longsleeve-td002','/product/cache-cou','/category/merch','/assets/vg/products-config.json','/products.json','/products.xml','/category/customsupcycling','/product/cd-vgtape','/category/latest-drop','/category/pantsshorts','/inexistant-xyz','/PRODUCTS','/Product/CH_0006/','/?utm_source=x&fbclid=abc','/product/ch_0006/?utm_source=ig','/site-config.json','/sitemap.xml','/robots.txt','/assets/vg/','/assets/vg'].map(p => O + p);
const variants = ['http://www.vgthmind.org/','https://vgthmind.org/','http://vgthmind.org/','https://vgthmind-shop.pages.dev/','https://vgthmind-shop.pages.dev/product/ch_0006/','https://vgthmind.github.io/shop/','https://vgthmind.github.io/shop/product/ch_0006/'];
const all = [...new Set([...smUrls, ...extra, ...variants])];
const out = [];
async function hit(u) {
  const chain = []; let cur = u, r, body = '';
  for (let i = 0; i < 6; i++) {
    try { r = await fetch(cur, { redirect: 'manual' }); } catch (e) { chain.push('ERR ' + e.message); break; }
    chain.push(r.status);
    if ([301,302,307,308].includes(r.status)) { cur = new URL(r.headers.get('location'), cur).href; continue; }
    break;
  }
  const ct = r.headers?.get('content-type') || '';
  if (/html/.test(ct)) body = await r.text();
  const can = (body.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
  const rob = (body.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
  return { u: u.replace(O, '') || u, chain: chain.join('>'), final: cur === u ? '' : cur.replace(O, ''), can: can.replace(O, ''), rob, xrt: r.headers?.get('x-robots-tag') || '', ct: ct.split(';')[0] };
}
for (let i = 0; i < all.length; i += 8) out.push(...await Promise.all(all.slice(i, i + 8).map(hit)));
for (const o of out) console.log([o.u, o.chain, o.final, 'can=' + o.can, o.rob && 'rob=' + o.rob, o.xrt && 'xrt=' + o.xrt, o.ct].filter(Boolean).join(' | '));
