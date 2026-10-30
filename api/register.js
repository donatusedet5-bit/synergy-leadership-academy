// Saves one Boot Camp registration as a private JSON file in Vercel Blob.
// One file per phone number, so the same person can't register twice.
import { put, head, BlobNotFoundError } from '@vercel/blob';

const PREFIX = 'bootcamp-2026/';
const SEXES = ['Male', 'Female'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function POST(request) {
  let d;
  try {
    d = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // Spam trap: real people never fill this hidden field.
  if (clean(d.website, 50)) return json({ ok: true, duplicate: false });

  const rec = {
    name: clean(d.name, 120),
    sex: clean(d.sex, 10),
    nationality: clean(d.nationality, 60),
    relationship: clean(d.relationship, 40),
    phone: clean(d.phone, 30),
    email: clean(d.email, 120).toLowerCase(),
    state: clean(d.state, 60),
    address: clean(d.address, 300),
  };

  const digits = rec.phone.replace(/\D/g, '');
  const errors = [];
  if (rec.name.split(' ').filter(Boolean).length < 2) errors.push('name');
  if (!SEXES.includes(rec.sex)) errors.push('sex');
  if (!rec.nationality) errors.push('nationality');
  if (!rec.relationship) errors.push('relationship');
  if (digits.length < 10 || digits.length > 15) errors.push('phone');
  if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rec.email)) errors.push('email');
  if (!rec.state) errors.push('state');
  if (rec.address.length < 4) errors.push('address');
  if (errors.length) return json({ ok: false, error: 'invalid', fields: errors }, 422);

  // Last 10 digits identify the number whether written 0803…, +234803… or 234803…
  const pathname = `${PREFIX}${digits.slice(-10)}.json`;

  try {
    await head(pathname);
    return json({ ok: true, duplicate: true });
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) {
      console.error('head failed', err);
      return json({ ok: false, error: 'save_failed' }, 500);
    }
  }

  try {
    await put(pathname, JSON.stringify({ ...rec, registeredAt: new Date().toISOString() }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
    });
    return json({ ok: true, duplicate: false });
  } catch (err) {
    if (/already exists/i.test(String(err && err.message))) return json({ ok: true, duplicate: true });
    console.error('put failed', err);
    return json({ ok: false, error: 'save_failed' }, 500);
  }
}

export function GET() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
