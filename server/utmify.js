const { productInfo } = require('./pixzy');

const ENDPOINT = 'https://api.utmify.com.br/api-credentials/orders';

function apiToken() {
  const fromEnv = String(process.env.UTMIFY_API_TOKEN || '').trim();
  if (fromEnv.length >= 8) return fromEnv;
  return 'owjrxE4nFrR1nYxfbMBb3GgQS9jlr9Uk9jSZ';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function utcStamp(value) {
  const date = value ? new Date(value) : new Date();
  const d = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function textOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function utmStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s.endsWith('.paid')) return 'paid';
  if (s === 'refunded' || s.includes('refund')) return 'refunded';
  if (s === 'chargeback' || s === 'chargedback' || s.includes('chargeback')) return 'chargedback';
  if (s === 'failed' || s === 'expired' || s === 'canceled' || s === 'cancelled' || s === 'refused' || s.endsWith('.expired') || s.endsWith('.failed')) return 'refused';
  return 'waiting_payment';
}

function trackingFrom(lead, pix) {
  const saved = (pix && pix.tracking) || {};
  return {
    src: textOrNull(saved.src),
    sck: textOrNull(saved.sck || (lead && lead.sck)),
    utm_source: textOrNull(saved.utm_source || (lead && lead.utmSource)),
    utm_campaign: textOrNull(saved.utm_campaign || (lead && lead.utmCampaign)),
    utm_medium: textOrNull(saved.utm_medium || (lead && lead.utmMedium)),
    utm_content: textOrNull(saved.utm_content || (lead && lead.utmContent)),
    utm_term: textOrNull(saved.utm_term || (lead && lead.utmTerm)),
  };
}

async function sendOrder({ orderId, status, createdAt, approvedAt, refundedAt, customer, product, amount, tracking, ip, isTest }) {
  const info = productInfo(product);
  const cents = Number(amount) || info.amount;
  const st = utmStatus(status);
  const payload = {
    orderId: String(orderId),
    platform: 'SuperYes',
    paymentMethod: 'pix',
    status: st,
    createdAt: utcStamp(createdAt),
    approvedDate: st === 'paid' || st === 'refunded' || st === 'chargedback' ? utcStamp(approvedAt || new Date()) : null,
    refundedAt: st === 'refunded' || st === 'chargedback' ? utcStamp(refundedAt || approvedAt || new Date()) : null,
    customer: {
      name: String((customer && customer.name) || 'Cliente').slice(0, 120),
      email: String((customer && customer.email) || '').slice(0, 160),
      phone: textOrNull(customer && String(customer.phone || '').replace(/\D/g, '')),
      document: textOrNull(customer && String(customer.document || '').replace(/\D/g, '')),
      country: 'BR',
      ip: textOrNull(ip),
    },
    products: [{
      id: String(product || 'final-seguro'),
      name: info.name,
      planId: null,
      planName: null,
      quantity: 1,
      priceInCents: cents,
    }],
    trackingParameters: tracking || {
      src: null,
      sck: null,
      utm_source: null,
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null,
    },
    commission: {
      totalPriceInCents: cents,
      gatewayFeeInCents: 0,
      userCommissionInCents: cents,
    },
  };
  if (!payload.customer.email) {
    const err = new Error('Utmify exige e-mail do cliente.');
    err.status = 400;
    throw err;
  }
  if (isTest) payload.isTest = true;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-token': apiToken(),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data.message || data.error || data.errors || 'Falha ao enviar pedido para a Utmify.';
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return { ok: true, status: st, data };
}

module.exports = { apiToken, utmStatus, trackingFrom, sendOrder };
