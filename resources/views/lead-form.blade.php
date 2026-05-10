<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ $design['title'] ?? $form->name }}</title>
  <style>
    :root {
      --primary: {{ $design['primary_color'] ?? '#22d3ee' }};
      --bg:        {{ $isDark ? '#0a0a0a' : '#ffffff' }};
      --surface:   {{ $isDark ? '#161616' : '#fafafa' }};
      --border:    {{ $isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }};
      --text:      {{ $isDark ? '#ffffff' : '#0a0a0a' }};
      --muted:     {{ $isDark ? '#a1a1aa' : '#6b7280' }};
      --error:     #ef4444;
      --success:   #10b981;
      --radius:    {{ ($design['corners'] ?? 'rounded') === 'sharp' ? '4px' : '12px' }};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 560px;
      margin: 0 auto;
      padding: 32px 20px;
    }
    .form-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
    }
    .header { margin-bottom: 24px; }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .header p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .field .required { color: var(--error); }
    .field input,
    .field select,
    .field textarea {
      width: 100%;
      padding: 11px 13px;
      font-size: 14px;
      font-family: inherit;
      color: var(--text);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) * 0.7);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px {{ ($design['primary_color'] ?? '#22d3ee') }}33;
    }
    .field textarea {
      resize: vertical;
      min-height: 96px;
    }
    .field .help {
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
    }
    .field .err {
      margin-top: 4px;
      font-size: 12px;
      color: var(--error);
      font-weight: 600;
    }
    .field input.has-error,
    .field select.has-error,
    .field textarea.has-error {
      border-color: var(--error);
    }
    .multi-select {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .multi-select label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
    }
    .multi-select label:has(input:checked) {
      background: var(--primary);
      color: {{ $isDark ? '#0a0a0a' : '#ffffff' }};
      border-color: var(--primary);
    }
    .multi-select input { display: none; }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .checkbox-row input[type="checkbox"] {
      width: 18px; height: 18px;
      accent-color: var(--primary);
    }
    .submit-btn {
      width: 100%;
      padding: 14px;
      margin-top: 8px;
      background: var(--primary);
      color: {{ $isDark ? '#0a0a0a' : '#ffffff' }};
      font-size: 15px;
      font-weight: 700;
      border: none;
      border-radius: calc(var(--radius) * 0.7);
      cursor: pointer;
      transition: filter 0.15s ease;
    }
    .submit-btn:hover { filter: brightness(1.08); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .footer {
      margin-top: 16px;
      font-size: 11px;
      color: var(--muted);
      text-align: center;
    }
    .success {
      text-align: center;
      padding: 32px 16px;
    }
    .success-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
      border-radius: 999px;
      background: var(--success);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
    }
    .success h2 {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 700;
    }
    .success p {
      margin: 0;
      color: var(--muted);
    }
    .error-banner {
      padding: 12px 14px;
      margin-bottom: 16px;
      background: {{ $isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)' }};
      border: 1px solid var(--error);
      border-radius: calc(var(--radius) * 0.7);
      color: var(--error);
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="form-card" id="form-card">
      <div id="form-content">
        <div class="header">
          <h1>{{ $design['title'] ?? 'Get in touch' }}</h1>
          @if(!empty($design['intro']))
            <p>{{ $design['intro'] }}</p>
          @endif
        </div>

        <div id="error-banner" class="error-banner" style="display: none;"></div>

        <form id="lead-form" novalidate>
          @foreach($visibleFields as $field)
            @php
              $key = $field['key'];
              $type = $field['type'];
              $required = !empty($field['required']);
              $label = $field['label'] ?? ucfirst($key);
              $placeholder = $field['placeholder'] ?? '';
              $options = $field['options'] ?? [];
              $help = $field['help_text'] ?? null;
              $isCustom = str_starts_with($key, 'custom:');
            @endphp
            <div class="field" data-field="{{ $key }}">
              @if($type === 'checkbox')
                <div class="checkbox-row">
                  <input type="checkbox" id="f-{{ $key }}" name="{{ $key }}" value="1" {{ $required ? 'required' : '' }}>
                  <label for="f-{{ $key }}">{{ $label }}@if($required)<span class="required">*</span>@endif</label>
                </div>
              @else
                <label for="f-{{ $key }}">{{ $label }}@if($required)<span class="required">*</span>@endif</label>
                @switch($type)
                  @case('textarea')
                    <textarea id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}></textarea>
                    @break
                  @case('select')
                    <select id="f-{{ $key }}" name="{{ $key }}" {{ $required ? 'required' : '' }}>
                      <option value="">— Select —</option>
                      @foreach($options as $opt)
                        <option value="{{ $opt }}">{{ $opt }}</option>
                      @endforeach
                    </select>
                    @break
                  @case('multiselect')
                    <div class="multi-select">
                      @foreach($options as $opt)
                        <label>
                          <input type="checkbox" name="{{ $key }}[]" value="{{ $opt }}">
                          {{ $opt }}
                        </label>
                      @endforeach
                    </div>
                    @break
                  @case('email')
                    <input type="email" id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}>
                    @break
                  @case('phone')
                    <input type="tel" id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}>
                    @break
                  @case('number')
                    <input type="number" id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}>
                    @break
                  @case('date')
                    <input type="date" id="f-{{ $key }}" name="{{ $key }}" {{ $required ? 'required' : '' }}>
                    @break
                  @case('url')
                    <input type="url" id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}>
                    @break
                  @default
                    <input type="text" id="f-{{ $key }}" name="{{ $key }}" placeholder="{{ $placeholder }}" {{ $required ? 'required' : '' }}>
                @endswitch
                @if($help)
                  <p class="help">{{ $help }}</p>
                @endif
              @endif
              <p class="err" id="err-{{ $key }}" style="display: none;"></p>
            </div>
          @endforeach

          <button type="submit" class="submit-btn" id="submit-btn">{{ $design['submit_text'] ?? 'Send' }}</button>
        </form>

        @if(!empty($design['show_privacy_link']))
          <p class="footer">
            By submitting this form, you agree to be contacted regarding your inquiry.
          </p>
        @endif
      </div>

      <div class="success" id="success-block" style="display: none;">
        <div class="success-icon">✓</div>
        <h2 id="success-title">{{ $design['success_title'] ?? 'Thanks!' }}</h2>
        <p id="success-message">{{ $design['success_message'] ?? "We've got your details and will be in touch soon." }}</p>
      </div>
    </div>
  </div>

  <script>
    (function () {
      const form = document.getElementById('lead-form');
      const submitBtn = document.getElementById('submit-btn');
      const formContent = document.getElementById('form-content');
      const successBlock = document.getElementById('success-block');
      const errorBanner = document.getElementById('error-banner');
      const submitUrl = @json($submitUrl);
      const originalBtnText = submitBtn.textContent;

      function clearErrors() {
        errorBanner.style.display = 'none';
        errorBanner.textContent = '';
        document.querySelectorAll('.err').forEach(el => { el.style.display = 'none'; el.textContent = ''; });
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
      }

      function showFieldError(key, msg) {
        const errEl = document.getElementById('err-' + key);
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        const inp = document.getElementById('f-' + key) || document.querySelector(`[name="${key}"]`);
        if (inp) inp.classList.add('has-error');
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        const fd = new FormData(form);
        const payload = {};
        for (const [k, v] of fd.entries()) {
          // Multi-selects come in as repeated fields with [] suffix
          if (k.endsWith('[]')) {
            const cleanKey = k.slice(0, -2);
            payload[cleanKey] = payload[cleanKey] || [];
            payload[cleanKey].push(v);
          } else {
            payload[k] = v;
          }
        }
        // Coerce checkbox booleans
        document.querySelectorAll('input[type="checkbox"]').forEach(c => {
          if (c.name && !c.name.endsWith('[]')) {
            payload[c.name] = c.checked;
          }
        });

        try {
          const res = await fetch(submitUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json();
            document.getElementById('success-title').textContent = data.success_title || 'Thanks!';
            document.getElementById('success-message').textContent = data.success_message || '';
            formContent.style.display = 'none';
            successBlock.style.display = 'block';
            // If embedded in iframe, scroll parent to top so user sees the success.
            try {
              window.parent.postMessage({ type: 'lead-form:submitted', formKey: @json($form->embed_key) }, '*');
            } catch (e) { /* ignore cross-origin */ }
            return;
          }

          if (res.status === 422) {
            const body = await res.json();
            if (body.errors && typeof body.errors === 'object') {
              for (const [k, msgs] of Object.entries(body.errors)) {
                if (Array.isArray(msgs) && msgs.length > 0) showFieldError(k, msgs[0]);
              }
            }
            errorBanner.textContent = 'Please fix the highlighted fields and try again.';
            errorBanner.style.display = 'block';
            return;
          }

          const body = await res.json().catch(() => ({}));
          errorBanner.textContent = body.message || 'Something went wrong. Please try again.';
          errorBanner.style.display = 'block';
        } catch (err) {
          errorBanner.textContent = 'Network error. Please try again.';
          errorBanner.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      });
    })();
  </script>
</body>
</html>
