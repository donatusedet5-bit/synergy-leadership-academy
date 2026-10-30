// Returns all Boot Camp registrations to the admin page, after checking the admin password.
import { list, get, del } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

const PREFIX = 'bootcamp-2026/';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

async function readOne(pathname) {
  const res = await get(pathname, { access: 'private' });
  if (!res || res.statusCode !== 200) return null;
  try {
    const rec = JSON.parse(await new Response(res.stream).text());
    rec.id = pathname.slice(PREFIX.length).replace(/\.json$/, '');
    return rec;
  } catch {
    return null;
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  if (!passwordOk(body.password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ ok: false, error: 'wrong_password' }, 401);
  }

  if (body.action === 'delete') {
    const id = String(body.id || '');
    if (!/^\d{10}$/.test(id)) return json({ ok: false, error: 'bad_id' }, 400);
    await del(`${PREFIX}${id}.json`);
    return json({ ok: true, deleted: id });
  }

  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const rows = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const batch = await Promise.all(blobs.slice(i, i + 25).map((b) => readOne(b.pathname)));
    rows.push(...batch.filter(Boolean));
  }
  rows.sort((x, y) => String(x.registeredAt).localeCompare(String(y.registeredAt)));

  return json({ ok: true, count: rows.length, rows });
}

export function GET() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
