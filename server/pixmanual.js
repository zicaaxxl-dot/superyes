const { productInfo } = require('./pixzy');

const PIX_KEY = 'a24cf79a-952c-437a-b35f-1b14c47a746e';

function pixKey() {
  const fromEnv = String(process.env.PIXMANUAL_KEY || '').trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(fromEnv)) return fromEnv;
  return PIX_KEY;
}

function tlv(id, value) {
  const text = String(value);
  return id + String(text.length).padStart(2, '0') + text;
}

function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function amountText(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error('Valor do PIX inválido.');
    err.status = 400;
    throw err;
  }
  return (value / 100).toFixed(2);
}

function txid() {
  return ('SY' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 25);
}

function buildBrCode({ key, cents, reference }) {
  const merchant = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const body = [
    tlv('00', '01'),
    tlv('01', '11'),
    tlv('26', merchant),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', amountText(cents)),
    tlv('58', 'BR'),
    tlv('59', 'SUPERYES'),
    tlv('60', 'SAO PAULO'),
    tlv('62', tlv('05', reference)),
    '6304',
  ].join('');
  return body + crc16(body);
}

async function createCharge({ product }) {
  const info = productInfo(product);
  const reference = txid();
  const key = pixKey();
  const qrCode = buildBrCode({ key, cents: info.amount, reference });
  if (!qrCode.startsWith('000201') || !qrCode.includes(key)) {
    const err = new Error('Falha ao montar o BR Code.');
    err.status = 500;
    throw err;
  }
  return {
    transactionId: reference,
    reference,
    qrCode,
    amount: info.amount,
    status: 'pending',
    product,
    productName: info.name,
    gateway: 'pixmanual',
  };
}

async function getCharge({ id, reference }) {
  return {
    transactionId: String(id || reference || ''),
    reference: reference || '',
    status: 'pending',
    gateway: 'pixmanual',
  };
}

module.exports = { createCharge, getCharge, buildBrCode, crc16, pixKey };
