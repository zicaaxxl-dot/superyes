(function () {
  function once(key) {
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
    } catch (e) {}
    return false;
  }

  function track(event, params) {
    if (!window.ttq) return;
    var key = 'ttq:' + event + ':' + (location.pathname || '/');
    if (once(key)) return;
    try { ttq.track(event, params || {}); } catch (e) {}
  }

  function run() {
    var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') {
      track('ViewContent', { content_name: 'home', content_type: 'product' });
      return;
    }
    if (path.indexOf('/inicio') === 0) {
      track('ViewContent', { content_name: 'inicio', content_type: 'product' });
      return;
    }
    if (/^\/2(\/|$)/.test(path)) {
      track('SubmitForm', { content_name: 'cpf', content_type: 'product' });
      return;
    }
    if (/^\/[3-8](\/|$)/.test(path)) {
      track('ViewContent', { content_name: 'cadastro', content_type: 'product' });
      track('Contact', { content_name: path });
      return;
    }
    if (path.indexOf('/criando') === 0) {
      track('ViewContent', { content_name: 'analise', content_type: 'product' });
      return;
    }
    if (path.indexOf('/conta') === 0) {
      track('ViewContent', { content_name: 'conta', content_type: 'product' });
      return;
    }
    if (path.indexOf('/upsell') === 0 || path.indexOf('/ups/') === 0) {
      track('AddToCart', { content_name: path, content_type: 'product', currency: 'BRL' });
      return;
    }
    if (path.indexOf('/backs/') === 0) {
      track('ViewContent', { content_name: 'downsell', content_type: 'product', currency: 'BRL' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
