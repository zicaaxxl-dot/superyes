const pixzy = require('./pixzy');
const flevopay = require('./flevopay');
const ironpay = require('./ironpay');

let selected = null;

function activeGateway() {
  const name = String(selected || process.env.PIX_GATEWAY || 'flevopay').toLowerCase();
  if (name === 'ironpay' || name === 'pixzy') return name;
  return 'flevopay';
}

function setActiveGateway(name) {
  const n = String(name || '').toLowerCase();
  if (n !== 'flevopay' && n !== 'ironpay' && n !== 'pixzy') {
    const err = new Error('Gateway inválido. Use flevopay, ironpay ou pixzy.');
    err.status = 400;
    throw err;
  }
  selected = n;
  return n;
}

function pick(name) {
  if (name === 'ironpay') return ironpay;
  if (name === 'pixzy') return pixzy;
  return flevopay;
}

async function createCharge(opts) {
  const primary = activeGateway();
  if (primary === 'ironpay') return ironpay.createCharge(opts);
  if (primary === 'pixzy') {
    return pixzy.createCharge({ token: process.env.PIXZY_TOKEN, ...opts });
  }
  try {
    return await pick(primary).createCharge(opts);
  } catch (err) {
    if (primary !== 'pixzy' && pixzy) {
      console.error('[pix] flevopay failed, falling back to pixzy:', err.message);
      const charge = await pixzy.createCharge({
        token: process.env.PIXZY_TOKEN,
        ...opts,
      });
      return charge;
    }
    throw err;
  }
}

async function getCharge({ id, gateway, reference }) {
  const gw = String(gateway || activeGateway()).toLowerCase();
  if (gw === 'ironpay') return ironpay.getCharge({ id, reference });
  if (gw === 'pixzy') {
    return pixzy.getCharge({ token: process.env.PIXZY_TOKEN, id });
  }
  try {
    return await flevopay.getCharge({ id, reference });
  } catch (err) {
    if (gw !== 'pixzy') {
      try {
        return await pixzy.getCharge({ token: process.env.PIXZY_TOKEN, id });
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

module.exports = { activeGateway, setActiveGateway, createCharge, getCharge, mapStatus: pixzy.mapStatus };
