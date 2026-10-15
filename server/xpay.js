const { productInfo, mapStatus } = require('./pixzy');

const BASE = 'https://api.xpaybrasil.com/v1';

function apiKey() {
  const fromEnv = String(process.env.XPAY_API_KEY || '').trim();
  if (fromEnv.startsWith('cpk_')) return fromEnv;
  return 'cpk_live_kw2ijq14m5ywyfgby0olg6w9';
}

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

function pixCode(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.brCode || value.code || value.emv || value.payload || value.qr_code || '';
  }
  return '';
}

async function xpay(path, { method = 'GET', body } = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error('XPAY_API_KEY não configurado.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-API-KEY': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  return { ok: res.ok, status: res.status, data };
}

function errorMessage(data, fallback) {
  const msg = data && (data.message || data.error || data.errors);
  if (!msg) return fallback;
  return typeof msg === 'string' ? msg : JSON.stringify(msg);
}

let webhookReady = null;

async function ensureWebhook(webhookUrl) {
  if (!webhookUrl || !webhookUrl.startsWith('https://')) return;
  if (webhookReady) return webhookReady;
  webhookReady = (async () => {
    const listed = await xpay('/webhook');
    const rows = Array.isArray(listed.data) ? listed.data : (listed.data && (listed.data.data || listed.data.webhooks)) || [];
    const list = Array.isArray(rows) ? rows : [];
    if (list.some((row) => row && row.url === webhookUrl)) return;
    const created = await xpay('/webhook', {
      method: 'POST',
      body: {
        url: webhookUrl,
        name: 'SuperYes PIX',
        events: ['charge.pending', 'charge.processing', 'charge.paid', 'charge.expired'],
      },
    });
    if (!created.ok) {
      webhookReady = null;
      console.error('[xpay] webhook', errorMessage(created.data, 'falha ao registrar'));
    }
  })().catch((err) => {
    webhookReady = null;
    console.error('[xpay] webhook', err.message);
  });
  return webhookReady;
}

async function createCharge({ product, customer, webhookUrl }) {
  const info = productInfo(product);
  if (info.amount < 500) {
    const err = new Error('XPay exige valor mínimo de R$ 5,00.');
    err.status = 400;
    throw err;
  }
  const reference = `sy-${product}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const phone = digits(customer && customer.phone).slice(-11) || digits(customer && customer.document).slice(-11);
  const payload = {
    amount: info.amount,
    expiresIn: 3600,
    externalId: reference,
  };
  const taxId = digits(customer && customer.document);
  if (customer && customer.name && customer.email && taxId && phone) {
    payload.customer = {
      taxId,
      name: String(customer.name).slice(0, 120),
      email: String(customer.email).slice(0, 160),
      phone,
    };
  }
  const result = await xpay('/charge/pix', { method: 'POST', body: payload });
  if (!result.ok) {
    const err = new Error(errorMessage(result.data, 'Falha ao gerar o PIX na XPay.'));
    err.status = result.status || 400;
    throw err;
  }
  const tx = result.data.data || result.data;
  const qrCode = pixCode(tx.brCode) || pixCode(tx.br_code) || pixCode(tx.qrCode);
  if (!qrCode) {
    const err = new Error('XPay não retornou o código PIX.');
    err.status = 502;
    throw err;
  }
  ensureWebhook(webhookUrl);
  return {
    transactionId: String(tx.id || reference),
    reference: tx.externalId || reference,
    qrCode,
    amount: tx.amount || info.amount,
    status: mapStatus(tx.paymentStatus || tx.status),
    product,
    productName: info.name,
    gateway: 'xpay',
    expiresAt: tx.expiresAt,
  };
}

async function getCharge({ id }) {
  const result = await xpay(`/charge/${encodeURIComponent(id)}`);
  if (!result.ok) {
    const err = new Error(errorMessage(result.data, 'Transação não encontrada na XPay.'));
    err.status = result.status || 404;
    throw err;
  }
  const tx = (result.data && result.data.data) || result.data;
  if (!tx || !tx.id) {
    const err = new Error('Transação não encontrada na XPay.');
    err.status = 404;
    throw err;
  }
  return {
    transactionId: String(tx.id || id),
    reference: tx.externalId || '',
    qrCode: pixCode(tx.brCode) || pixCode(tx.br_code),
    amount: tx.total || tx.amount,
    status: mapStatus(tx.paymentStatus || tx.status),
    gateway: 'xpay',
    rawStatus: tx.paymentStatus || tx.status,
  };
}

module.exports = { createCharge, getCharge, apiKey };
