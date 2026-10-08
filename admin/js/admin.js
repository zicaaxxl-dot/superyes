(function () {
  const labels = {
    novo: 'Novo',
    cadastro: 'Cadastro',
    analise: 'Em análise',
    pix: 'PIX gerado',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    pendente: 'Pendente'
  };
  const filters = [
    ['', 'Todos'],
    ['novo', 'Novos'],
    ['cadastro', 'Cadastro'],
    ['analise', 'Com foto'],
    ['pix', 'PIX'],
    ['aprovado', 'Pagos']
  ];
  const gateNames = { flevopay: 'FlevoPay', ironpay: 'IronPay', pixzy: 'Pixzy' };
  let currentFilter = '';

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
    if (res.status === 401) throw new Error('auth');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  }

  async function boot() {
    try {
      await api('/api/admin/me');
      showApp();
    } catch {
      document.getElementById('loginView').classList.remove('hidden');
      document.getElementById('appView').classList.add('hidden');
    }
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    document.getElementById('loginErr').textContent = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          user: document.getElementById('user').value,
          password: document.getElementById('password').value
        })
      });
      showApp();
    } catch (err) {
      document.getElementById('loginErr').textContent = err.message === 'auth' ? 'Usuário ou senha inválidos' : err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar no painel';
    }
    return false;
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    location.reload();
  }

  async function showApp() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appView').classList.remove('hidden');
    try {
      await loadStats();
      await loadPixels();
      await loadLeads();
    } catch (err) {
      document.getElementById('tableWrap').innerHTML = '<div class="empty">' + (err.message || 'Erro ao carregar') + '</div>';
    }
  }

  function pct(n) { return (Number(n) || 0).toLocaleString('pt-BR') + '%'; }

  async function loadStats() {
    const s = await api('/api/admin/stats');
    document.getElementById('liveStamp').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('kpis').innerHTML = [
      ['Hoje', s.leadsToday || 0, 'leads novos'],
      ['Solicitações', s.leads, pct(s.conversionRate) + ' pagos'],
      ['IPs únicos', s.uniqueIps || 0, (s.repeatedIps || 0) + ' repetidos'],
      ['PIX gerados', s.pixGenerated, s.pixPaid + ' pagos'],
      ['Conversão PIX', pct(s.pixPayRate), 'pago / gerado'],
      ['Recebido', money(s.revenueCents), 'soma dos PIX pagos']
    ].map(([l, v, e]) => `<div class="kpi"><span>${l}</span><strong>${v}</strong><em>${e}</em></div>`).join('');

    const total = Math.max(1, s.leads);
    const rows = [
      ['Cadastros', s.leads],
      ['Com foto', s.withPhoto],
      ['PIX gerado', s.pixGenerated],
      ['PIX pago', s.pixPaid]
    ];
    document.getElementById('funnelBars').innerHTML = rows.map(([l, v]) => {
      const w = Math.round((Number(v) / total) * 100);
      return `<div class="bar-row"><span>${l}</span><div class="bar"><i style="width:${Math.min(100, w)}%"></i></div><b>${v}</b></div>`;
    }).join('');
    const gw = s.gateway === 'ironpay' || s.gateway === 'pixzy' ? s.gateway : 'flevopay';
    const volumes = (s.gateways || []).map((g) => `
      <div class="gw-row"><span>${esc(gateNames[g.gateway] || g.gateway)}</span><b>${g.paid}/${g.generated}</b></div>
    `).join('') || '<div class="empty">Nenhum PIX ainda.</div>';
    document.getElementById('statusBox').innerHTML = `
      <div class="gateway-pick">
        <span>Gateway PIX</span>
        <div class="seg">
          <button type="button" class="${gw === 'flevopay' ? 'on' : ''}" onclick="setGateway('flevopay')">Flevo</button>
          <button type="button" class="${gw === 'ironpay' ? 'on' : ''}" onclick="setGateway('ironpay')">Iron</button>
          <button type="button" class="${gw === 'pixzy' ? 'on' : ''}" onclick="setGateway('pixzy')">Pixzy</button>
        </div>
        <em id="gatewayHint">Novos PIX saem pelo gateway marcado.</em>
      </div>
      <div style="margin-top:12px">${volumes}</div>
    `;
    const ips = s.topIps || [];
    document.getElementById('ipBox').innerHTML = ips.length ? ips.map((row) => `
      <div class="ip-row">
        <button type="button" onclick="focusIp('${esc(row.ip)}')">${esc(row.ip)}</button>
        <span>${row.leads} lead${row.leads > 1 ? 's' : ''}${row.paid ? ' · ' + row.paid + ' pago' : ''}</span>
      </div>
    `).join('') : '<div class="empty">Os próximos acessos aparecem aqui com o IP.</div>';
    document.getElementById('filters').innerHTML = filters.map(([id, label]) => `
      <button type="button" class="${currentFilter === id ? 'on' : ''}" onclick="setFilter('${id}')">${label}</button>
    `).join('');
  }

  async function loadPixels() {
    const rows = await api('/api/admin/pixels');
    const count = document.getElementById('pixelCount');
    const list = document.getElementById('pixelList');
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' ativo' : ' ativos');
    if (!list) return;
    list.innerHTML = rows.length ? rows.map((p) => `
      <div class="pixel-item">
        <div>
          <b class="mono">${esc(p.pixelId)}</b>
          <small>token ${esc(p.tokenHint || '—')} · desde ${fmt(p.createdAt)}</small>
        </div>
        <button class="btn ghost small" type="button" onclick="removePixel('${esc(p.id)}')">Remover</button>
      </div>
    `).join('') : '<div class="empty">Nenhum pixel ativo. O site para de disparar TikTok até você adicionar um.</div>';
  }

  async function addPixel(e) {
    e.preventDefault();
    const err = document.getElementById('pixelErr');
    const btn = document.getElementById('pixelBtn');
    err.textContent = '';
    btn.disabled = true;
    try {
      await api('/api/admin/pixels', {
        method: 'POST',
        body: JSON.stringify({
          pixelId: document.getElementById('pixelId').value,
          accessToken: document.getElementById('pixelToken').value
        })
      });
      document.getElementById('pixelId').value = '';
      document.getElementById('pixelToken').value = '';
      await loadPixels();
    } catch (error) {
      err.textContent = error.message || 'Não foi possível adicionar.';
    } finally {
      btn.disabled = false;
    }
    return false;
  }

  async function removePixel(id) {
    const err = document.getElementById('pixelErr');
    err.textContent = '';
    try {
      await api('/api/admin/pixels/' + encodeURIComponent(id), { method: 'DELETE' });
      await loadPixels();
    } catch (error) {
      err.textContent = error.message || 'Não foi possível remover.';
    }
  }

  async function setGateway(name) {
    const hint = document.getElementById('gatewayHint');
    try {
      await api('/api/admin/gateway', { method: 'POST', body: JSON.stringify({ gateway: name }) });
      await loadStats();
    } catch (err) {
      if (hint) hint.textContent = err.message || 'Não foi possível trocar o gateway.';
    }
  }

  function setFilter(id) {
    currentFilter = id;
    loadStats();
    loadLeads();
  }

  function focusIp(ip) {
    document.getElementById('search').value = ip;
    currentFilter = '';
    loadStats();
    loadLeads();
  }

  async function loadLeads() {
    const q = document.getElementById('search').value;
    const rows = await api('/api/admin/leads?q=' + encodeURIComponent(q) + '&status=' + encodeURIComponent(currentFilter));
    if (!rows.length) {
      document.getElementById('tableWrap').innerHTML = '<div class="empty">Nenhuma solicitação com esse filtro.</div>';
      return;
    }
    document.getElementById('tableWrap').innerHTML = `
      <div class="table-scroll"><table>
        <thead><tr><th>Quando</th><th>Cliente</th><th>IP</th><th>Origem</th><th>Status</th><th>PIX</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr onclick="openLead('${r.id}')">
              <td>${fmt(r.updatedAt || r.createdAt)}<div style="color:#6B6280;font-size:12px">${esc(stepName(r.step))}</div></td>
              <td><strong>${esc(r.nome || 'Sem nome')}</strong><div style="color:#6B6280;font-size:12px">${esc(r.cpf || r.telefone || '—')}</div></td>
              <td><span class="mono">${esc(r.ip || '—')}</span>${r.ipLeadCount > 1 ? `<div><span class="tag warn">${r.ipLeadCount} no mesmo IP</span></div>` : ''}</td>
              <td>${esc(r.utmSource || r.utmCampaign || 'direto')}<div style="color:#6B6280;font-size:12px">${esc(deviceLabel(r.userAgent))}</div></td>
              <td><span class="tag ${esc(r.status || 'pendente')}">${esc(labels[r.status] || r.status || 'Pendente')}</span></td>
              <td>${r.pixCount || 0}${r.lastPix ? `<div style="color:#6B6280;font-size:12px">${esc(gateNames[r.lastPix.gateway] || r.lastPix.gateway || '')} · ${esc(money(r.lastPix.amount))}</div>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;
  }

  async function openLead(id) {
    const l = await api('/api/admin/leads/' + id);
    document.getElementById('listView').classList.add('hidden');
    const d = document.getElementById('detailView');
    d.classList.remove('hidden');
    const person = [
      ['Nome', l.nome], ['CPF', l.cpf], ['Nome da mãe', l.nomeMae], ['Nascimento', l.dataNasc],
      ['E-mail', l.email], ['Telefone', l.telefone], ['Banco', l.banco], ['Tipo PIX', l.tipoPix],
      ['Chave PIX', l.chavePix], ['Valor simulado', l.valor], ['Parcelas', l.parcelas], ['Parcela', l.parcelaMensal]
    ];
    const origin = [
      ['UTM source', l.utmSource], ['Meio', l.utmMedium], ['Campanha', l.utmCampaign],
      ['Conteúdo', l.utmContent], ['Termo', l.utmTerm], ['ttclid', l.ttclid], ['sck', l.sck]
    ];
    const ips = (l.ips || []).map((item) => `<div class="ip-row"><span class="mono">${esc(item.ip)}</span><span>${fmt(item.at)}</span></div>`).join('');
    const steps = (l.steps || []).slice().reverse().map((step) => `
      <div><i></i><span>${esc(stepName(step.step))}</span><b>${fmt(step.at)}</b></div>
    `).join('');
    d.innerHTML = `
      <button class="btn ghost small" onclick="backList()">← Voltar</button>
      <h2 style="margin:16px 0 8px">${esc(l.nome || 'Cliente')} <span class="tag ${esc(l.status || '')}">${esc(labels[l.status] || l.status || '')}</span></h2>
      <div class="actions">
        ${l.ip ? `<button class="btn ghost small" onclick="copyText(${JSON.stringify(l.ip)})">Copiar IP</button>` : ''}
        ${l.cpf ? `<button class="btn ghost small" onclick="copyText(${JSON.stringify(l.cpf)})">Copiar CPF</button>` : ''}
        ${l.telefone ? `<button class="btn ghost small" onclick="copyText(${JSON.stringify(l.telefone)})">Copiar telefone</button>` : ''}
      </div>
      <h3 class="section">Sessão</h3>
      <div class="grid">
        <div class="field"><small>IP atual</small><span class="mono">${esc(l.ip || '—')}</span></div>
        <div class="field"><small>Aparelho</small>${esc(deviceLabel(l.userAgent))}</div>
        <div class="field"><small>Navegador</small>${esc(l.userAgent || '—')}</div>
        <div class="field"><small>Referer</small>${esc(l.referer || '—')}</div>
        <div class="field"><small>Visitante</small><span class="mono">${esc(l.visitorId || '—')}</span></div>
        <div class="field"><small>Atualizado</small>${fmt(l.updatedAt)}</div>
      </div>
      ${ips ? `<div class="section"><strong>Histórico de IP</strong>${ips}</div>` : ''}
      <h3 class="section">Cadastro</h3>
      <div class="grid">${person.map(([k, v]) => `<div class="field"><small>${k}</small>${esc(v || '—')}</div>`).join('')}</div>
      <h3 class="section">Origem</h3>
      <div class="grid">${origin.map(([k, v]) => `<div class="field"><small>${k}</small>${esc(v || '—')}</div>`).join('')}</div>
      <h3 class="section">Caminho no funil</h3>
      <div class="timeline">${steps || '<div class="empty">Sem etapas registradas</div>'}</div>
      <h3 class="section">Selfie e documentos</h3>
      <div class="photos">
        ${(l.photos || []).length ? l.photos.map((p) => `<a href="${p.url}" target="_blank"><img src="${p.url}" alt="selfie"></a>`).join('') : '<div class="empty">Nenhuma foto enviada</div>'}
      </div>
      <h3 class="section">PIX gerados</h3>
      ${(l.pix || []).length ? l.pix.map((p) => `
        <div class="pix">
          <div><strong>${esc(gateNames[p.gateway] || p.gateway || 'PIX')} · ${esc(p.product || p.page || 'PIX')}</strong> · ${esc(statusLabel(p.status))} · ${fmt(p.createdAt)}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">IP ${esc(p.ip || l.ip || '—')} · ID ${esc(p.transactionId || p.reference || '—')} · ${esc(money(p.amount))}</div>
          ${p.qrCode ? `<code>${esc(p.qrCode)}</code><button class="btn small" onclick="copyText(${JSON.stringify(p.qrCode)})">Copiar código</button>` : ''}
        </div>
      `).join('') : '<div class="empty">Nenhum PIX gerado ainda</div>'}
    `;
  }

  function backList() {
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('listView').classList.remove('hidden');
    loadLeads();
    loadStats();
  }
  function stepName(step) {
    const s = String(step || '');
    if (s.indexOf('pix:') === 0) return 'PIX ' + s.slice(4);
    const path = s.replace(/\/index\.html$/, '').replace(/\/$/, '') || '/';
    const names = {
      '/': 'Home',
      '/inicio': 'Simulação',
      '/2': 'CPF',
      '/3': 'Dados',
      '/4': 'Contato',
      '/5': 'Endereço',
      '/6': 'Selfie',
      '/7': 'Renda',
      '/8': 'Revisão',
      '/criando': 'Análise',
      '/conta': 'Chave PIX',
      '/final': 'Oferta',
      foto: 'Foto'
    };
    if (names[path]) return names[path];
    if (path.indexOf('/ups/') === 0) return 'Upsell ' + path.split('/').pop();
    if (path.indexOf('/backs/') === 0) return 'Downsell';
    return s || '—';
  }
  function deviceLabel(ua) {
    const s = String(ua || '');
    if (!s) return '—';
    const mobile = /Mobile|Android|iPhone|iPad/i.test(s);
    let browser = 'Navegador';
    if (/Edg\//.test(s)) browser = 'Edge';
    else if (/Chrome\//.test(s)) browser = 'Chrome';
    else if (/Firefox\//.test(s)) browser = 'Firefox';
    else if (/Safari\//.test(s)) browser = 'Safari';
    return (mobile ? 'Celular' : 'Desktop') + ' · ' + browser;
  }
  function copyText(value) {
    navigator.clipboard.writeText(String(value || ''));
  }
  function statusLabel(s) {
    if (s === 'approved' || s === 'paid') return 'Pago';
    if (s === 'failed' || s === 'expired') return 'Falhou / expirou';
    return 'Pendente';
  }
  function money(cents) {
    const n = Number(cents);
    if (!n && n !== 0) return '—';
    return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.doLogin = doLogin;
  window.logout = logout;
  window.setGateway = setGateway;
  window.addPixel = addPixel;
  window.removePixel = removePixel;
  window.setFilter = setFilter;
  window.focusIp = focusIp;
  window.copyText = copyText;
  window.loadLeads = loadLeads;
  window.openLead = openLead;
  window.backList = backList;
  boot();
})();
