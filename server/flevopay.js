const { productInfo, mapStatus } = require('./pixzy');

const BASE = 'https://app.flevopay.com.br/api/v1';

function secret() {
  return process.env.FLEVOPAY_SECRET || 'flevopay_sk_ae9a299e6552ef2a2b0c7fc840e3fe1d400975d6b3fcf01f8ad5696735925823';
}

function storeId() {
  return process.env.FLEVOPAY_STORE_ID || '11099';
}

async function flevo(path, { method = 'GET', body } = {}) {
  const key = secret();
  if (!key) {
    const err = new Error('FLEVOPAY_SECRET não configurado.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-API-Key': key,
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

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

async function createCharge({ product, customer, tracking, webhookUrl }) {
  const info = productInfo(product);
  const reference = `sy-${product}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const payload = {
    amount: info.amount,
    description: info.name,
    reference,
    postback_url: webhookUrl,
    source: 'api_externa',
    store_id: Number(storeId()) || storeId(),
    customer: {
      name: customer.name,
      email: customer.email,
      document: digits(customer.document),
      phone: digits(customer.phone).slice(-11) || digits(customer.document).slice(-11),
    },
    tracking: {
      utm_source: (tracking && tracking.utm_source) || '',
      utm_medium: (tracking && tracking.utm_medium) || '',
      utm_campaign: (tracking && tracking.utm_campaign) || '',
      utm_content: (tracking && tracking.utm_content) || '',
      utm_term: (tracking && tracking.utm_term) || '',
      src: (tracking && tracking.src) || '',
      sck: (tracking && tracking.sck) || '',
    },
  };
  const result = await flevo('/transaction', { method: 'POST', body: payload });
  if (!result.ok || result.data.status === 'error' || result.data.success === false) {
    const msg = result.data.message || result.data.error || result.data.errors || 'Falha ao gerar o PIX na Flevopay.';
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = result.status || 400;
    throw err;
  }
  const tx = result.data.data || result.data;
  const qrCode = tx.qr_code || tx.pix_code || tx.copy_paste || tx.br_code;
  if (!qrCode) {
    const err = new Error('Flevopay não retornou o código PIX.');
    err.status = 502;
    throw err;
  }
  return {
    transactionId: String(tx.transaction_id || tx.id || reference),
    reference,
    qrCode,
    amount: tx.amount || info.amount,
    status: 'pending',
    product,
    productName: info.name,
    gateway: 'flevopay',
    expiresAt: tx.expires_at,
  };
}

async function getCharge({ id, reference }) {
  let result = await flevo(`/query?action=get_transaction&id=${encodeURIComponent(id)}`);
  if (!result.ok && reference) {
    result = await flevo(`/query?action=list_transactions&external_id=${encodeURIComponent(reference)}`);
  }
  if (!result.ok) {
    result = await flevo(`/query?action=list_transactions&external_id=${encodeURIComponent(id)}`);
  }
  if (!result.ok) {
    const err = new Error(result.data.message || result.data.error || 'Transação não encontrada na Flevopay.');
    err.status = result.status;
    throw err;
  }
  const tx = Array.isArray(result.data) ? result.data[0] : (result.data.data || result.data);
  if (!tx || result.data.status === 'error') {
    const err = new Error('Transação não encontrada na Flevopay.');
    err.status = 404;
    throw err;
  }
  const attempt = Array.isArray(tx.attempts_data) ? tx.attempts_data[0] : null;
  return {
    transactionId: String(tx.transaction_id || tx.id || id),
    reference: tx.external_id || tx.store_reference || reference || '',
    qrCode: tx.qr_code || tx.pix_code || (attempt && (attempt.qr_code || attempt.pix_code)),
    amount: tx.amount,
    status: mapStatus(tx.status),
    gateway: 'flevopay',
    rawStatus: tx.status,
  };
}

module.exports = { createCharge, getCharge, secret };
