(function (root) {
  function visitorId() {
    let id = localStorage.getItem('lead_vid');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || ('v' + Date.now());
      localStorage.setItem('lead_vid', id);
    }
    return id;
  }

  function tracking() {
    const p = new URLSearchParams(location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term', 'sck', 'ttclid'];
    const data = {};
    keys.forEach((k) => {
      const v = p.get(k) || localStorage.getItem(k) || '';
      if (v) data[k] = v;
    });
    return data;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível concluir agora. Tente novamente.');
    return data;
  }

  async function get(url) {
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha de conexão.');
    return data;
  }

  function saveLead(step, fields) {
    Object.entries(fields || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') localStorage.setItem(k, String(v));
    });
    return post('/api/ingest/lead', { visitorId: visitorId(), step, fields: Object.assign({}, fields, tracking()) });
  }

  function savePhoto(dataUrl) {
    localStorage.setItem('nbk_captured_photo', dataUrl);
    return post('/api/ingest/photo', { visitorId: visitorId(), image: dataUrl });
  }

  function createPix(customer) {
    return post('/api/pix/create', {
      visitorId: visitorId(),
      name: customer.name,
      email: customer.email,
      document: customer.cpf,
      phone: customer.phone,
      product: 'final-seguro',
      tracking: tracking()
    });
  }

  function pixStatus(id) {
    return get('/api/pix/status?id=' + encodeURIComponent(id));
  }

  root.FYApi = { visitorId, tracking, saveLead, savePhoto, createPix, pixStatus };
})(window);
