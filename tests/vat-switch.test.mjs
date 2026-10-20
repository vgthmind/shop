import test from 'node:test';
import assert from 'node:assert/strict';
import { vatMention } from '../checkout-worker/invoice.ts';

test('mention de TVA : 293 B jusqu\'au 31/12/2026, CIBS à partir du 01/01/2027, texte modifiable', () => {
  assert.equal(vatMention(Date.UTC(2026, 11, 31, 22, 59, 0)), 'TVA non applicable, art. 293 B du CGI');
  assert.equal(vatMention(Date.UTC(2026, 9, 20)), 'TVA non applicable, art. 293 B du CGI');
  assert.equal(vatMention(Date.UTC(2026, 11, 31, 23, 0, 0)), 'TVA non applicable, art. L. 233-3 du CIBS');
  assert.equal(vatMention(Date.UTC(2027, 5, 1)), 'TVA non applicable, art. L. 233-3 du CIBS');
  assert.equal(vatMention(Date.UTC(2027, 5, 1), ' Texte du décret '), 'Texte du décret');
  assert.equal(vatMention(Date.UTC(2026, 5, 1), 'Texte du décret'), 'TVA non applicable, art. 293 B du CGI');
});
