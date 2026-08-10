<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Email preferences</title>
    <style>
        :root {
            color-scheme: light dark;
            --bg: #f6f6f7;
            --card: #ffffff;
            --text: #1a1a1a;
            --muted: #6b6b70;
            --border: #e4e4e7;
            --accent: #b8953f;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0d0d0d;
                --card: #161616;
                --text: #f5f5f5;
                --muted: #9a9aa0;
                --border: #2c2c2c;
                --accent: #d4b65c;
            }
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.55;
        }
        .card {
            width: 100%;
            max-width: 460px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px;
            text-align: center;
        }
        .mark {
            width: 48px; height: 48px;
            margin: 0 auto 20px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px;
            background: color-mix(in srgb, var(--accent) 15%, transparent);
        }
        h1 { font-size: 20px; margin: 0 0 10px; letter-spacing: -0.01em; }
        p  { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
        .email { color: var(--text); font-weight: 600; word-break: break-all; }
        form { margin-top: 24px; }
        button {
            font: inherit;
            font-size: 14px;
            font-weight: 600;
            color: var(--text);
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 10px 18px;
            cursor: pointer;
        }
        button:hover { border-color: var(--accent); color: var(--accent); }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .note { margin-top: 20px; font-size: 12px; color: var(--muted); }
    </style>
</head>
<body>
    <div class="card">
        @if ($state === 'done')
            <div class="mark">✓</div>
            <h1>You've been unsubscribed</h1>
            @if (!empty($email))
                <p><span class="email">{{ $email }}</span></p>
            @endif
            <p>You won't receive any more marketing emails from {{ $orgName }}.</p>
            <p>You'll still get service messages about your account, such as password resets and reward confirmations.</p>

            <form method="POST" action="{{ url('/unsubscribe/' . $token . '/resubscribe') }}">
                @csrf
                <button type="submit">This was a mistake — resubscribe me</button>
            </form>

        @elseif ($state === 'resubscribed')
            <div class="mark">✓</div>
            <h1>You're subscribed again</h1>
            @if (!empty($email))
                <p><span class="email">{{ $email }}</span></p>
            @endif
            <p>Marketing emails from {{ $orgName }} will resume.</p>

        @else
            <div class="mark">?</div>
            <h1>Link not recognised</h1>
            <p>This unsubscribe link is invalid or has already been replaced.</p>
            <p class="note">If you keep receiving emails you don't want, reply to any of them and we'll remove you.</p>
        @endif
    </div>
</body>
</html>
