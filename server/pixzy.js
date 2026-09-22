const PRODUCTS = {
  'final-seguro': { amount: 4863, name: 'Seguro Prestamista' },
  'ups-up1': { amount: 2490, name: 'IOF' },
  'ups-up2': { amount: 2193, name: 'Oferta UP2' },
  'ups-up3': { amount: 2850, name: 'Oferta UP3' },
  'ups-up4': { amount: 3993, name: 'Oferta UP4' },
  'ups-up5': { amount: 1825, name: 'Validação bancária' },
  'backof-1': { amount: 3404, name: 'Downsell seguro 1' },
  'backof-2': { amount: 2263, name: 'Downsell seguro 2' },
  'backof-3': { amount: 1463, name: 'Downsell seguro 3' },
  'upsell-erro_pagamento': { amount: 1490, name: 'Verificação de segurança' },
  'upsell-icms': { amount: 2250, name: 'ICMS' },
  'upsell-pis_cofins': { amount: 1199, name: 'PIS/Cofins' },
  'backup-erro_pagamento': { amount: 1043, name: 'Backup verificação' },
  'backup-icms': { amount: 1575, name: 'Backup ICMS' },
  'backup-pis_cofins': { amount: 839, name: 'Backup PIS/Cofins' },
  'backup-up1': { amount: 1743, name: 'Backup UP1' },
  'backup-up2': { amount: 1535, name: 'Backup UP2' },
  'backup-up3': { amount: 1995, name: 'Backup UP3' },
  'backup-up4': { amount: 2795, name: 'Backup UP4' },
  'backup-up5': { amount: 1278, name: 'Backup UP5' },
};

const PIXZY_BASE = 'https://app.pixzypay.com/api';

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'approved') return 'approved';
  if (s === 'expired' || s === 'failed' || s === 'cancelled') return 'failed';
  return 'pending';
}

function productInfo(code) {
  return PRODUCTS[code] || PRODUCTS['final-seguro'];
}

async function pixzy(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${PIXZY_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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

async function createCharge({ token, product, customer, tracking, webhookUrl, ip }) {
  const info = productInfo(product);
  const payload = {
    amount: info.amount,
    client_name: customer.name,
    client_email: customer.email,
    client_doc: String(customer.document || '').replace(/\D/g, ''),
    client_phone: customer.phone || '',
    webhook_url: webhookUrl,
    ip,
    metadata: {
      product,
      product_name: info.name,
    },
    utms: tracking || {},
    items: [{ name: info.name, price: info.amount, quantity: 1 }],
  };
  const result = await pixzy('/transactions', { method: 'POST', body: payload, token });
  if (!result.ok) {
    const msg = result.data.errors || result.data.error || 'Falha ao gerar o PIX na Pixzy.';
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = result.status;
    throw err;
  }
  const tx = result.data.data || result.data;
  return {
    transactionId: tx.transaction_id || tx.id,
    qrCode: tx.br_code || tx.qr_code || tx.brCode,
    amount: tx.amount || info.amount,
    status: mapStatus(tx.status),
    product,
    productName: info.name,
    gateway: 'pixzy',
  };
}

async function getCharge({ token, id }) {
  const result = await pixzy(`/transactions/${encodeURIComponent(id)}`, { token });
  if (!result.ok) {
    const err = new Error(result.data.error || 'Transação não encontrada');
    err.status = result.status;
    throw err;
  }
  const tx = result.data.data || result.data;
  return {
    transactionId: tx.id || tx.transaction_id || id,
    qrCode: tx.br_code || tx.qr_code,
    amount: tx.amount,
    status: mapStatus(tx.status),
    gateway: 'pixzy',
    rawStatus: tx.status,
  };
}

module.exports = { PRODUCTS, productInfo, mapStatus, createCharge, getCharge };
