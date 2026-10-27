// Génère de vrais PDF de devis (FR/EN, court et long) avec de fausses données et les ouvre dans Edge/Chrome pour les voir.
import { register } from 'node:module';
register(new URL('./ts-hooks.mjs', import.meta.url));
const { quotePdf } = await import('../../checkout-worker/quote-pdf.ts');
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const out = path.resolve(process.argv[2] || 'devis-pdf-test'); fs.mkdirSync(out, { recursive: true });
const now = Date.now();
const base = { number: 'DEV-2026-007', version: 1, issuedAt: now, validUntil: now + 15 * 864e5, seller: { address: 'Vitry-sur-Seine, France' }, client: { name: 'Alex Démo', email: 'alex@example.invalid', country: 'FR' }, requestId: 'D-AAAAAA', title: 'Hoodie océan', total: 200, deposit: 60, depositPct: 30, optionalDeposit: false, delay: '3 semaines', message: 'Merci pour ta demande ! Voici le devis, dis-moi si tu veux changer quelque chose.', pageUrl: 'https://www.vgthmind.org/ma-demande/?id=D-AAAAAA&k=xxxxxxxxxxxxxxxx', test: true };
const many = Array.from({ length: 22 }, (_, i) => ({ label: 'Peinture aérographe, motif ' + (i + 1) + ' avec une désignation assez longue pour forcer le retour à la ligne dans la colonne', qty: 1 + (i % 3), unit: 40, amount: 40 * (1 + (i % 3)) }));
const cases = {
  fr: { ...base, lang: 'fr', lines: [{ label: 'Hoodie zippé', qty: 1, unit: 120, amount: 120 }, { label: 'Peinture aérographe', qty: 2, unit: 40, amount: 80 }] },
  en: { ...base, lang: 'en', lines: [{ label: 'Zip hoodie', qty: 1, unit: 120, amount: 120 }, { label: 'Airbrush painting', qty: 2, unit: 40, amount: 80 }] },
  long: { ...base, lang: 'fr', lines: many, total: many.reduce((a, l) => a + l.amount, 0), message: 'Un très long message. '.repeat(40), acceptedAt: now },
  y2027: { ...base, lang: 'fr', issuedAt: Date.UTC(2027, 1, 1), validUntil: Date.UTC(2027, 1, 16), lines: [{ label: 'Hoodie', qty: 1, unit: 200, amount: 200 }] },
};
const files = {};
for (const [k, v] of Object.entries(cases)) { const b = quotePdf(v); const f = path.join(out, k + '.pdf'); fs.writeFileSync(f, b); files[k] = f; console.log(k, b.length, 'octets'); }
const br = await chromium.launch({ channel: 'msedge', headless: false }).catch(() => chromium.launch({ channel: 'chrome', headless: false }));
for (const [k, f] of Object.entries(files)) {
  const p = await br.newPage({ viewport: { width: 900, height: 1200 } });
  await p.goto('file:///' + f.split(path.sep).join('/')).catch(() => {}); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(out, k + '.png') }); await p.close();
}
await br.close();
