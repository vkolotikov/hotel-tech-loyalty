/**
 * Hotel Tech — Embeddable AI Chat Widget
 * Drop-in chat widget with voice support for hotel websites.
 *
 * Usage: Set window.HotelChat = { key, api } before loading this script.
 * The embed code from the admin panel does this automatically.
 */
(function () {
  'use strict';

  var cfg = window.HotelChat || {};
  if (!cfg.key || !cfg.api) { console.warn('HotelChat: missing key or api'); return; }

  var API = cfg.api;
  var sessionId = null;
  var messages = [];
  var widgetConfig = null;

  // ── Feature detection ──
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var hasSTT = !!SpeechRecognition;
  var hasTTS = 'speechSynthesis' in window;

  // ── State ──
  var isOpen = false;
  var isLoading = false;
  var isListening = false;
  var isSpeaking = false;
  var ttsEnabled = false;
  var recognition = null;

  // ── Styles ──
  var STYLES = '\
    #htchat-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\
    #htchat-launcher { position: fixed; z-index: 99998; width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(0,0,0,0.25); transition: transform 0.2s, box-shadow 0.2s; }\
    #htchat-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }\
    #htchat-launcher svg { width: 24px; height: 24px; fill: white; }\
    #htchat-launcher .htchat-pulse { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: #22c55e; border-radius: 50%; border: 2px solid white; }\
    #htchat-panel { position: fixed; z-index: 99999; width: 380px; height: 560px; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); transition: opacity 0.25s, transform 0.25s; background: #fff; }\
    #htchat-panel.hidden { opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none; }\
    #htchat-header { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; color: white; flex-shrink: 0; }\
    #htchat-header-left { display: flex; align-items: center; gap: 10px; }\
    #htchat-header-avatar { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }\
    #htchat-header-avatar svg { width: 18px; height: 18px; fill: white; }\
    #htchat-header-info h3 { font-size: 14px; font-weight: 600; }\
    #htchat-header-info p { font-size: 11px; opacity: 0.8; }\
    #htchat-header-actions { display: flex; gap: 4px; }\
    #htchat-header-actions button { background: rgba(255,255,255,0.15); border: none; color: white; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }\
    #htchat-header-actions button:hover { background: rgba(255,255,255,0.25); }\
    #htchat-header-actions button.active { background: rgba(255,255,255,0.3); }\
    #htchat-header-actions button svg { width: 14px; height: 14px; fill: currentColor; }\
    #htchat-messages { flex: 1; overflow-y: auto; padding: 16px; background: #f9fafb; }\
    .htchat-msg { margin-bottom: 12px; display: flex; gap: 8px; }\
    .htchat-msg.user { justify-content: flex-end; }\
    .htchat-msg-bubble { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5; word-wrap: break-word; }\
    .htchat-msg.assistant .htchat-msg-bubble { background: white; color: #1f2937; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }\
    .htchat-msg.user .htchat-msg-bubble { color: white; border-bottom-right-radius: 4px; }\
    .htchat-msg-bubble strong { font-weight: 600; }\
    .htchat-welcome { text-align: center; padding: 30px 20px; }\
    .htchat-welcome-icon { width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; }\
    .htchat-welcome-icon svg { width: 26px; height: 26px; }\
    .htchat-welcome h3 { font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 6px; }\
    .htchat-welcome p { font-size: 12px; color: #6b7280; max-width: 260px; margin: 0 auto; }\
    .htchat-suggestions { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }\
    .htchat-suggestion { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #4b5563; text-align: left; cursor: pointer; transition: all 0.15s; }\
    .htchat-suggestion:hover { border-color: currentColor; color: #1f2937; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\
    #htchat-input-area { padding: 12px; border-top: 1px solid #e5e7eb; background: white; flex-shrink: 0; }\
    #htchat-input-row { display: flex; gap: 8px; align-items: flex-end; }\
    #htchat-input { flex: 1; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 14px; font-size: 13px; resize: none; outline: none; min-height: 40px; max-height: 80px; transition: border-color 0.2s; }\
    #htchat-input:focus { border-color: currentColor; }\
    #htchat-input::placeholder { color: #9ca3af; }\
    #htchat-send-btn, #htchat-mic-btn { width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }\
    #htchat-send-btn { color: white; }\
    #htchat-send-btn:disabled { opacity: 0.4; cursor: default; }\
    #htchat-send-btn svg, #htchat-mic-btn svg { width: 16px; height: 16px; fill: currentColor; }\
    #htchat-mic-btn { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }\
    #htchat-mic-btn:hover { color: #1f2937; border-color: #d1d5db; }\
    #htchat-mic-btn.recording { background: #ef4444; color: white; border-color: #ef4444; animation: htchat-pulse-mic 1.5s ease-in-out infinite; }\
    @keyframes htchat-pulse-mic { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }\
    #htchat-input-hint { font-size: 10px; color: #9ca3af; margin-top: 4px; padding: 0 4px; display: flex; justify-content: space-between; }\
    #htchat-input-hint .recording-hint { color: #ef4444; display: flex; align-items: center; gap: 4px; }\
    #htchat-input-hint .recording-dot { width: 6px; height: 6px; background: #ef4444; border-radius: 50%; animation: htchat-pulse-mic 1s ease-in-out infinite; }\
    .htchat-typing { display: flex; gap: 4px; padding: 4px 0; }\
    .htchat-typing span { width: 6px; height: 6px; border-radius: 50%; animation: htchat-bounce 1.4s ease-in-out infinite; }\
    .htchat-typing span:nth-child(2) { animation-delay: 0.2s; }\
    .htchat-typing span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes htchat-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }\
    @media (max-width: 480px) { #htchat-panel { width: calc(100vw - 20px); height: calc(100vh - 80px); right: 10px !important; bottom: 70px !important; border-radius: 12px; } }\
  ';

  // ── SVG Icons ──
  var ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    volumeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.91 5.63L20 10.5l-4.69 3.19L16.82 20 12 16.5 7.18 20l1.51-6.31L4 10.5l6.09-1.87z"/></svg>',
  };

  // ── Init ──
  function init() {
    injectStyles();
    createLauncher();
    createPanel();
    loadConfig();
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function getColor() {
    return (widgetConfig && widgetConfig.primary_color) || cfg.color || '#c9a84c';
  }

  function getPosition() {
    var pos = (widgetConfig && widgetConfig.position) || 'bottom-right';
    return pos === 'bottom-left'
      ? { bottom: '20px', left: '20px', right: 'auto' }
      : { bottom: '20px', right: '20px', left: 'auto' };
  }

  // ── Launcher ──
  function createLauncher() {
    var btn = document.createElement('button');
    btn.id = 'htchat-launcher';
    btn.innerHTML = ICONS.chat + '<span class="htchat-pulse"></span>';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
    applyPosition(btn);
  }

  function applyPosition(el) {
    var pos = getPosition();
    el.style.bottom = pos.bottom;
    el.style.left = pos.left;
    el.style.right = pos.right;
  }

  function applyColor() {
    var color = getColor();
    var launcher = document.getElementById('htchat-launcher');
    if (launcher) launcher.style.background = color;
    var header = document.getElementById('htchat-header');
    if (header) header.style.background = color;
    var sendBtn = document.getElementById('htchat-send-btn');
    if (sendBtn) sendBtn.style.background = color;
    var input = document.getElementById('htchat-input');
    if (input) input.style.color = color;
    // Suggestion hover
    document.querySelectorAll('.htchat-suggestion').forEach(function (s) { s.style.borderColor = ''; });
  }

  // ── Panel ──
  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'htchat-panel';
    panel.className = 'hidden';

    // Position
    var pos = getPosition();
    panel.style.bottom = '86px';
    panel.style.left = pos.left === 'auto' ? 'auto' : pos.left;
    panel.style.right = pos.right === 'auto' ? 'auto' : pos.right;

    panel.innerHTML = '\
      <div id="htchat-header">\
        <div id="htchat-header-left">\
          <div id="htchat-header-avatar">' + ICONS.sparkles + '</div>\
          <div id="htchat-header-info"><h3>AI Assistant</h3><p>Ask me anything</p></div>\
        </div>\
        <div id="htchat-header-actions">\
          ' + (hasTTS ? '<button id="htchat-tts-btn" title="Toggle voice responses">' + ICONS.volumeOff + '</button>' : '') + '\
          <button id="htchat-close-btn">' + ICONS.close + '</button>\
        </div>\
      </div>\
      <div id="htchat-messages"></div>\
      <div id="htchat-input-area">\
        <div id="htchat-input-row">\
          ' + (hasSTT ? '<button id="htchat-mic-btn" title="Voice input">' + ICONS.mic + '</button>' : '') + '\
          <textarea id="htchat-input" placeholder="Type a message…" rows="1"></textarea>\
          <button id="htchat-send-btn" disabled>' + ICONS.send + '</button>\
        </div>\
        <div id="htchat-input-hint"><span>Press Enter to send</span></div>\
      </div>\
    ';

    document.body.appendChild(panel);
    applyColor();

    // Events
    document.getElementById('htchat-close-btn').onclick = togglePanel;
    document.getElementById('htchat-send-btn').onclick = function () { sendMessage(); };
    var inputEl = document.getElementById('htchat-input');
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', function () {
      document.getElementById('htchat-send-btn').disabled = !inputEl.value.trim() || isLoading;
    });

    if (hasSTT) {
      document.getElementById('htchat-mic-btn').onclick = toggleListening;
    }
    if (hasTTS) {
      document.getElementById('htchat-tts-btn').onclick = toggleTTS;
    }

    renderMessages();
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('htchat-panel');
    var launcher = document.getElementById('htchat-launcher');
    if (isOpen) {
      panel.classList.remove('hidden');
      launcher.style.display = 'none';
      if (!sessionId) initSession();
      setTimeout(function () { document.getElementById('htchat-input').focus(); }, 100);
    } else {
      panel.classList.add('hidden');
      launcher.style.display = 'flex';
      stopSpeaking();
    }
  }

  // ── Config ──
  function loadConfig() {
    fetch(API + '/config').then(function (r) { return r.json(); }).then(function (data) {
      widgetConfig = data;
      applyColor();
      if (data.company_name) {
        var h3 = document.querySelector('#htchat-header-info h3');
        if (h3) h3.textContent = data.company_name;
      }
      if (data.welcome_message) renderMessages();
    }).catch(function () {});
  }

  function initSession() {
    if (sessionId) return;
    fetch(API + '/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (data) { sessionId = data.session_id; })
      .catch(function () {});
  }

  // ── Messages ──
  function renderMessages() {
    var container = document.getElementById('htchat-messages');
    if (!container) return;

    if (messages.length === 0) {
      var welcome = widgetConfig && widgetConfig.welcome_message ? widgetConfig.welcome_message : 'Hi! How can I help you today?';
      var suggestions = [
        'What services do you offer?',
        'I want to check my booking',
        'Tell me about loyalty rewards',
      ];
      container.innerHTML = '\
        <div class="htchat-welcome">\
          <div class="htchat-welcome-icon" style="background:' + getColor() + '22;color:' + getColor() + '">' + ICONS.sparkles + '</div>\
          <h3>' + escapeHtml(welcome) + '</h3>\
          <p>Ask about reservations, loyalty program, hotel services, or anything else.' +
          (hasSTT ? ' <span style="color:' + getColor() + '">You can also use voice input.</span>' : '') +
          '</p>\
          <div class="htchat-suggestions">' +
            suggestions.map(function (s) {
              return '<button class="htchat-suggestion" onclick="document.getElementById(\'htchat-input\').value=\'' + escapeHtml(s) + '\';document.getElementById(\'htchat-send-btn\').disabled=false;document.getElementById(\'htchat-send-btn\').click()">' + escapeHtml(s) + '</button>';
            }).join('') +
          '</div>\
        </div>';
      return;
    }

    container.innerHTML = messages.map(function (m) {
      return '<div class="htchat-msg ' + m.role + '"><div class="htchat-msg-bubble" style="' +
        (m.role === 'user' ? 'background:' + getColor() : '') +
        '">' + formatText(m.content) + '</div></div>';
    }).join('');

    if (isLoading) {
      container.innerHTML += '<div class="htchat-msg assistant"><div class="htchat-msg-bubble"><div class="htchat-typing">' +
        '<span style="background:' + getColor() + '"></span><span style="background:' + getColor() + '"></span><span style="background:' + getColor() + '"></span>' +
        '</div></div></div>';
    }

    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(text) {
    var inputEl = document.getElementById('htchat-input');
    var msg = text || (inputEl && inputEl.value.trim());
    if (!msg || isLoading) return;

    stopSpeaking();
    messages.push({ role: 'user', content: msg });
    if (inputEl) inputEl.value = '';
    document.getElementById('htchat-send-btn').disabled = true;
    isLoading = true;
    renderMessages();

    fetch(API + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: msg }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var reply = data.response || data.message || 'Sorry, I could not process that.';
        messages.push({ role: 'assistant', content: reply });
        isLoading = false;
        renderMessages();
        if (ttsEnabled) speak(reply);
      })
      .catch(function () {
        messages.push({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
        isLoading = false;
        renderMessages();
      });
  }

  // ── Voice: STT ──
  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function startListening() {
    if (!hasSTT || isListening) return;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    var finalTranscript = '';

    recognition.onstart = function () {
      isListening = true;
      var btn = document.getElementById('htchat-mic-btn');
      if (btn) { btn.className = 'recording'; btn.innerHTML = ICONS.micOff; }
      var hint = document.getElementById('htchat-input-hint');
      if (hint) hint.innerHTML = '<span class="recording-hint"><span class="recording-dot"></span>Listening… tap mic to stop</span>';
      var inputEl = document.getElementById('htchat-input');
      if (inputEl) { inputEl.placeholder = 'Listening…'; inputEl.style.borderColor = '#ef4444'; }
    };

    recognition.onresult = function (e) {
      finalTranscript = '';
      var interim = '';
      for (var i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      var inputEl = document.getElementById('htchat-input');
      if (inputEl) {
        inputEl.value = finalTranscript || interim;
        document.getElementById('htchat-send-btn').disabled = !(finalTranscript || interim).trim();
      }
    };

    recognition.onend = function () {
      isListening = false;
      recognition = null;
      resetMicUI();
      if (finalTranscript.trim()) {
        setTimeout(function () { sendMessage(finalTranscript.trim()); }, 150);
      }
    };

    recognition.onerror = function (e) {
      if (e.error !== 'aborted') console.warn('HotelChat STT error:', e.error);
      isListening = false;
      recognition = null;
      resetMicUI();
    };

    recognition.start();
  }

  function stopListening() {
    if (recognition) try { recognition.stop(); } catch (e) {}
  }

  function resetMicUI() {
    var btn = document.getElementById('htchat-mic-btn');
    if (btn) { btn.className = ''; btn.innerHTML = ICONS.mic; }
    var hint = document.getElementById('htchat-input-hint');
    if (hint) hint.innerHTML = '<span>Press Enter to send</span>';
    var inputEl = document.getElementById('htchat-input');
    if (inputEl) { inputEl.placeholder = 'Type a message…'; inputEl.style.borderColor = ''; }
  }

  // ── Voice: TTS ──
  function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) stopSpeaking();
    var btn = document.getElementById('htchat-tts-btn');
    if (btn) {
      btn.innerHTML = ttsEnabled ? ICONS.volume : ICONS.volumeOff;
      btn.className = ttsEnabled ? 'active' : '';
    }
  }

  function speak(text) {
    if (!hasTTS || !ttsEnabled) return;
    speechSynthesis.cancel();
    var cleaned = text.replace(/#{1,3}\s/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/[-•*]\s+/g, '').replace(/\d+[.)]\s+/g, '').trim();
    var sentences = cleaned.match(/[^.!?\n]+[.!?\n]?/g) || [cleaned];
    var chunks = [];
    var cur = '';
    for (var i = 0; i < sentences.length; i++) {
      if ((cur + sentences[i]).length > 200) {
        if (cur) chunks.push(cur.trim());
        cur = sentences[i];
      } else { cur += sentences[i]; }
    }
    if (cur.trim()) chunks.push(cur.trim());

    isSpeaking = true;
    var idx = 0;
    function next() {
      if (idx >= chunks.length) { isSpeaking = false; return; }
      var utt = new SpeechSynthesisUtterance(chunks[idx]);
      utt.rate = 1.05;
      var voices = speechSynthesis.getVoices();
      var pref = voices.find(function (v) { return v.name.indexOf('Google') > -1 && v.lang.indexOf('en') === 0; })
        || voices.find(function (v) { return v.lang.indexOf('en') === 0; });
      if (pref) utt.voice = pref;
      utt.onend = function () { idx++; next(); };
      utt.onerror = function () { idx++; next(); };
      speechSynthesis.speak(utt);
    }
    next();
  }

  function stopSpeaking() {
    if (hasTTS) speechSynthesis.cancel();
    isSpeaking = false;
  }

  // ── Helpers ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
