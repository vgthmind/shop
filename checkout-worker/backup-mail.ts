// Copie de la sauvegarde de nuit par mail (hors Cloudflare) : un seul fichier JSON joint, envoyé à contact@.
// Contient le stock, l'état des commandes (suivi, numéros VG-…) et les demandes sur mesure (avec noms et e-mails des demandeurs).
import { toBase64 } from './quote-pdf';

export type BackupParts = { stock?: unknown; orders?: unknown; requests?: unknown };

export function buildBackupMail(date: string, parts: BackupParts) {
  const missing = (['stock', 'orders', 'requests'] as const).filter((k) => parts[k] == null);
  const json = JSON.stringify({ date, ...parts }, null, 1);
  const bytes = new TextEncoder().encode(json);
  const note = missing.length ? `Parties absentes : ${missing.join(', ')}.` : 'Stock, commandes et demandes : complet.';
  const text = `Sauvegarde automatique vgthmind du ${date}.\n${note}\n\nGarde ce mail : le fichier joint permet de tout restaurer (Admin > Réglages > Sauvegardes). Il contient des données de clients : ne le transfère à personne.`;
  const html = '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">' + text.split('\n\n').map((p) => '<p>' + p.replace(/[<>&]/g, '').replace(/\n/g, '<br>') + '</p>').join('') + '</div>';
  return { subject: `[vgthmind] Sauvegarde du ${date}`, html, text, attachments: [{ filename: `vgthmind-sauvegarde-${date}.json`, content: toBase64(bytes) }], missing, size: bytes.length };
}
