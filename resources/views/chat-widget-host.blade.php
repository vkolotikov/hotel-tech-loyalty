<!DOCTYPE html>
<html lang="{{ $lang }}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="format-detection" content="telephone=no">
  <title>Chat</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      background: #0a0a0a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    /* Override the embedded widget's fixed positioning so the chat panel
       fills the entire WebView viewport, not just the bottom-right corner. */
    #htchat-launcher { display: none !important; }
    #htchat-panel {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .htchat-loading {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: #888;
      font-size: 13px;
    }
    .htchat-loading .spin {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: {{ $color }};
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="htchat-loading" id="htchat-bootstrap">
    <div class="spin"></div>
    <div>Loading chat…</div>
  </div>

  <script>
    window.HotelChat = {
      key: @json($widgetKey),
      api: @json($apiBase)
    };
    window.HotelChatConfig = { lang: @json($lang) };

    // Prefill member identity so the conversation is auto-linked to the
    // signed-in app user without making them type their contact details.
    var __PREFILL = {
      name:  @json($prefillName),
      email: @json($prefillEmail),
      phone: @json($prefillPhone)
    };

    // Auto-open the chat panel once the widget is mounted so the WebView
    // looks like a chat screen, not a website with a chat bubble.
    function bootstrapChat() {
      var loader = document.getElementById('htchat-bootstrap');
      var launcher = document.getElementById('htchat-launcher');
      var panel = document.getElementById('htchat-panel');

      if (!launcher || !panel) {
        // Widget not ready yet — try again shortly.
        setTimeout(bootstrapChat, 100);
        return;
      }

      // Trigger the widget's own toggle so it does its session init + polling.
      try { launcher.click(); } catch (e) {}
      if (loader) loader.style.display = 'none';

      // Pre-capture lead identity so the inbox sees a real visitor, not
      // "Anonymous". Best-effort, fire-and-forget, deduplicated per
      // (widget_key, email) so re-opening the screen doesn't create
      // duplicate inquiries — a single inquiry per member is enough to
      // tie the conversation to them in the staff inbox.
      if (__PREFILL.name || __PREFILL.email || __PREFILL.phone) {
        var leadKey = 'htchat_lead_done_' + @json($widgetKey) + '_' + (__PREFILL.email || __PREFILL.phone || __PREFILL.name);
        var alreadyDone = false;
        try { alreadyDone = localStorage.getItem(leadKey) === '1'; } catch (e) {}
        if (!alreadyDone) {
          setTimeout(function () {
            try {
              var sid = null;
              try {
                var k = 'htchat_session_' + @json($widgetKey);
                sid = localStorage.getItem(k);
              } catch (e) {}
              if (!sid) return;
              fetch(@json($apiBase) + '/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: sid,
                  name:  __PREFILL.name  || null,
                  email: __PREFILL.email || null,
                  phone: __PREFILL.phone || null
                })
              }).then(function () {
                try { localStorage.setItem(leadKey, '1'); } catch (e) {}
              }).catch(function () {});
            } catch (e) {}
          }, 1500);
        }
      }
    }

    var s = document.createElement('script');
    s.src = @json($scriptSrc);
    s.async = true;
    s.onload = function () { setTimeout(bootstrapChat, 50); };
    s.onerror = function () {
      var l = document.getElementById('htchat-bootstrap');
      if (l) l.innerHTML = '<div style="color:#ff6b6b;font-size:13px;text-align:center;padding:20px">Could not load chat. Please check your connection and try again.</div>';
    };
    document.head.appendChild(s);
  </script>
</body>
</html>
