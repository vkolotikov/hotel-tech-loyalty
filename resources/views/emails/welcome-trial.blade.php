<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d0d0d; color: #e5e5e5; margin: 0; padding: 40px 20px; }
        .container { max-width: 520px; margin: 0 auto; background: #1a1a1f; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
        .header { background: linear-gradient(135deg, #b8942e, #c9a84c); padding: 32px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #0d0d0d; font-weight: 700; }
        .header p { margin: 8px 0 0; font-size: 13px; color: rgba(0,0,0,0.6); }
        .body { padding: 32px; }
        p { color: #a0a0a0; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
        .highlight { color: #c9a84c; font-weight: 600; }
        .steps { margin: 24px 0; padding: 0; list-style: none; }
        .steps li { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .steps li:last-child { border-bottom: none; }
        .step-num { flex-shrink: 0; width: 28px; height: 28px; background: rgba(201,168,76,0.15); color: #c9a84c; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
        .step-text { color: #d0d0d0; font-size: 14px; line-height: 1.5; }
        .step-text strong { color: #ffffff; }
        .cta { display: block; background: linear-gradient(135deg, #b8942e, #c9a84c); color: #0d0d0d; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 24px; border-radius: 12px; text-align: center; margin: 28px 0 16px; }
        .trial-badge { background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.2); border-radius: 10px; padding: 14px 18px; text-align: center; margin: 20px 0; }
        .trial-badge span { color: #c9a84c; font-size: 13px; font-weight: 600; }
        .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
        .footer p { font-size: 12px; color: #636366; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Hotel Tech</h1>
            <p>Your account is ready</p>
        </div>
        <div class="body">
            <p>Hi {{ $userName }},</p>
            <p>Your account for <span class="highlight">{{ $hotelName }}</span> has been created successfully. Here's how to get started:</p>

            <ul class="steps">
                <li>
                    <div class="step-num">1</div>
                    <div class="step-text"><strong>Complete the Setup Wizard</strong> — configure your property details, branding, and basic settings</div>
                </li>
                <li>
                    <div class="step-num">2</div>
                    <div class="step-text"><strong>Connect your PMS</strong> — go to Settings &rarr; Integrations to link Smoobu, Cloudbeds, or your preferred system</div>
                </li>
                <li>
                    <div class="step-num">3</div>
                    <div class="step-text"><strong>Import or add guests</strong> — start building your guest database and loyalty program</div>
                </li>
                <li>
                    <div class="step-num">4</div>
                    <div class="step-text"><strong>Set up your chat widget</strong> — embed the AI chatbot on your website to engage visitors 24/7</div>
                </li>
            </ul>

            <div class="trial-badge">
                <span>{{ $planName }} Plan &bull; {{ $trialDays }}-day free trial</span>
            </div>

            <a href="{{ $loginUrl }}" class="cta">Open Your Dashboard</a>

            <p>Need help? Use the AI assistant in your dashboard — just click the chat icon in the bottom-right corner.</p>
        </div>
        <div class="footer">
            <p>&copy; {{ date('Y') }} Hotel Tech &mdash; hotel-tech.ai</p>
        </div>
    </div>
</body>
</html>
