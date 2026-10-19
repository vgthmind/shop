// Préparation du jour J (outils/preparer-bascule.mjs) : mêmes changements à l'aller et au retour, rien d'autre ne bouge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { transform } = await import('../outils/preparer-bascule.mjs');

const settings = readFileSync(new URL('../data/shop-settings.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const toml = readFileSync(new URL('../checkout-worker/wrangler.toml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SITE = 'https://www.vgthmind.org';

test('aller : site public, adresse définitive, SITE_BASE ; LIVE_MODE seulement avec --live', () => {
  const a = transform({ settings, toml }, { site: SITE });
  const s = JSON.parse(a.settings);
  assert.equal(s.public, true); assert.equal(s.site_url, SITE);
  assert.match(a.toml, /^SITE_BASE = "https:\/\/www\.vgthmind\.org"/m);
  assert.match(a.toml, /^LIVE_MODE = "0"/m, 'LIVE_MODE ne change pas sans --live');
  assert.match(transform({ settings, toml }, { site: SITE, live: true }).toml, /^LIVE_MODE = "1"/m);
  assert.equal(s.cf_analytics_token, JSON.parse(settings).cf_analytics_token, 'les autres réglages ne bougent pas');
});

test('retour : remet exactement les valeurs de test (public false, pages.dev, LIVE_MODE 0)', () => {
  const go = transform({ settings, toml }, { site: SITE, live: true });
  const back = transform({ settings: go.settings, toml: go.toml }, { site: SITE, retour: true });
  assert.equal(JSON.parse(back.settings).public, false);
  assert.equal(JSON.parse(back.settings).site_url, 'https://vgthmind-shop.pages.dev');
  assert.equal(back.toml, toml, 'le fichier du Worker est identique à l\'original');
});

test('refus : adresse mal écrite, ou origine absente de ALLOWED_ORIGIN', () => {
  assert.throws(() => transform({ settings, toml }, { site: 'www.vgthmind.org' }), /--site/);
  assert.throws(() => transform({ settings, toml }, { site: 'https://autre.example.org' }), /ALLOWED_ORIGIN/);
});

test('--live-seul : seul LIVE_MODE change (essai à 1 € sur le site encore en test)', () => {
  const a = transform({ settings, toml }, { site: SITE, liveSeul: true });
  assert.equal(a.settings, settings);
  assert.match(a.toml, /^LIVE_MODE = "1"/m);
  assert.match(a.toml, /^SITE_BASE = "https:\/\/vgthmind-shop\.pages\.dev"/m);
  assert.equal(transform({ settings: a.settings, toml: a.toml }, { site: SITE, retour: true }).toml, toml);
});
