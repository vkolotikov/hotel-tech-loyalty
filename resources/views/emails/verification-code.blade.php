<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d0d0d; color: #e5e5e5; margin: 0; padding: 40px 20px; }
        .container { max-width: 480px; margin: 0 auto; background: #1a1a1f; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
        .header { background: linear-gradient(135deg, #b8942e, #c9a84c); padding: 32px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #0d0d0d; font-weight: 700; }
        .body { padding: 32px; }
        .code-box { background: #0d0d0d; border: 2px solid #c9a84c; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .code { font-size: 36px; letter-spacing: 8px; font-weight: 700; color: #c9a84c; font-family: monospace; }
        p { color: #a0a0a0; font-size: 14px; line-height: 1.6; margin: 0 0 12px; }
        .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
        .footer p { font-size: 12px; color: #636366; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Hotel Loyalty Platform</h1>
        </div>
        <div class="body">
            <p>Hi{{ $userName ? ' ' . $userName : '' }},</p>
            <p>Enter this verification code to complete your registration:</p>
            <div class="code-box">
                <div class="code">{{ $code }}</div>
            </div>
            <p>This code expires in <strong>15 minutes</strong>.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">
            <p>&copy; {{ date('Y') }} Hotel Loyalty Platform</p>
        </div>
    </div>
</body>
</html>
