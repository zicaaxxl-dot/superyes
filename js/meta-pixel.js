(function () {
  var PIXEL_ID = '1123330986891142';

  function userData() {
    var em = String(localStorage.getItem('email') || '').trim().toLowerCase();
    var ph = String(localStorage.getItem('telephone') || localStorage.getItem('telefone') || localStorage.getItem('phone') || '').replace(/\D/g, '');
    var name = String(localStorage.getItem('nome') || localStorage.getItem('name') || '').trim().toLowerCase();
    var cpf = String(localStorage.getItem('cpf') || localStorage.getItem('document') || '').replace(/\D/g, '');
    var data = {};
    if (em) data.em = em;
    if (ph) data.ph = ph.length <= 11 && ph.length >= 10 ? '55' + ph : ph;
    if (name) {
      var parts = name.split(/\s+/).filter(Boolean);
      data.fn = parts[0];
      if (parts.length > 1) data.ln = parts.slice(1).join(' ');
    }
    if (cpf) data.external_id = cpf;
    return data;
  }

  function ensurePixel() {
    if (!window.fbq) {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
        n.queue = []; t = b.createElement(e); t.async = !0;
        t.src = v; s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', PIXEL_ID, userData());
      fbq('track', 'PageView');
    } else {
      try { fbq('init', PIXEL_ID, userData()); } catch (e) {}
    }
  }

  function onceKey(event, extra) {
    return 'fbq:' + event + ':' + (extra || location.pathname);
  }

  function seen(key) {
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
    } catch (e) {}
    return false;
  }

  function trackMeta(event, params, opts) {
    ensurePixel();
    if (!window.fbq) return;
    var extra = opts && (opts.eventID || opts.eventId);
    var key = onceKey(event, extra);
    if (!(opts && opts.repeat) && seen(key)) return;
    try {
      fbq('track', event, params || {}, extra ? { eventID: String(extra) } : {});
    } catch (e) {}
  }

  window.trackMeta = trackMeta;

  function brl(cents) {
    var n = Number(cents);
    if (!Number.isFinite(n) || n <= 0) return 48.63;
    return Math.round(n) / 100;
  }

  function fireStep() {
    var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    var content = { content_type: 'product', content_name: path };

    if (path === '/' || path === '/index.html') {
      trackMeta('ViewContent', Object.assign({ content_name: 'home' }, content));
      return;
    }
    if (path.indexOf('/inicio') === 0) {
      trackMeta('ViewContent', Object.assign({ content_name: 'inicio' }, content));
      trackMeta('Search', { search_string: 'emprestimo supersim' });
      return;
    }
    if (path.indexOf('/2') === 0) {
      trackMeta('Lead', Object.assign({ content_name: 'cpf' }, content));
      return;
    }
    if (path.indexOf('/3') === 0 || path.indexOf('/4') === 0 || path.indexOf('/5') === 0 || path.indexOf('/6') === 0 || path.indexOf('/7') === 0 || path.indexOf('/8') === 0) {
      trackMeta('ViewContent', Object.assign({ content_name: 'cadastro' }, content));
      trackMeta('Contact', { content_name: path });
      return;
    }
    if (path.indexOf('/criando') === 0) {
      trackMeta('CompleteRegistration', { status: true, content_name: 'conta' });
      return;
    }
    if (path.indexOf('/conta') === 0) {
      trackMeta('AddPaymentInfo', { content_name: 'chave_pix' });
      return;
    }
    if (path.indexOf('/final') === 0) {
      trackMeta('ViewContent', { content_name: 'pix', content_ids: ['final-seguro'], value: 48.63, currency: 'BRL' });
      return;
    }
    if (path.indexOf('/upsell') === 0 || path.indexOf('/ups/') === 0) {
      trackMeta('AddToCart', { content_name: path, currency: 'BRL' });
      trackMeta('ViewContent', { content_name: 'upsell', currency: 'BRL' });
      return;
    }
    if (path.indexOf('/backs/') === 0) {
      trackMeta('ViewContent', { content_name: 'downsell', currency: 'BRL' });
    }
  }

  function hookPix() {
    if (window.__metaPixHook || typeof window.fetch !== 'function') return;
    window.__metaPixHook = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var p = orig(input, init);
      try {
        var url = String(typeof input === 'string' ? input : (input && input.url) || '');
        p.then(function (res) {
          var copy = res.clone();
          if (url.indexOf('/api/pix/create') !== -1) {
            copy.json().then(function (data) {
              if (!data || !(data.transactionId || data.qrCode)) return;
              trackMeta('InitiateCheckout', {
                value: brl(data.amount),
                currency: 'BRL',
                content_ids: [data.product || 'pix'],
                content_type: 'product'
              }, { eventID: data.transactionId || ('ic_' + Date.now()) });
            }).catch(function () {});
          } else if (url.indexOf('/api/pix/status') !== -1) {
            copy.json().then(function (data) {
              if (!data || data.status !== 'approved') return;
              var id = data.transactionId || data.id;
              trackMeta('Purchase', {
                value: brl(data.amount),
                currency: 'BRL',
                content_ids: [data.product || 'paid'],
                content_type: 'product'
              }, { eventID: id || ('p_' + Date.now()) });
            }).catch(function () {});
          }
        }).catch(function () {});
      } catch (e) {}
      return p;
    };
  }

  ensurePixel();
  hookPix();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fireStep);
  } else {
    fireStep();
  }
})();
