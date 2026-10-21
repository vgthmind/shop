// Copie de la sauvegarde par mail : contenu du fichier joint, parties absentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(spec, ctx, next) { if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`));
const { buildBackupMail } = await import('../checkout-worker/backup-mail.ts');

test('mail de sauvegarde : pièce jointe = JSON décodable avec les 3 parties', () => {
  const parts = { stock: { date: '2026-10-21', stock: { a: 1 } }, orders: { shipped: { cs_live_x: { at: 1 } } }, requests: { requests: [{ id: 'D-1', name: 'Éloïse' }] } };
  const m = buildBackupMail('2026-10-21', parts);
  assert.equal(m.subject, '[vgthmind] Sauvegarde du 2026-10-21');
  assert.equal(m.attachments[0].filename, 'vgthmind-sauvegarde-2026-10-21.json');
  const back = JSON.parse(Buffer.from(m.attachments[0].content, 'base64').toString('utf8'));
  assert.deepEqual(back.requests, parts.requests); assert.deepEqual(back.stock, parts.stock); assert.equal(back.date, '2026-10-21');
  assert.deepEqual(m.missing, []); assert.match(m.text, /complet/);
});

test('mail de sauvegarde : parties absentes signalées', () => {
  const m = buildBackupMail('2026-10-21', { stock: { x: 1 } });
  assert.deepEqual(m.missing, ['orders', 'requests']); assert.match(m.text, /absentes : orders, requests/);
});
