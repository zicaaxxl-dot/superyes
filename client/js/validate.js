(function (root) {
  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  function maskCpf(v) {
    const d = digits(v).slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function maskPhone(v) {
    const d = digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  function validCpf(value) {
    const cpf = digits(value);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    if (rest !== Number(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest === Number(cpf[10]);
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
  }

  function validPhone(v) {
    const d = digits(v);
    return d.length === 10 || d.length === 11;
  }

  function validName(v) {
    const n = String(v || '').trim();
    return n.length >= 5 && n.split(/\s+/).length >= 2;
  }

  root.FYValidate = { digits, maskCpf, maskPhone, validCpf, validEmail, validPhone, validName };
})(window);
