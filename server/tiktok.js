const crypto = require('crypto');

const PIXEL_CURRENT = 'D3RAQLJC77UCJBA5FPT0';
const TOKEN_CURRENT = 'cf2691f91d4761935cb773fdc53cae1f4c3daee8';
const STALE_PIXELS = new Set(['DAVF57JC77U8O3I51CC0', 'D38L3JBC77U1BQU6QEE0']);
const STALE_TOKENS = new Set(['b7344a2e0055bc589983167b7923cfba98426bda']);
const PIXEL_ID = !process.env.TIKTOK_PIXEL_ID || STALE_PIXELS.has(process.env.TIKTOK_PIXEL_ID)
  ? PIXEL_CURRENT
  : process.env.TIKTOK_PIXEL_ID;
const ACCESS_TOKEN = !process.env.TIKTOK_ACCESS_TOKEN || STALE_TOKENS.has(process.env.TIKTOK_ACCESS_TOKEN)
  ? TOKEN_CURRENT
  : process.env.TIKTOK_ACCESS_TOKEN;
const API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

let pixelSource = () => (PIXEL_ID && ACCESS_TOKEN ? [{ pixelId: PIXEL_ID, accessToken: ACCESS_TOKEN }] : []);

function setPixelSource(fn) {
  pixelSource = typeof fn === 'function' ? fn : pixelSource;
}

function activePixels() {
  const list = pixelSource();
  return Array.isArray(list) ? list.filter((p) => p && p.pixelId && p.accessToken) : [];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function alreadyHashed(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function hashEmail(email) {
  if (!email) return undefined;
  return alreadyHashed(email) ? String(email).toLowerCase() : sha256(String(email).trim().toLowerCase());
}

function hashPhone(phone) {
  if (!phone) return undefined;
  if (alreadyHashed(phone)) return String(phone).toLowerCase();
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  const e164 = '+' + (digits.startsWith('55') ? digits : '55' + digits);
  return sha256(e164);
}

function hashExternalId(id) {
  if (!id) return undefined;
  return alreadyHashed(id) ? String(id).toLowerCase() : sha256(String(id).replace(/\D/g, ''));
}

function brlValue(amountCents) {
  const n = Number(amountCents);
  if (!Number.isFinite(n) || n <= 0) return 48.63;
  return Math.round(n) / 100;
}

async function sendEvent({ event, eventId, value, email, phone, externalId, ip, userAgent, ttclid, ttp, url, contentId }) {
  const pixels = activePixels();
  if (!pixels.length) return;
  const user = {};
  const hashedEmail = hashEmail(email);
  const hashedPhone = hashPhone(phone);
  const hashedId = hashExternalId(externalId);
  if (hashedEmail) user.email = hashedEmail;
  if (hashedPhone) user.phone = hashedPhone;
  if (hashedId) user.external_id = hashedId;
  if (ip) user.ip = ip;
  if (userAgent) user.user_agent = userAgent;
  if (ttclid) user.ttclid = ttclid;
  if (ttp) user.ttp = ttp;

  const eventBody = {
    event,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(eventId || `${event}_${Date.now()}`),
    user,
    properties: {
      currency: 'BRL',
      value: Number(value) || 0,
      content_id: contentId || event,
      content_type: 'product',
    },
    page: url ? { url } : undefined,
  };

  const results = [];
  for (const pixel of pixels) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'Access-Token': pixel.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: pixel.pixelId,
          data: [eventBody],
        }),
      });
      const text = await res.text();
      if (!res.ok) console.error('[tiktok]', pixel.pixelId, res.status, text.slice(0, 300));
      results.push({ ok: res.ok, status: res.status, body: text.slice(0, 400), pixelId: pixel.pixelId });
    } catch (err) {
      console.error('[tiktok]', pixel.pixelId, err.message);
      results.push({ ok: false, status: 0, body: err.message, pixelId: pixel.pixelId });
    }
  }
  return results[0];
}

function trackInitiateCheckout(opts) {
  return sendEvent({
    event: 'InitiateCheckout',
    eventId: opts.eventId,
    value: brlValue(opts.amount),
    contentId: opts.product || 'final-seguro',
    email: opts.email,
    phone: opts.phone,
    externalId: opts.cpf,
    ip: opts.ip,
    userAgent: opts.userAgent,
    ttclid: opts.ttclid,
    ttp: opts.ttp,
    url: opts.url,
  });
}

function trackCompletePayment(opts) {
  return sendEvent({
    event: 'CompletePayment',
    eventId: opts.eventId,
    value: brlValue(opts.amount),
    contentId: 'paid',
    email: opts.email,
    phone: opts.phone,
    externalId: opts.cpf,
    ip: opts.ip,
    userAgent: opts.userAgent,
    ttclid: opts.ttclid,
    ttp: opts.ttp,
    url: opts.url,
  });
}

module.exports = {
  PIXEL_ID,
  fallbackPixel: () => ({ pixelId: PIXEL_ID, accessToken: ACCESS_TOKEN }),
  setPixelSource,
  sendEvent,
  trackInitiateCheckout,
  trackCompletePayment,
};
