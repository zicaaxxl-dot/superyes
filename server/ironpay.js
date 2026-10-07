const fs = require('fs');
const path = require('path');
const { productInfo, mapStatus } = require('./pixzy');

const BASE = 'https://api.ironpayapp.com.br/api/public/v1';
const CATALOG_FILE = path.join(__dirname, 'ironpay-catalog.json');

function token() {
  return process.env.IRONPAY_TOKEN || 'txql47H4oSHv9rQpc7tRvYXFYGeuIxpIJslPPZ0ATbYU8OGyMumSfRGd0QvJ';
}

function loadCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  } catch {
    return { productHash: '', productTitle: 'SuperYes', offers: {} };
  }
}

let catalog = loadCatalog();

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

async function iron(pathname, { method = 'GET', body } = {}) {
  const key = token();
  if (!key) {
    const err = new Error('IRONPAY_TOKEN não configurado.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${BASE}${pathname}?api_token=${encodeURIComponent(key)}`, {
    method,
    headers: {
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

function fail(result, fallback) {
  const msg = result.data.message || result.data.error || result.data.errors || fallback;
  const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  err.status = result.status || 400;
  throw err;
}

function saveCatalog() {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

async function offerFor(product) {
  const info = productInfo(product);
  const current = catalog.offers && catalog.offers[product];
  if (current && current.hash && Number(current.amount) === Number(info.amount)) return current;
  if (!catalog.productHash) {
    const err = new Error('Produto IronPay não configurado.');
    err.status = 503;
    throw err;
  }
  const result = await iron(`/products/${encodeURIComponent(catalog.productHash)}/offers`, {
    method: 'POST',
    body: { title: info.name, price: info.amount, amount: info.amount },
  });
  if (!result.ok || result.data.success === false) fail(result, 'Falha ao criar oferta na IronPay.');
  const offer = result.data.data || result.data;
  if (!offer.hash) fail(result, 'IronPay não retornou a oferta.');
  catalog.offers = catalog.offers || {};
  catalog.offers[product] = { hash: offer.hash, amount: info.amount, title: info.name };
  try { saveCatalog(); } catch (err) { console.error('[ironpay] catalog', err.message); }
  return catalog.offers[product];
}

function qrFrom(tx) {
  const pix = tx && tx.pix;
  if (!pix) return tx && (tx.pix_qr_code || tx.qr_code || tx.br_code);
  return pix.pix_qr_code || pix.pix_url || pix.qr_code || pix.br_code;
}

async function createCharge({ product, customer, tracking, webhookUrl }) {
  const info = productInfo(product);
  const offer = await offerFor(product);
  const phone = digits(customer.phone).slice(-11) || '11999999999';
  const payload = {
    amount: info.amount,
    offer_hash: offer.hash,
    payment_method: 'pix',
    customer: {
      name: customer.name,
      email: customer.email,
      phone_number: phone,
      document: digits(customer.document),
    },
    cart: [{
      product_hash: catalog.productHash,
      title: info.name,
      cover: null,
      price: info.amount,
      quantity: 1,
      operation_type: 1,
      tangible: false,
    }],
    installments: 1,
    expire_in_days: 1,
    transaction_origin: 'api',
    tracking: {
      src: (tracking && tracking.src) || '',
      utm_source: (tracking && tracking.utm_source) || '',
      utm_medium: (tracking && tracking.utm_medium) || '',
      utm_campaign: (tracking && tracking.utm_campaign) || '',
      utm_term: (tracking && tracking.utm_term) || '',
      utm_content: (tracking && tracking.utm_content) || '',
    },
    postback_url: webhookUrl,
  };
  const result = await iron('/transactions', { method: 'POST', body: payload });
  if (!result.ok || result.data.success === false) fail(result, 'Falha ao gerar o PIX na IronPay.');
  const tx = result.data.data || result.data;
  const qrCode = qrFrom(tx);
  if (!qrCode) {
    const err = new Error('IronPay não retornou o código PIX.');
    err.status = 502;
    throw err;
  }
  const hash = String(tx.hash || tx.transaction_hash || tx.id);
  return {
    transactionId: hash,
    reference: hash,
    qrCode,
    amount: tx.amount || info.amount,
    status: mapStatus(tx.payment_status || tx.status),
    product,
    productName: info.name,
    gateway: 'ironpay',
  };
}

async function getCharge({ id }) {
  const result = await iron(`/transactions/${encodeURIComponent(id)}`);
  if (!result.ok || result.data.success === false) fail(result, 'Transação não encontrada na IronPay.');
  const tx = result.data.data || result.data;
  if (!tx || !(tx.hash || tx.id)) {
    const err = new Error('Transação não encontrada na IronPay.');
    err.status = 404;
    throw err;
  }
  return {
    transactionId: String(tx.hash || tx.id || id),
    reference: String(tx.hash || ''),
    qrCode: qrFrom(tx),
    amount: tx.amount,
    status: mapStatus(tx.payment_status || tx.status),
    gateway: 'ironpay',
    rawStatus: tx.payment_status || tx.status,
  };
}

module.exports = { createCharge, getCharge, token };
