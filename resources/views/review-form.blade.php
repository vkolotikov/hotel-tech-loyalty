<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Share your feedback</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root {
  --primary: #2d6a4f;
  --primary-hover: color-mix(in srgb, var(--primary) 85%, #000);
  --bg: #faf8f5;
  --surface: #ffffff;
  --border: #e8e4df;
  --text: #1a1a1a;
  --muted: #6b7280;
  --error: #dc2626;
  --star: #f59e0b;
  --radius: 14px;
  --font: 'Inter', system-ui, -apple-system, sans-serif;
  /* Stepper theme vars — overwritten from config.theme at boot */
  --sv-bg-from: #2563eb;
  --sv-bg-to: #38bdf8;
  --sv-text: #ffffff;
  --sv-btn-bg: rgba(255,255,255,.92);
  --sv-btn-text: #0f2c52;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
.wrap{max-width:640px;margin:0 auto;padding:28px 18px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px 22px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
h1{font-size:22px;font-weight:700;margin-bottom:6px}
.intro{color:var(--muted);font-size:14px;margin-bottom:22px}
.q{margin-bottom:22px}
.q-label{font-weight:600;font-size:14px;margin-bottom:8px;display:block}
.q-label .req{color:var(--error);margin-left:3px}
.q-help{color:var(--muted);font-size:12px;margin-bottom:8px}
input[type=text],input[type=email],textarea,select{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:#fff;color:var(--text);transition:border-color .15s}
input[type=text]:focus,input[type=email]:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary)}
textarea{min-height:90px;resize:vertical}
.stars{display:flex;gap:6px}
.star-btn{background:none;border:none;padding:2px;font-size:34px;line-height:1;color:#d4d4d4;transition:transform .1s;cursor:pointer}
.star-btn:hover{transform:scale(1.1)}
.star-btn.on{color:var(--star)}
.scale{display:flex;gap:6px;flex-wrap:wrap}
.scale-btn{flex:1;min-width:36px;padding:10px 6px;border:1px solid var(--border);background:#fff;border-radius:8px;font-weight:600;font-size:14px;color:var(--text);cursor:pointer;transition:all .15s}
.scale-btn:hover{border-color:var(--primary)}
.scale-btn.on{background:var(--primary);color:#fff;border-color:var(--primary)}
.choice{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all .15s;font-size:14px}
.choice:hover{border-color:var(--primary)}
.choice.on{background:color-mix(in srgb, var(--primary) 10%, #fff);border-color:var(--primary)}
.choice input{margin:0}
.emojis{display:flex;gap:6px;flex-wrap:wrap}
.emoji-btn{flex:1;min-width:64px;padding:10px 6px;border:1px solid var(--border);background:#fff;border-radius:10px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:4px}
.emoji-btn:hover{border-color:var(--primary)}
.emoji-btn.on{background:color-mix(in srgb, var(--primary) 10%, #fff);border-color:var(--primary)}
.emoji-btn .em{font-size:28px;line-height:1}
.emoji-btn .lbl{font-size:11px;color:var(--muted);font-weight:500}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-weight:600;font-size:15px;cursor:pointer;transition:background .15s;width:100%}
.btn:hover{background:var(--primary-hover)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-outline{background:#fff;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{background:var(--bg)}
.msg{text-align:center;padding:40px 20px}
.msg h2{font-size:20px;margin-bottom:10px}
.msg p{color:var(--muted);font-size:14px}
.share-opts{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:520px){.field-row{grid-template-columns:1fr}}
.err{color:var(--error);font-size:13px;margin-top:6px}
.loading{text-align:center;padding:60px 20px;color:var(--muted)}
.badge{display:inline-block;padding:3px 8px;background:#fef3c7;color:#92400e;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}

/* ─── Stepper / kiosk layout ─────────────────────────────────────────────
   Full-viewport gradient, one question per screen, oversized touch
   targets. This is the "feedback kiosk" look: tap → auto-advance. */
body.sv-stepper{background:linear-gradient(160deg,var(--sv-bg-from),var(--sv-bg-to));color:var(--sv-text);overflow:hidden}
body.sv-stepper .wrap{max-width:none;margin:0;padding:0}
.sv-screen{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5vh 6vw;text-align:center;animation:svIn .35s ease both}
@keyframes svIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.sv-logo{position:absolute;top:3.5vh;left:0;right:0;display:flex;justify-content:center}
.sv-logo img{max-height:44px;max-width:60vw;object-fit:contain}
.sv-progress{position:absolute;top:calc(3.5vh + 54px);left:0;right:0;display:flex;justify-content:center;gap:8px}
.sv-dot{width:8px;height:8px;border-radius:99px;background:color-mix(in srgb, var(--sv-text) 30%, transparent);transition:all .25s}
.sv-dot.on{width:22px;background:var(--sv-text)}
.sv-title{font-size:clamp(24px,4.5vw,42px);font-weight:800;line-height:1.15;max-width:22ch;text-wrap:balance;text-shadow:0 2px 14px rgba(0,0,0,.14)}
.sv-help{margin-top:10px;font-size:clamp(13px,1.8vw,17px);opacity:.85;max-width:48ch}
.sv-body{margin-top:5vh;width:100%;max-width:680px}
.sv-opts{display:flex;flex-direction:column;gap:14px}
.sv-opt{display:flex;align-items:center;gap:14px;width:100%;padding:clamp(16px,2.6vh,24px) 22px;border:none;border-radius:16px;background:var(--sv-btn-bg);color:var(--sv-btn-text);font-family:inherit;font-size:clamp(16px,2.4vw,22px);font-weight:600;text-align:left;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.14);transition:transform .12s,box-shadow .12s}
.sv-opt:active{transform:scale(.98)}
.sv-opt.on{outline:3px solid var(--sv-text)}
.sv-opt .sv-em{font-size:1.5em;line-height:1}
.sv-stars{display:flex;justify-content:center;gap:clamp(8px,2vw,20px)}
.sv-star{background:none;border:none;font-size:clamp(46px,9vw,84px);line-height:1;color:rgba(255,255,255,.4);cursor:pointer;transition:transform .1s;filter:drop-shadow(0 4px 10px rgba(0,0,0,.18))}
.sv-star.on{color:#ffd44d}
.sv-star:active{transform:scale(1.12)}
.sv-emojis{display:flex;justify-content:center;gap:clamp(8px,2.2vw,22px);flex-wrap:wrap}
.sv-emoji{display:flex;flex-direction:column;align-items:center;gap:10px;background:none;border:none;cursor:pointer;padding:8px;border-radius:16px;transition:transform .12s}
.sv-emoji .em{font-size:clamp(44px,8vw,74px);line-height:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.15));transition:transform .12s}
.sv-emoji .lbl{font-size:clamp(11px,1.6vw,14px);font-weight:600;opacity:.9;color:var(--sv-text)}
.sv-emoji:active .em{transform:scale(1.18)}
.sv-emoji.on{background:color-mix(in srgb, var(--sv-text) 16%, transparent)}
.sv-nps{display:flex;justify-content:center;gap:clamp(4px,.9vw,10px);flex-wrap:wrap}
.sv-nps button{width:clamp(42px,7vw,64px);height:clamp(42px,7vw,64px);border:none;border-radius:12px;font-family:inherit;font-size:clamp(15px,2.2vw,20px);font-weight:800;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);transition:transform .1s}
.sv-nps button:active{transform:scale(1.08)}
.sv-nps button.on{outline:3px solid #fff}
.sv-nps .n-red{background:#f87171}.sv-nps .n-amber{background:#fbbf24}.sv-nps .n-green{background:#4ade80}
.sv-nps-legend{display:flex;justify-content:space-between;max-width:680px;margin:10px auto 0;font-size:clamp(11px,1.5vw,13px);opacity:.8}
.sv-input{width:100%;padding:clamp(14px,2.2vh,20px) 18px;border:none;border-radius:16px;font-family:inherit;font-size:clamp(15px,2.2vw,19px);background:var(--sv-btn-bg);color:var(--sv-btn-text);box-shadow:0 6px 22px rgba(0,0,0,.14)}
.sv-input:focus{outline:3px solid color-mix(in srgb, var(--sv-text) 65%, transparent)}
textarea.sv-input{min-height:22vh;resize:none}
.sv-next{margin-top:4vh;padding:clamp(13px,2vh,18px) clamp(34px,6vw,58px);border:none;border-radius:99px;background:var(--sv-btn-bg);color:var(--sv-btn-text);font-family:inherit;font-size:clamp(15px,2.2vw,19px);font-weight:700;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.2);transition:transform .12s}
.sv-next:active{transform:scale(.97)}
.sv-next:disabled{opacity:.45;cursor:not-allowed}
.sv-back{position:absolute;bottom:3.5vh;left:5vw;background:none;border:none;color:var(--sv-text);opacity:.7;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:10px}
.sv-skip{position:absolute;bottom:3.5vh;right:5vw;background:none;border:none;color:var(--sv-text);opacity:.7;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:10px}
.sv-check{width:clamp(76px,12vw,120px);height:clamp(76px,12vw,120px);border-radius:99px;background:color-mix(in srgb, var(--sv-text) 18%, transparent);display:flex;align-items:center;justify-content:center;font-size:clamp(40px,6vw,64px);margin-bottom:3.5vh;animation:svPop .45s cubic-bezier(.2,1.6,.4,1) both}
@keyframes svPop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
.sv-err{margin-top:14px;font-weight:600;background:rgba(0,0,0,.25);padding:8px 16px;border-radius:99px;font-size:14px}
.sv-tap-note{position:absolute;bottom:3.5vh;left:0;right:0;text-align:center;font-size:13px;opacity:.65}
</style>
</head>
<body>
<div class="wrap">
  <div id="app" class="card"><div class="loading">Loading…</div></div>
</div>
<script>
(function(){
  var API = @json($apiBase);
  var MODE = @json($mode);
  var KEY  = @json($key);
  var PRIMARY = @json($color);
  if (PRIMARY) document.documentElement.style.setProperty('--primary', PRIMARY);

  var qs = new URLSearchParams(window.location.search);
  var KIOSK = MODE === 'kiosk' || qs.get('mode') === 'kiosk';
  var PREVIEW = qs.get('preview') === '1';
  var IN_IFRAME = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();

  // Gradient presets — the admin picks one by name (or 'custom' with
  // explicit colors). Tuned to read well behind white text.
  var THEME_PRESETS = {
    ocean:    { from:'#2563eb', to:'#38bdf8', text:'#ffffff', btnBg:'rgba(255,255,255,.92)', btnText:'#0f2c52' },
    aurora:   { from:'#4f46e5', to:'#a855f7', text:'#ffffff', btnBg:'rgba(255,255,255,.92)', btnText:'#312e81' },
    sunset:   { from:'#f97316', to:'#ec4899', text:'#ffffff', btnBg:'rgba(255,255,255,.94)', btnText:'#7c2d12' },
    forest:   { from:'#047857', to:'#84cc16', text:'#ffffff', btnBg:'rgba(255,255,255,.93)', btnText:'#064e3b' },
    midnight: { from:'#0f172a', to:'#334155', text:'#f8fafc', btnBg:'rgba(255,255,255,.10)', btnText:'#f8fafc' },
  };

  function postParent(payload){
    if (!IN_IFRAME) return;
    try { window.parent.postMessage(Object.assign({ source: 'hotel-tech-review' }, payload), '*'); } catch(e){}
  }

  var app = document.getElementById('app');
  var state = { form:null, invitation:null, integrations:[], prefill:{}, answers:{}, overall:null, nps:null, comment:'', submitting:false,
                step:-1, steps:[], deviceVersion:null };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]}); }
  function theme(){ return (state.form && state.form.config && state.form.config.theme) || {}; }
  function isStepper(){ return theme().layout === 'stepper' || KIOSK; }

  function applyTheme(){
    var t = theme();
    var preset = THEME_PRESETS[t.style] || THEME_PRESETS.ocean;
    var from = t.style === 'custom' ? (t.bg_from || preset.from) : preset.from;
    var to   = t.style === 'custom' ? (t.bg_to   || preset.to)   : preset.to;
    var txt  = t.style === 'custom' ? (t.text_color || preset.text) : preset.text;
    var bBg  = t.style === 'custom' ? (t.button_bg || preset.btnBg) : preset.btnBg;
    var bTx  = t.style === 'custom' ? (t.button_text || preset.btnText) : preset.btnText;
    var r = document.documentElement.style;
    r.setProperty('--sv-bg-from', from); r.setProperty('--sv-bg-to', to);
    r.setProperty('--sv-text', txt); r.setProperty('--sv-btn-bg', bBg); r.setProperty('--sv-btn-text', bTx);
    if (t.button_bg && !isStepper()) r.setProperty('--primary', t.button_bg);
  }

  // ── Loading ────────────────────────────────────────────────────────────
  function fetchForm(){
    if (MODE === 'kiosk') {
      fetch(API+'/v1/public/reviews/device/'+encodeURIComponent(KEY.device))
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, body:j }; }); })
        .then(function(res){
          if (!res.ok) return renderMessage('Device not found','Ask your administrator to check this kiosk\'s link.');
          if (!res.body.form_id) return renderMessage('No survey assigned','Assign a survey to this device in Marketing → Reviews → Devices.');
          state.deviceVersion = res.body.version;
          KEY.id = res.body.form_id; KEY.key = res.body.key;
          loadByKey();
          startDevicePolling();
        })
        .catch(function(){ renderMessage('Offline','Could not reach the server. Retrying…'); setTimeout(fetchForm, 8000); });
      return;
    }
    if (MODE === 'token') {
      fetch(API+'/v1/public/reviews/token/'+encodeURIComponent(KEY.token))
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, status:r.status, body:j }; }); })
        .then(function(res){
          if (!res.ok) {
            if (res.status === 410) return renderMessage('Link expired','This review link has expired.');
            return renderMessage('Not found', res.body.message || 'This review could not be loaded.');
          }
          if (res.body.status === 'submitted') return renderMessage('Already submitted','Thanks — we already have your feedback.');
          boot(res.body);
        })
        .catch(function(){ renderMessage('Error','Could not load the form. Please try again.'); });
      return;
    }
    loadByKey();
  }

  function loadByKey(){
    fetch(API+'/v1/public/reviews/form/'+KEY.id+'?key='+encodeURIComponent(KEY.key)+(PREVIEW?'&preview=1':''))
      .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, status:r.status, body:j }; }); })
      .then(function(res){
        if (!res.ok) return renderMessage('Not found', res.body.message || 'This review could not be loaded.');
        boot(res.body);
      })
      .catch(function(){ renderMessage('Error','Could not load the form. Please try again.'); });
  }

  function boot(body){
    state.form = body.form;
    state.invitation = body.invitation || null;
    state.integrations = body.integrations || [];
    state.prefill = (body.invitation && body.invitation.prefill) || {};
    applyTheme();
    if (isStepper()) {
      document.body.classList.add('sv-stepper');
      buildSteps();
      state.step = welcomeEnabled() ? -1 : 0;
      renderStepper();
      if (KIOSK) armIdleReset();
    } else {
      render();
    }
    postParent({ event: 'review-loaded', form_id: state.form.id, form_type: state.form.type });
  }

  // Live design preview — the builder's Design tab postMessages the
  // DRAFT config into this frame so every color/copy/layout tweak
  // renders instantly, before saving. Preview mode only.
  if (PREVIEW) {
    window.addEventListener('message', function (ev) {
      var d = ev.data || {};
      if (d.source !== 'hotel-tech-review-admin' || !d.config || !state.form) return;
      state.form.config = d.config;
      applyTheme();
      var stepper = isStepper();
      document.body.classList.toggle('sv-stepper', stepper);
      if (stepper) {
        buildSteps();
        if (state.step < -1 || state.step > visibleSteps().length) state.step = welcomeEnabled() ? -1 : 0;
        if (state.step === -1 && !welcomeEnabled()) state.step = 0;
        if (state.step >= 0 && d.jumpToWelcome) state.step = welcomeEnabled() ? -1 : 0;
        renderStepper();
      } else {
        render();
      }
    });
  }

  // Kiosk assignment polling — reload when the admin repoints or
  // restyles this device's survey.
  function startDevicePolling(){
    setInterval(function(){
      fetch(API+'/v1/public/reviews/device/'+encodeURIComponent(KEY.device))
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if (j && state.deviceVersion && j.version !== state.deviceVersion) window.location.reload();
        }).catch(function(){});
    }, 60000);
  }

  // Idle reset — a guest walked away mid-survey; wipe and return to the
  // welcome screen for the next guest.
  var idleTimer = null;
  function armIdleReset(){
    var secs = Number((theme().kiosk || {}).idle_reset_seconds || 60);
    var reset = function(){
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function(){
        if (state.step >= 0 && !state.submitting) { resetState(); renderStepper(); }
      }, secs * 1000);
    };
    ['pointerdown','keydown','touchstart'].forEach(function(ev){ document.addEventListener(ev, reset, {passive:true}); });
    reset();
  }

  function resetState(){
    state.answers = {}; state.overall = null; state.comment = ''; state.submitting = false;
    state.step = welcomeEnabled() ? -1 : 0;
  }

  function renderMessage(title, body){
    document.body.classList.remove('sv-stepper');
    app.innerHTML = '<div class="msg"><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p></div>';
  }

  /* ═══ CLASSIC LAYOUT (unchanged single-page card) ═══════════════════ */

  function render(){
    var f = state.form;
    var cfg = f.config || {};
    var html = '';
    if (state.invitation && state.prefill.tier) html += '<span class="badge">'+esc(state.prefill.tier)+' member</span>';
    html += '<h1>'+esc(f.name)+'</h1>';
    if (cfg.intro_text) html += '<p class="intro">'+esc(cfg.intro_text)+'</p>';

    if (f.type === 'basic') {
      html += renderStarBlock();
      if (cfg.ask_for_comment) html += renderCommentBlock();
    } else {
      (f.questions||[]).forEach(function(q, idx){
        if (!isQuestionVisible(q, idx)) return;
        html += renderQuestion(q);
      });
    }

    if (!state.invitation && (cfg.allow_anonymous !== false)) {
      html += '<div class="q"><label class="q-label">Your details (optional)</label><div class="field-row">'
        + '<input type="text" id="anon_name" placeholder="Name" value="'+esc(state.prefill.name||'')+'">'
        + '<input type="email" id="anon_email" placeholder="Email" value="'+esc(state.prefill.email||'')+'">'
        + '</div></div>';
    }

    html += '<button class="btn" id="submit-btn"'+(state.submitting?' disabled':'')+'>'+(state.submitting?'Submitting…':'Submit feedback')+'</button>';
    html += '<div id="err" class="err" style="display:none"></div>';
    app.innerHTML = html;
    bind();
  }

  function renderStarBlock(){
    var on = state.overall || 0;
    var html = '<div class="q"><label class="q-label">How would you rate your experience?<span class="req">*</span></label><div class="stars" data-role="stars">';
    for (var i=1;i<=5;i++) html += '<button type="button" class="star-btn '+(i<=on?'on':'')+'" data-v="'+i+'">★</button>';
    html += '</div></div>';
    return html;
  }

  function renderCommentBlock(){
    return '<div class="q"><label class="q-label">Tell us more (optional)</label><textarea id="comment" placeholder="What stood out? Anything we could improve?">'+esc(state.comment)+'</textarea></div>';
  }

  function isQuestionVisible(q, idx){
    if (q.condition_index === null || q.condition_index === undefined || !q.condition_operator) return true;
    var qsArr = (state.form && state.form.questions) || [];
    var parent = qsArr[q.condition_index];
    if (!parent || q.condition_index >= idx) return true; // guard against bad refs
    // Chain-hide: parent hidden → child hidden
    if (!isQuestionVisible(parent, q.condition_index)) return false;
    var pv = state.answers[parent.id];
    var cv = q.condition_value;
    var cvFirst = Array.isArray(cv) ? cv[0] : cv;
    switch (q.condition_operator) {
      case 'eq':       return String(pv) === String(cvFirst);
      case 'neq':      return String(pv) !== String(cvFirst);
      case 'gte':      return pv !== undefined && pv !== null && Number(pv) >= Number(cvFirst);
      case 'lte':      return pv !== undefined && pv !== null && Number(pv) <= Number(cvFirst);
      case 'contains':
        if (Array.isArray(pv)) return pv.map(String).indexOf(String(cvFirst)) >= 0;
        return String(pv||'').toLowerCase().indexOf(String(cvFirst||'').toLowerCase()) >= 0;
      case 'any_of':
        var list = Array.isArray(cv) ? cv : [cv];
        if (Array.isArray(pv)) return pv.some(function(x){ return list.map(String).indexOf(String(x)) >= 0; });
        return list.map(String).indexOf(String(pv)) >= 0;
    }
    return true;
  }

  function visibleQuestions(){
    var qsArr = (state.form && state.form.questions) || [];
    return qsArr.filter(function(q, idx){ return isQuestionVisible(q, idx); });
  }

  function renderQuestion(q){
    var req = q.required ? '<span class="req">*</span>' : '';
    var html = '<div class="q" data-qid="'+q.id+'"><label class="q-label">'+esc(q.label)+req+'</label>';
    if (q.help_text) html += '<div class="q-help">'+esc(q.help_text)+'</div>';
    var v = state.answers[q.id];
    switch(q.kind){
      case 'text':
        html += '<input type="text" data-ans="'+q.id+'" value="'+esc(v||'')+'">'; break;
      case 'textarea':
        html += '<textarea data-ans="'+q.id+'">'+esc(v||'')+'</textarea>'; break;
      case 'stars':
        html += '<div class="stars" data-stars="'+q.id+'">';
        for (var i=1;i<=5;i++) html += '<button type="button" class="star-btn '+((v||0)>=i?'on':'')+'" data-v="'+i+'">★</button>';
        html += '</div>'; break;
      case 'scale':
        html += '<div class="scale" data-scale="'+q.id+'">';
        for (var s=1;s<=10;s++) html += '<button type="button" class="scale-btn '+(v===s?'on':'')+'" data-v="'+s+'">'+s+'</button>';
        html += '</div>'; break;
      case 'nps':
        html += '<div class="scale" data-nps="'+q.id+'">';
        for (var n=0;n<=10;n++) html += '<button type="button" class="scale-btn '+(v===n?'on':'')+'" data-v="'+n+'">'+n+'</button>';
        html += '</div>'; break;
      case 'boolean':
        html += '<div class="scale" data-bool="'+q.id+'">'
             + '<button type="button" class="scale-btn '+(v===true?'on':'')+'" data-v="1">Yes</button>'
             + '<button type="button" class="scale-btn '+(v===false?'on':'')+'" data-v="0">No</button>'
             + '</div>'; break;
      case 'single_choice':
        (q.options && q.options.choices || []).forEach(function(c){
          var on = v===c?'on':'';
          html += '<label class="choice '+on+'"><input type="radio" name="q'+q.id+'" value="'+esc(c)+'" '+(v===c?'checked':'')+' data-single="'+q.id+'">'+esc(c)+'</label>';
        }); break;
      case 'multi_choice':
        var arr = Array.isArray(v) ? v : [];
        (q.options && q.options.choices || []).forEach(function(c){
          var on = arr.indexOf(c)>=0 ? 'on':'';
          html += '<label class="choice '+on+'"><input type="checkbox" value="'+esc(c)+'" '+(arr.indexOf(c)>=0?'checked':'')+' data-multi="'+q.id+'">'+esc(c)+'</label>';
        }); break;
      case 'emoji':
        var emo = (q.options && q.options.emojis) || [];
        var lbls = (q.options && q.options.choices) || [];
        html += '<div class="emojis" data-emoji="'+q.id+'">';
        emo.forEach(function(em, ei){
          var val = lbls[ei] || em;
          html += '<button type="button" class="emoji-btn '+(v===val?'on':'')+'" data-v="'+esc(val)+'">'
               + '<span class="em">'+esc(em)+'</span>'
               + (lbls[ei] ? '<span class="lbl">'+esc(lbls[ei])+'</span>' : '')
               + '</button>';
        });
        html += '</div>'; break;
    }
    html += '</div>';
    return html;
  }

  function bind(){
    document.querySelectorAll('[data-role="stars"] .star-btn').forEach(function(b){
      b.addEventListener('click', function(){ state.overall = parseInt(b.dataset.v,10); render(); });
    });
    document.querySelectorAll('[data-stars]').forEach(function(el){
      el.querySelectorAll('.star-btn').forEach(function(b){
        b.addEventListener('click', function(){ state.answers[el.dataset.stars] = parseInt(b.dataset.v,10); render(); });
      });
    });
    document.querySelectorAll('[data-scale]').forEach(function(el){
      el.querySelectorAll('.scale-btn').forEach(function(b){
        b.addEventListener('click', function(){ state.answers[el.dataset.scale] = parseInt(b.dataset.v,10); render(); });
      });
    });
    document.querySelectorAll('[data-nps]').forEach(function(el){
      el.querySelectorAll('.scale-btn').forEach(function(b){
        b.addEventListener('click', function(){ state.answers[el.dataset.nps] = parseInt(b.dataset.v,10); render(); });
      });
    });
    document.querySelectorAll('[data-bool]').forEach(function(el){
      el.querySelectorAll('.scale-btn').forEach(function(b){
        b.addEventListener('click', function(){ state.answers[el.dataset.bool] = b.dataset.v==='1'; render(); });
      });
    });
    document.querySelectorAll('[data-ans]').forEach(function(el){
      el.addEventListener('input', function(){ state.answers[el.dataset.ans] = el.value; });
    });
    document.querySelectorAll('[data-single]').forEach(function(el){
      el.addEventListener('change', function(){ state.answers[el.dataset.single] = el.value; render(); });
    });
    document.querySelectorAll('[data-emoji]').forEach(function(el){
      el.querySelectorAll('.emoji-btn').forEach(function(b){
        b.addEventListener('click', function(){ state.answers[el.dataset.emoji] = b.dataset.v; render(); });
      });
    });
    document.querySelectorAll('[data-multi]').forEach(function(el){
      el.addEventListener('change', function(){
        var qid = el.dataset.multi;
        var cur = Array.isArray(state.answers[qid]) ? state.answers[qid].slice() : [];
        if (el.checked) { if (cur.indexOf(el.value)<0) cur.push(el.value); }
        else { cur = cur.filter(function(x){ return x !== el.value; }); }
        state.answers[qid] = cur;
        render();
      });
    });
    var cm = document.getElementById('comment');
    if (cm) cm.addEventListener('input', function(){ state.comment = cm.value; });
    document.getElementById('submit-btn').addEventListener('click', submit);
  }

  function validate(){
    var f = state.form;
    if (f.type === 'basic') {
      if (!state.overall) return 'Please choose a rating.';
      return null;
    }
    var miss = null;
    visibleQuestions().forEach(function(q){
      if (miss || !q.required) return;
      var v = state.answers[q.id];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) miss = 'Please answer: '+q.label;
    });
    return miss;
  }

  /* ═══ STEPPER LAYOUT (kiosk + modern website surveys) ═══════════════ */

  function welcomeEnabled(){
    var w = theme().welcome || {};
    return w.enabled !== false && (KIOSK || w.enabled === true);
  }

  // A "step" = one full-screen question. Basic forms synthesize their
  // stars (+ optional comment) as steps so both form types work.
  function buildSteps(){
    var f = state.form;
    if (f.type === 'basic') {
      state.steps = [{ synthetic:'stars' }];
      if ((f.config||{}).ask_for_comment) state.steps.push({ synthetic:'comment' });
      return;
    }
    state.steps = (f.questions||[]).map(function(q){ return { q:q }; });
  }

  // Visible steps re-evaluate on every advance so conditional follow-ups
  // ("what went wrong?" after a low score) appear the moment they apply.
  function visibleSteps(){
    return state.steps.filter(function(st){
      if (st.synthetic) return true;
      var idx = state.form.questions.indexOf(st.q);
      return isQuestionVisible(st.q, idx);
    });
  }

  function renderStepper(){
    var t = theme();
    var f = state.form;
    var logo = t.logo_url ? '<div class="sv-logo"><img src="'+esc(t.logo_url)+'" alt=""></div>' : '';

    if (state.step === -1) { // welcome
      var w = t.welcome || {};
      app.innerHTML = '<div class="sv-screen">'+logo
        + '<div class="sv-title">'+esc(w.title || f.name)+'</div>'
        + (w.subtitle ? '<div class="sv-help">'+esc(w.subtitle)+'</div>' : '')
        + '<button class="sv-next" id="sv-start">'+esc(w.button || 'Start')+'</button>'
        + (KIOSK ? '<div class="sv-tap-note">Tap to begin — it takes less than a minute</div>' : '')
        + '</div>';
      document.getElementById('sv-start').addEventListener('click', function(){ state.step = 0; renderStepper(); });
      return;
    }

    var steps = visibleSteps();
    if (state.step >= steps.length) return submitStepper();
    var st = steps[state.step];

    var dots = steps.map(function(_, i){ return '<span class="sv-dot'+(i<=state.step?' on':'')+'"></span>'; }).join('');
    var inner = st.synthetic ? renderSyntheticStep(st) : renderStepBody(st.q);

    app.innerHTML = '<div class="sv-screen">'+logo
      + '<div class="sv-progress">'+dots+'</div>'
      + inner.html
      + '<div id="sv-err" class="sv-err" style="display:none"></div>'
      + (state.step > 0 || welcomeEnabled() ? '<button class="sv-back" id="sv-back">‹ Back</button>' : '')
      + (inner.skippable ? '<button class="sv-skip" id="sv-skip">Skip ›</button>' : '')
      + '</div>';

    var back = document.getElementById('sv-back');
    if (back) back.addEventListener('click', function(){
      if (state.step === 0) { state.step = welcomeEnabled() ? -1 : 0; }
      else state.step--;
      renderStepper();
    });
    var skip = document.getElementById('sv-skip');
    if (skip) skip.addEventListener('click', function(){ state.step++; renderStepper(); });
    inner.bind();
  }

  function advance(){ setTimeout(function(){ state.step++; renderStepper(); }, 260); }

  function renderSyntheticStep(st){
    if (st.synthetic === 'stars') {
      var on = state.overall || 0, html = '<div class="sv-title">How was your experience today?</div><div class="sv-body"><div class="sv-stars">';
      for (var i=1;i<=5;i++) html += '<button class="sv-star'+(i<=on?' on':'')+'" data-v="'+i+'">★</button>';
      html += '</div></div>';
      return { html:html, skippable:false, bind:function(){
        document.querySelectorAll('.sv-star').forEach(function(b){
          b.addEventListener('click', function(){ state.overall = parseInt(b.dataset.v,10); paintStars(); advance(); });
        });
      }};
    }
    // comment
    return { html:'<div class="sv-title">Anything you\'d like to add?</div><div class="sv-body"><textarea class="sv-input" id="sv-comment" placeholder="Tell us more (optional)">'+esc(state.comment)+'</textarea></div><button class="sv-next" id="sv-nextbtn">Continue</button>',
      skippable:true, bind:function(){
        var el = document.getElementById('sv-comment');
        el.addEventListener('input', function(){ state.comment = el.value; });
        document.getElementById('sv-nextbtn').addEventListener('click', function(){ state.step++; renderStepper(); });
      }};
  }

  function paintStars(){
    document.querySelectorAll('.sv-star').forEach(function(b){
      b.classList.toggle('on', parseInt(b.dataset.v,10) <= (state.overall||0));
    });
  }

  function renderStepBody(q){
    var v = state.answers[q.id];
    var title = '<div class="sv-title">'+esc(q.label)+'</div>'
      + (q.help_text ? '<div class="sv-help">'+esc(q.help_text)+'</div>' : '');
    var skippable = !q.required;

    function tapBind(sel, fn){
      return function(){ document.querySelectorAll(sel).forEach(fn); };
    }

    switch (q.kind) {
      case 'stars': {
        var html = title+'<div class="sv-body"><div class="sv-stars">';
        for (var i=1;i<=5;i++) html += '<button class="sv-star'+((v||0)>=i?' on':'')+'" data-v="'+i+'">★</button>';
        html += '</div></div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-star', function(b){
          b.addEventListener('click', function(){
            state.answers[q.id] = parseInt(b.dataset.v,10);
            document.querySelectorAll('.sv-star').forEach(function(x){ x.classList.toggle('on', parseInt(x.dataset.v,10) <= state.answers[q.id]); });
            advance();
          });
        })};
      }
      case 'emoji': {
        var emo = (q.options && q.options.emojis) || ['😞','🙁','😐','🙂','😍'];
        var lbls = (q.options && q.options.choices) || [];
        var html = title+'<div class="sv-body"><div class="sv-emojis">';
        emo.forEach(function(em, ei){
          var val = lbls[ei] || em;
          html += '<button class="sv-emoji'+(v===val?' on':'')+'" data-v="'+esc(val)+'"><span class="em">'+esc(em)+'</span>'
            + (lbls[ei] ? '<span class="lbl">'+esc(lbls[ei])+'</span>' : '') + '</button>';
        });
        html += '</div></div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-emoji', function(b){
          b.addEventListener('click', function(){ state.answers[q.id] = b.dataset.v; advance(); });
        })};
      }
      case 'nps': {
        var html = title+'<div class="sv-body"><div class="sv-nps">';
        for (var n=0;n<=10;n++) {
          var cls = n<=6 ? 'n-red' : (n<=8 ? 'n-amber' : 'n-green');
          html += '<button class="'+cls+(v===n?' on':'')+'" data-v="'+n+'">'+n+'</button>';
        }
        var lo = (q.options && q.options.left_label) || 'Not likely at all';
        var hi = (q.options && q.options.right_label) || 'Extremely likely';
        html += '</div><div class="sv-nps-legend"><span>'+esc(lo)+'</span><span>'+esc(hi)+'</span></div></div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-nps button', function(b){
          b.addEventListener('click', function(){ state.answers[q.id] = parseInt(b.dataset.v,10); advance(); });
        })};
      }
      case 'scale': {
        var html = title+'<div class="sv-body"><div class="sv-nps">';
        for (var s=1;s<=10;s++) {
          var cls2 = s<=4 ? 'n-red' : (s<=7 ? 'n-amber' : 'n-green');
          html += '<button class="'+cls2+(v===s?' on':'')+'" data-v="'+s+'">'+s+'</button>';
        }
        html += '</div>';
        if (q.options && (q.options.left_label || q.options.right_label)) {
          html += '<div class="sv-nps-legend"><span>'+esc(q.options.left_label||'')+'</span><span>'+esc(q.options.right_label||'')+'</span></div>';
        }
        html += '</div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-nps button', function(b){
          b.addEventListener('click', function(){ state.answers[q.id] = parseInt(b.dataset.v,10); advance(); });
        })};
      }
      case 'boolean': {
        var html = title+'<div class="sv-body"><div class="sv-opts">'
          + '<button class="sv-opt'+(v===true?' on':'')+'" data-v="1"><span class="sv-em">👍</span> Yes</button>'
          + '<button class="sv-opt'+(v===false?' on':'')+'" data-v="0"><span class="sv-em">👎</span> No</button>'
          + '</div></div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-opt', function(b){
          b.addEventListener('click', function(){ state.answers[q.id] = b.dataset.v==='1'; advance(); });
        })};
      }
      case 'single_choice': {
        var html = title+'<div class="sv-body"><div class="sv-opts">';
        (q.options && q.options.choices || []).forEach(function(c){
          html += '<button class="sv-opt'+(v===c?' on':'')+'" data-v="'+esc(c)+'">'+esc(c)+'</button>';
        });
        html += '</div></div>';
        return { html:html, skippable:skippable, bind: tapBind('.sv-opt', function(b){
          b.addEventListener('click', function(){ state.answers[q.id] = b.dataset.v; advance(); });
        })};
      }
      case 'multi_choice': {
        var arr = Array.isArray(v) ? v : [];
        var html = title+'<div class="sv-body"><div class="sv-opts">';
        (q.options && q.options.choices || []).forEach(function(c){
          html += '<button class="sv-opt'+(arr.indexOf(c)>=0?' on':'')+'" data-v="'+esc(c)+'">'+esc(c)+'</button>';
        });
        html += '</div></div><button class="sv-next" id="sv-nextbtn">Continue</button>';
        return { html:html, skippable:skippable, bind:function(){
          document.querySelectorAll('.sv-opt').forEach(function(b){
            b.addEventListener('click', function(){
              var cur = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
              var val = b.dataset.v;
              if (cur.indexOf(val)>=0) cur = cur.filter(function(x){ return x !== val; });
              else cur.push(val);
              state.answers[q.id] = cur;
              b.classList.toggle('on');
            });
          });
          document.getElementById('sv-nextbtn').addEventListener('click', function(){
            if (q.required && !(state.answers[q.id]||[]).length) return showStepErr('Please pick at least one option.');
            state.step++; renderStepper();
          });
        }};
      }
      case 'textarea':
      case 'text': {
        var tag = q.kind === 'textarea'
          ? '<textarea class="sv-input" id="sv-free" placeholder="Type here…">'+esc(v||'')+'</textarea>'
          : '<input class="sv-input" id="sv-free" placeholder="Type here…" value="'+esc(v||'')+'">';
        var html = title+'<div class="sv-body">'+tag+'</div><button class="sv-next" id="sv-nextbtn">Continue</button>';
        return { html:html, skippable:skippable, bind:function(){
          var el = document.getElementById('sv-free');
          el.addEventListener('input', function(){ state.answers[q.id] = el.value; });
          if (!KIOSK) el.focus();
          document.getElementById('sv-nextbtn').addEventListener('click', function(){
            if (q.required && !String(state.answers[q.id]||'').trim()) return showStepErr('This one needs an answer.');
            state.step++; renderStepper();
          });
        }};
      }
    }
    return { html:title, skippable:true, bind:function(){} };
  }

  function showStepErr(msg){
    var el = document.getElementById('sv-err');
    if (el) { el.textContent = msg; el.style.display = 'inline-block'; }
  }

  function submitStepper(){
    if (state.submitting) return;
    state.submitting = true;
    app.innerHTML = '<div class="sv-screen"><div class="sv-title">Sending…</div></div>';
    doSubmit(function(res){
      var t = theme(), th = t.thanks || {};
      var resetSecs = Number((t.kiosk || {}).reset_seconds || 8);
      var html = '<div class="sv-screen"><div class="sv-check">✓</div>'
        + '<div class="sv-title">'+esc(th.title || 'Thank you!')+'</div>'
        + '<div class="sv-help">'+esc(th.message || res.thank_you_text || 'Your feedback helps us improve.')+'</div>';
      // External review redirect only makes sense where the guest owns
      // the browser — never on a shared kiosk.
      if (!KIOSK && res.redirect && res.redirect.options && res.redirect.options.length) {
        html += '<div class="sv-body"><div class="sv-opts">';
        res.redirect.options.forEach(function(opt){
          html += '<a class="sv-opt" style="text-decoration:none;justify-content:center" target="_blank" rel="noopener" href="'+esc(opt.url)+'" data-platform="'+esc(opt.platform)+'">Share on '+esc(opt.display_name)+'</a>';
        });
        html += '</div></div>';
      }
      html += '</div>';
      app.innerHTML = html;
      bindRedirectBeacons(res);
      if (KIOSK) setTimeout(function(){ resetState(); renderStepper(); }, resetSecs * 1000);
    }, function(msg){
      state.submitting = false;
      state.step = Math.max(0, visibleSteps().length - 1);
      renderStepper();
      showStepErr(msg);
    });
  }

  /* ═══ Shared submit ═════════════════════════════════════════════════ */

  function buildPayload(){
    var visibleAnswers = null;
    if (state.form.type === 'custom') {
      visibleAnswers = {};
      visibleQuestions().forEach(function(q){
        if (state.answers[q.id] !== undefined) visibleAnswers[q.id] = state.answers[q.id];
      });
    }
    var payload = {
      overall_rating: state.form.type==='basic' ? state.overall : null,
      comment: state.form.type==='basic' ? (state.comment||null) : null,
      answers: visibleAnswers,
    };
    if (MODE === 'kiosk') { payload.device_key = KEY.device; }
    else if (IN_IFRAME) { payload.channel = 'embed'; }
    var nameEl = document.getElementById('anon_name');
    var emailEl = document.getElementById('anon_email');
    if (nameEl) payload.anonymous_name = nameEl.value || null;
    if (emailEl) payload.anonymous_email = emailEl.value || null;
    return payload;
  }

  function doSubmit(onOk, onErr){
    var payload = buildPayload();
    var url = MODE==='token' ? API+'/v1/public/reviews/token/'+encodeURIComponent(KEY.token)
                              : API+'/v1/public/reviews/form/'+KEY.id+'?key='+encodeURIComponent(KEY.key);
    fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(payload),
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, body:j }; }); })
      .then(function(res){
        if (!res.ok) return onErr(res.body.message || 'Submission failed.');
        postParent({ event: 'review-submitted', submission_id: res.body.submission_id, rating: payload.overall_rating });
        onOk(res.body);
      })
      .catch(function(){ onErr('Network error. Please try again.'); });
  }

  function bindRedirectBeacons(res){
    document.querySelectorAll('[data-platform]').forEach(function(a){
      a.addEventListener('click', function(){
        postParent({ event: 'review-redirected', submission_id: res.submission_id, platform: a.dataset.platform });
        try {
          navigator.sendBeacon
            ? navigator.sendBeacon(API+'/v1/public/reviews/'+res.submission_id+'/redirected', new Blob([JSON.stringify({platform:a.dataset.platform})], {type:'application/json'}))
            : fetch(API+'/v1/public/reviews/'+res.submission_id+'/redirected',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:a.dataset.platform}),keepalive:true});
        } catch(e){}
      });
    });
  }

  /* Classic submit path (unchanged behavior) */
  function submit(){
    var err = validate();
    var errEl = document.getElementById('err');
    if (err) { errEl.textContent = err; errEl.style.display='block'; return; }
    errEl.style.display='none';
    state.submitting = true; render();

    doSubmit(function(res){
      renderThankYou(res);
      if (KIOSK) {
        setTimeout(function(){ resetState(); fetchForm(); }, 12000);
      }
    }, function(msg){
      state.submitting = false;
      render();
      var e2 = document.getElementById('err');
      if (e2) { e2.textContent = msg; e2.style.display='block'; }
    });
  }

  function renderThankYou(res){
    var html = '<div class="msg"><h2>Thank you!</h2><p>'+esc(res.thank_you_text||'Your feedback has been received.')+'</p></div>';
    if (res.redirect && res.redirect.options && res.redirect.options.length) {
      html += '<div><p style="text-align:center;font-weight:600;margin-bottom:10px">'+esc(res.redirect.prompt)+'</p>';
      html += '<div class="share-opts">';
      res.redirect.options.forEach(function(opt){
        html += '<a class="btn btn-outline" target="_blank" rel="noopener" href="'+esc(opt.url)+'" data-platform="'+esc(opt.platform)+'">Share on '+esc(opt.display_name)+'</a>';
      });
      html += '</div></div>';
    }
    app.innerHTML = html;
    bindRedirectBeacons(res);
  }

  fetchForm();
})();
</script>
</body>
</html>
