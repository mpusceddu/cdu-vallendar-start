// Empty configuration keeps the preview offline. Never put secrets in this file.
const form = document.querySelector('#signup-form');
const fields = form.querySelector('fieldset');
const hint = document.querySelector('#form-hint');
const result = document.querySelector('#signup-result');
const actionPanel = document.querySelector('#signup-action');
const actionButton = document.querySelector('#action-button');
const action = new URL(location.href).searchParams.get('action');
let actionToken = location.hash.slice(1), apiBase = '', config, widgetId;
function message(text, error = false) {
  result.textContent = text;
  result.hidden = false;
  result.classList.toggle('is-error', error);
  result.focus();
}
async function post(path, data) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(body.error || 'Die Anfrage konnte nicht abgeschlossen werden.');
  return body;
}
if (action === 'confirm' || action === 'unsubscribe') {
  // Do not retain a personal action token in browser history.
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  form.hidden = true;
  actionPanel.hidden = false;
  document.querySelector('#form-title').textContent = action === 'confirm' ? 'Anmeldung bestätigen' : 'Anmeldung löschen';
  document.querySelector('#form-description').textContent = action === 'confirm'
    ? 'Bestätigen Sie hier Ihre einmalige Benachrichtigung zum Start.'
    : 'Hier können Sie Ihre Anmeldung löschen und Ihre Einwilligung widerrufen.';
  actionButton.textContent = action === 'confirm' ? 'Ja, Anmeldung bestätigen' : 'Anmeldung jetzt löschen';
}
actionButton.addEventListener('click', async () => {
  actionButton.disabled = true;
  try {
    const response = await post(`/api/${action}`, { token: actionToken });
    actionToken = '';
    message(response.message);
  } catch (error) {
    message(error.name === 'TimeoutError' ? 'Die Antwort hat zu lange gedauert. Bitte erneut versuchen.' : error.message, true);
    actionButton.disabled = false;
  }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!config?.signupOpen || !form.reportValidity()) return;
  const turnstile = window.turnstile?.getResponse(widgetId);
  if (!turnstile) return message('Bitte die Sicherheitsprüfung abschließen.', true);
  fields.disabled = true;
  try {
    const response = await post('/api/subscribe', {
      email: form.elements.email.value, consent: form.elements.consent.checked,
      consentVersion: config.consentVersion, website: form.elements.website.value, turnstile
    });
    form.reset();
    message(response.message);
  } catch (error) {
    message(error.name === 'TimeoutError'
      ? 'Der Versandstatus ist unklar. Prüfen Sie Ihren Posteingang, bevor Sie die Anmeldung wiederholen.'
      : error.message, true);
  } finally {
    fields.disabled = false;
    window.turnstile?.reset(widgetId);
  }
});
async function init() {
  try {
    const local = await fetch(new URL('./signup-config.json', import.meta.url), { cache: 'no-store' }).then(r => r.json());
    if (!local.apiBase) return;
    const endpoint = new URL(local.apiBase);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('config');
    apiBase = endpoint.origin;
    const response = await fetch(`${apiBase}/api/config`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('config');
    config = await response.json();
    if (!config.enabled) return;
    if (action === 'confirm' || action === 'unsubscribe') {
      hint.hidden = true;
      if (/^[a-f0-9]{64}$/.test(actionToken)) actionButton.disabled = false;
      else message('Dieser Link ist unvollständig. Bitte öffnen Sie den vollständigen Link aus Ihrer E-Mail.', true);
      return;
    }
    if (!config.signupOpen) {
      hint.textContent = 'Die Anmeldung für die einmalige Startnachricht ist geschlossen.';
      return;
    }
    const privacy = new URL(config.privacyUrl);
    if (privacy.protocol !== 'https:') throw new Error('config');
    document.querySelector('#consent-text').textContent = config.consent;
    document.querySelector('#signup-privacy').href = privacy.href;
    document.querySelector('#signup-privacy-note').hidden = false;
    document.querySelector('#preview-privacy-note').hidden = true;
    document.querySelector('#form-description').textContent = 'Melden Sie sich für eine einmalige E-Mail zum Start an. Anschließend bestätigen Sie Ihre Adresse per Link in der Bestätigungsmail.';
    hint.textContent = 'Die Sicherheitsprüfung wird geladen …';
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onerror = () => { hint.textContent = 'Die Sicherheitsprüfung konnte nicht geladen werden. Bitte später erneut versuchen.'; };
    script.onload = () => {
      window.turnstile.ready(() => {
        widgetId = window.turnstile.render('#signup-security', {
          sitekey: config.siteKey, action: 'startinfo', theme: 'light', size: 'flexible'
        });
        fields.disabled = false;
        hint.textContent = 'Bitte bestätigen Sie nach der Anmeldung Ihre E-Mail-Adresse. Ohne Bestätigung wird keine Startnachricht versendet.';
      });
    };
    document.head.append(script);
  } catch {
    hint.textContent = 'Die Anmeldung ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.';
  }
}
init();
