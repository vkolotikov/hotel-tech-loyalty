<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Share your feedback</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
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
.star-btn{background:none;border:none;padding:2px;font-size:34px;line-height:1;color:#d4d4d4;transition:transform .1s}
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

  var app = document.getElementById('app');
  var state = { form:null, invitation:null, integrations:[], prefill:{}, answers:{}, overall:null, nps:null, comment:'', submitting:false };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]}); }

  function fetchForm(){
    var url = MODE==='token' ? API+'/v1/public/reviews/token/'+encodeURIComponent(KEY.token)
                              : API+'/v1/public/reviews/form/'+KEY.id+'?key='+encodeURIComponent(KEY.key);
    fetch(url).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, status:r.status, body:j }; }); })
      .then(function(res){
        if (!res.ok) {
          if (res.status === 410) return renderMessage('Link expired','This review link has expired.');
          return renderMessage('Not found', res.body.message || 'This review could not be loaded.');
        }
        if (res.body.status === 'submitted') return renderMessage('Already submitted','Thanks — we already have your feedback.');
        state.form = res.body.form;
        state.invitation = res.body.invitation || null;
        state.integrations = res.body.integrations || [];
        state.prefill = (res.body.invitation && res.body.invitation.prefill) || {};
        render();
      })
      .catch(function(){ renderMessage('Error','Could not load the form. Please try again.'); });
  }

  function renderMessage(title, body){
    app.innerHTML = '<div class="msg"><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p></div>';
  }

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
      (f.questions||[]).forEach(function(q){ html += renderQuestion(q); });
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
    (f.questions||[]).forEach(function(q){
      if (miss || !q.required) return;
      var v = state.answers[q.id];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) miss = 'Please answer: '+q.label;
    });
    return miss;
  }

  function submit(){
    var err = validate();
    var errEl = document.getElementById('err');
    if (err) { errEl.textContent = err; errEl.style.display='block'; return; }
    errEl.style.display='none';
    state.submitting = true; render();

    var payload = {
      overall_rating: state.form.type==='basic' ? state.overall : null,
      comment: state.form.type==='basic' ? (state.comment||null) : null,
      answers: state.form.type==='custom' ? state.answers : null,
    };
    var nameEl = document.getElementById('anon_name');
    var emailEl = document.getElementById('anon_email');
    if (nameEl) payload.anonymous_name = nameEl.value || null;
    if (emailEl) payload.anonymous_email = emailEl.value || null;

    var url = MODE==='token' ? API+'/v1/public/reviews/token/'+encodeURIComponent(KEY.token)
                              : API+'/v1/public/reviews/form/'+KEY.id+'?key='+encodeURIComponent(KEY.key);
    fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(payload),
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, body:j }; }); })
      .then(function(res){
        state.submitting = false;
        if (!res.ok) {
          errEl.textContent = res.body.message || 'Submission failed.';
          errEl.style.display='block';
          render();
          return;
        }
        renderThankYou(res.body);
      })
      .catch(function(){
        state.submitting = false;
        errEl.textContent = 'Network error. Please try again.';
        errEl.style.display='block';
        render();
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
    document.querySelectorAll('[data-platform]').forEach(function(a){
      a.addEventListener('click', function(){
        try {
          navigator.sendBeacon
            ? navigator.sendBeacon(API+'/v1/public/reviews/'+res.submission_id+'/redirected', new Blob([JSON.stringify({platform:a.dataset.platform})], {type:'application/json'}))
            : fetch(API+'/v1/public/reviews/'+res.submission_id+'/redirected',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:a.dataset.platform}),keepalive:true});
        } catch(e){}
      });
    });
  }

  fetchForm();
})();
</script>
</body>
</html>
