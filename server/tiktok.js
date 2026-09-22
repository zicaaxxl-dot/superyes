const crypto = require('crypto');

const PIXEL_ID = process.env.TIKTOK_PIXEL_ID || 'D8CONQRC77UAEKHUHJNG';
const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

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
  if (!ACCESS_TOKEN || !PIXEL_ID) return;
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

  const payload = {
    event_source: 'web',
    event_source_id: PIXEL_ID,
    data: [{
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
    }],
  };

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[tiktok]', res.status, text.slice(0, 300));
    }
  } catch (err) {
    console.error('[tiktok]', err.message);
  }
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
  trackInitiateCheckout,
  trackCompletePayment,
};
