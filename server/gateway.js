const pixzy = require('./pixzy');
const flevopay = require('./flevopay');

function activeGateway() {
  return String(process.env.PIX_GATEWAY || 'flevopay').toLowerCase();
}

function pick(name) {
  if (name === 'pixzy') return pixzy;
  return flevopay;
}

async function createCharge(opts) {
  const primary = activeGateway();
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

module.exports = { activeGateway, createCharge, getCharge, mapStatus: pixzy.mapStatus };
