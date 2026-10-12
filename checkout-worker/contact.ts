// Formulaire de contact : validation, anti-spam (champ piege, delai minimum,
// limite d'envois par IP et par jour) puis envoi via Resend vers contact@vgthmind.org
// avec l'adresse du client en « Répondre à ».
export const CONTACT_TO = 'contact@vgthmind.org';
const MAX = { name: 100, email: 200, subject: 150, message: 3000 };
const PER_IP_PER_HOUR = 3;
const PER_DAY = 60;

const clean = (v: unknown, n: number) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export interface ContactDeps {
  kv: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> };
  send: (from: string, to: string, subject: string, html: string, text: string, replyTo: string) => Promise<boolean>;
  from: string;
  ip: string;
  now?: number;
}

export async function handleContact(body: any, d: ContactDeps): Promise<{ status: number; data: any }> {
  if (!body || typeof body !== 'object') return { status: 400, data: { error: 'invalid' } };
  // Champ piege rempli ou formulaire envoye en moins de 3 s : un robot. On répond « ok » sans rien envoyer.
  if (clean(body.website, 50) || (Number.isFinite(Number(body.t)) && Number(body.t) < 3000)) return { status: 200, data: { ok: true } };

  const name = clean(body.name, MAX.name), email = clean(body.email, MAX.email), subject = clean(body.subject, MAX.subject);
  const message = String(body.message == null ? '' : body.message).replace(/\r\n/g, '\n').trim().slice(0, MAX.message);
  const fields: string[] = [];
  if (!name) fields.push('name');
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(email)) fields.push('email');
  if (!subject) fields.push('subject');
  if (message.length < 5) fields.push('message');
  if (fields.length) return { status: 400, data: { error: 'invalid', fields } };

  const now = d.now ?? Date.now();
  const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
  const kIp = `rl:contact:${d.ip}:${hour}`, kDay = `rl:contact:day:${day}`;
  const [nIp, nDay] = [Number(await d.kv.get(kIp)) || 0, Number(await d.kv.get(kDay)) || 0];
  if (nIp >= PER_IP_PER_HOUR || nDay >= PER_DAY) return { status: 429, data: { error: 'rate_limited' } };
  await d.kv.put(kIp, String(nIp + 1), { expirationTtl: 3700 });
  await d.kv.put(kDay, String(nDay + 1), { expirationTtl: 90000 });

  const text = `De : ${name} <${email}>\nSujet : ${subject}\n\n${message}\n`;
  const html = `<p><b>De :</b> ${esc(name)} &lt;${esc(email)}&gt;<br><b>Sujet :</b> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`;
  const ok = await d.send(d.from, CONTACT_TO, `[Site] ${subject}`, html, text, email);
  return ok ? { status: 200, data: { ok: true } } : { status: 502, data: { error: 'send_failed' } };
}
