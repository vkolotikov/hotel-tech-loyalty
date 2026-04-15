<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d0d0d; color: #e5e5e5; margin: 0; padding: 40px 20px; }
        .container { max-width: 520px; margin: 0 auto; background: #1a1a1f; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
        .header { background: linear-gradient(135deg, #b8942e, #c9a84c); padding: 36px 32px; text-align: center; }
        .header h1 { margin: 0 0 4px; font-size: 24px; color: #0d0d0d; font-weight: 800; }
        .header p { margin: 0; font-size: 14px; color: rgba(13,13,13,0.8); font-weight: 600; }
        .body { padding: 32px; }
        h2 { color: #e5e5e5; margin: 0 0 12px; font-size: 18px; }
        p { color: #a0a0a0; font-size: 14px; line-height: 1.65; margin: 0 0 14px; }
        .card { background: #0d0d0d; border: 1px solid rgba(201,168,76,0.25); border-radius: 12px; padding: 18px; margin: 18px 0; }
        .card-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
        .card-label { color: #636366; }
        .card-value { color: #e5e5e5; font-weight: 600; font-family: monospace; }
        .code-box { background: #0d0d0d; border: 2px solid #c9a84c; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
        .code-box-label { font-size: 12px; color: #636366; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .code { font-size: 34px; letter-spacing: 8px; font-weight: 700; color: #c9a84c; font-family: monospace; }
        ol { padding-left: 20px; color: #a0a0a0; font-size: 14px; line-height: 1.8; }
        ol li { margin-bottom: 6px; }
        .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
        .footer p { font-size: 12px; color: #636366; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome{{ $memberName ? ', ' . explode(' ', $memberName)[0] : '' }}!</h1>
            <p>{{ $hotelName }} Loyalty Program</p>
        </div>
        <div class="body">
            <p>Your loyalty membership has been created. You can now earn points on every stay and unlock exclusive benefits.</p>

            <div class="card">
                <div class="card-row" style="margin-bottom: 10px;">
                    <span class="card-label">Member number</span>
                    <span class="card-value">{{ $memberNumber }}</span>
                </div>
                <div class="card-row" style="margin-bottom: 10px;">
                    <span class="card-label">Tier</span>
                    <span class="card-value">{{ $tierName }}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Email</span>
                    <span class="card-value">{{ $email }}</span>
                </div>
            </div>

            <h2>Set your password</h2>
            <p>To access your account, use the code below to set your password. This code is valid for <strong>48 hours</strong>.</p>

            <div class="code-box">
                <div class="code-box-label">Your Setup Code</div>
                <div class="code">{{ $code }}</div>
            </div>

            <ol>
                <li>Download the <strong>{{ $hotelName }}</strong> app (or open the member portal)</li>
                <li>Tap <strong>"Forgot password"</strong> on the login screen</li>
                <li>Enter your email: <strong>{{ $email }}</strong></li>
                <li>Enter the 6-digit code above and choose your new password</li>
            </ol>

            <p style="margin-top: 20px; font-size: 13px; color: #636366;">If you didn't expect this email, please ignore it — your account will remain inaccessible without the code.</p>
        </div>
        <div class="footer">
            <p>&copy; {{ date('Y') }} {{ $hotelName }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
