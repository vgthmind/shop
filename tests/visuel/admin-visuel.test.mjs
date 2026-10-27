// Contrôle visuel de l'admin (débordements, zones tactiles 44 px, bouton « ← Retour », menu du bas) en largeur iPhone 390 px et PC 1440 px.
// Lancé à part : npm run test:visuel (Edge ou Chrome installé requis ; sinon le test est ignoré). Fausses données, aucun appel réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit, launch } from './audit.mjs';

const b = await launch();
if (b) await b.close();

test('admin : aucun débordement, zone tactile ≥ 44 px, « ← Retour » sur facture / avoir / bon, menu du bas dégagé (iPhone et PC)', { skip: b ? false : 'aucun navigateur Edge/Chrome', timeout: 280000 }, async () => {
  const problems = await runAudit(null);
  assert.deepEqual(problems, [], String.fromCharCode(10) + problems.join(String.fromCharCode(10)));
});

test('admin : suivi de colis (Enregistrer, Actualiser, pastilles Livrée / Problème) et visionneuse photo / vidéo / PDF avec « ← Retour » (iPhone et PC)', { skip: b ? false : 'aucun navigateur Edge/Chrome', timeout: 120000 }, async () => {
  const { runParcours } = await import('./parcours.mjs');
  const problems = await runParcours();
  assert.deepEqual(problems, [], String.fromCharCode(10) + problems.join(String.fromCharCode(10)));
});

test('fiches pièces : aucune erreur JavaScript (body.html), pas de cadre Instagram, lien Instagram bien affiché (iPhone et PC)', { skip: b ? false : 'aucun navigateur Edge/Chrome', timeout: 280000 }, async () => {
  const { runFiches } = await import('./fiches.mjs');
  const problems = await runFiches();
  assert.deepEqual(problems, [], String.fromCharCode(10) + problems.join(String.fromCharCode(10)));
});
