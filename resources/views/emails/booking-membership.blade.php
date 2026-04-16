<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Your Membership</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }

        body {
            margin: 0; padding: 0; width: 100%; min-width: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #080808;
            color: #d4d4d4;
            -webkit-font-smoothing: antialiased;
        }

        .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }

        .card {
            background: #111113;
            border-radius: 20px;
            border: 1px solid rgba(201, 168, 76, 0.08);
            overflow: hidden;
            box-shadow: 0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02);
        }

        .header {
            background: linear-gradient(145deg, #1a1610 0%, #111113 100%);
            padding: 44px 40px 32px;
            text-align: center;
            border-bottom: 1px solid rgba(201, 168, 76, 0.1);
        }
        .star-icon {
            display: inline-block;
            width: 56px; height: 56px;
            border-radius: 50%;
            background: linear-gradient(145deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05));
            border: 2px solid rgba(201,168,76,0.25);
            line-height: 56px;
            font-size: 26px;
            margin-bottom: 18px;
        }
        .header h1 {
            margin: 0 0 6px;
            font-size: 24px; font-weight: 700;
            color: #ffffff;
            letter-spacing: -0.5px;
            line-height: 1.2;
        }
        .header .tagline {
            margin: 0;
            font-size: 14px; font-weight: 400;
            color: #8a8a8e;
            line-height: 1.5;
        }

        .body { padding: 32px 40px; }
        .body p {
            margin: 0 0 14px;
            font-size: 14px;
            line-height: 1.65;
            color: #a0a0a5;
        }
        .gold { color: #c9a84c; font-weight: 600; }

        .member-card {
            background: linear-gradient(145deg, #1a1610, #111113);
            border: 1px solid rgba(201, 168, 76, 0.2);
            border-radius: 16px;
            padding: 24px;
            margin: 24px 0;
            position: relative;
            overflow: hidden;
        }
        .member-card::before {
            content: '';
            position: absolute;
            top: 0; right: 0;
            width: 120px; height: 120px;
            background: radial-gradient(circle at 100% 0, rgba(201,168,76,0.08), transparent 70%);
        }
        .member-card .tier-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px; font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            background: rgba(201,168,76,0.12);
            color: #c9a84c;
            border: 1px solid rgba(201,168,76,0.2);
            margin-bottom: 16px;
        }
        .member-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .member-row:last-child { border-bottom: none; }
        .member-label { font-size: 13px; color: #737378; }
        .member-value {
            font-size: 13px; color: #e5e5e5; font-weight: 600;
            font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
        }

        .code-section {
            background: #0d0d0d;
            border: 2px solid #c9a84c;
            border-radius: 14px;
            padding: 24px;
            text-align: center;
            margin: 28px 0;
        }
        .code-label {
            font-size: 11px; font-weight: 700;
            color: #8a8a8e;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0 0 12px;
        }
        .code {
            font-size: 36px; letter-spacing: 8px;
            font-weight: 700; color: #c9a84c;
            font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
            margin: 0 0 10px;
        }
        .code-hint {
            font-size: 12px; color: #636366;
            margin: 0;
        }

        .steps { margin: 28px 0; padding: 0; }
        .step {
            display: flex;
            padding: 14px 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .step:last-child { border-bottom: none; }
        .step-num {
            flex-shrink: 0;
            width: 30px; height: 30px;
            background: rgba(201,168,76,0.1);
            border: 1px solid rgba(201,168,76,0.15);
            color: #c9a84c;
            border-radius: 10px;
            font-size: 13px; font-weight: 700;
            text-align: center;
            line-height: 30px;
            margin-right: 14px;
        }
        .step-content { padding-top: 4px; }
        .step-title {
            font-size: 14px; font-weight: 600;
            color: #e5e5e5;
            margin: 0 0 3px;
            line-height: 1.3;
        }
        .step-desc {
            font-size: 12px;
            color: #737378;
            margin: 0;
            line-height: 1.5;
        }

        .benefits {
            margin: 24px 0;
        }
        .benefits-title {
            font-size: 11px; font-weight: 700;
            color: #737378;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0 0 14px;
        }
        .benefit-row {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        .benefit {
            flex: 1;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 14px 16px;
            text-align: center;
        }
        .benefit-icon { font-size: 20px; margin-bottom: 6px; }
        .benefit-name {
            font-size: 11px; font-weight: 600;
            color: #a0a0a5;
            margin: 0;
        }

        .help {
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.04);
            padding: 16px 20px;
            margin-top: 24px;
        }
        .help p {
            font-size: 13px;
            color: #8a8a8e;
            margin: 0;
            line-height: 1.5;
        }
        .help a {
            color: #c9a84c;
            text-decoration: none;
            font-weight: 500;
        }

        .footer {
            padding: 24px 40px;
            border-top: 1px solid rgba(255,255,255,0.04);
            text-align: center;
        }
        .footer p {
            font-size: 11px;
            color: #4a4a4e;
            margin: 0 0 4px;
            line-height: 1.5;
        }

        @media only screen and (max-width: 600px) {
            .wrapper { padding: 20px 12px; }
            .header { padding: 32px 24px 24px; }
            .body { padding: 24px; }
            .footer { padding: 20px 24px; }
            .header h1 { font-size: 20px; }
            .member-card { padding: 18px; }
            .code { font-size: 28px; letter-spacing: 6px; }
            .benefit-row { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <!-- Header -->
            <div class="header">
                <div class="star-icon">&#x2B50;</div>
                <h1>Welcome to the Family</h1>
                <p class="tagline">{{ $hotelName }} Loyalty Program</p>
            </div>

            <!-- Body -->
            <div class="body">
                <p>Dear <span class="gold">{{ explode(' ', $guestName)[0] }}</span>,</p>

                <p>
                    As part of your booking at <strong style="color:#e5e5e5">{{ $hotelName }}</strong>,
                    we have created a complimentary loyalty membership for you. Earn points on every stay
                    and unlock exclusive benefits.
                </p>

                <!-- Membership Card -->
                <div class="member-card">
                    <div class="tier-badge">{{ $tierName }} Member</div>
                    <div class="member-row">
                        <span class="member-label">Member Number</span>
                        <span class="member-value">{{ $memberNumber }}</span>
                    </div>
                    <div class="member-row">
                        <span class="member-label">Email</span>
                        <span class="member-value">{{ $email }}</span>
                    </div>
                    <div class="member-row">
                        <span class="member-label">Status</span>
                        <span class="member-value" style="color: #22c55e;">Active</span>
                    </div>
                </div>

                <!-- Registration Code -->
                <p style="margin-top: 24px;">
                    Use the code below to activate your account in our member app.
                    This code is valid for <strong style="color:#e5e5e5">48 hours</strong>.
                </p>

                <div class="code-section">
                    <p class="code-label">Your Registration Code</p>
                    <p class="code">{{ $code }}</p>
                    <p class="code-hint">Enter this code in the app to set your password</p>
                </div>

                <!-- Steps -->
                <div class="steps">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <p class="step-title">Download the Member App</p>
                            <p class="step-desc">Search for <strong style="color:#a0a0a5;">{{ $hotelName }}</strong> in the App Store or Google Play</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <p class="step-title">Tap "Forgot Password"</p>
                            <p class="step-desc">On the login screen, tap the forgot password link</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <p class="step-title">Enter Your Email</p>
                            <p class="step-desc">Use <strong style="color:#a0a0a5;">{{ $email }}</strong> to receive a new code, or use the code above</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">4</div>
                        <div class="step-content">
                            <p class="step-title">Set Your Password</p>
                            <p class="step-desc">Choose a secure password and start earning points</p>
                        </div>
                    </div>
                </div>

                <!-- Benefits -->
                <div class="benefits">
                    <p class="benefits-title">Member Benefits</p>
                    <!--[if mso]>
                    <table role="presentation" width="100%"><tr>
                    <td width="25%" valign="top" style="padding:0 5px 10px 0">
                    <![endif]-->
                    <div class="benefit-row">
                        <div class="benefit">
                            <div class="benefit-icon">&#x2B50;</div>
                            <p class="benefit-name">Earn Points</p>
                        </div>
                        <div class="benefit">
                            <div class="benefit-icon">&#x1F381;</div>
                            <p class="benefit-name">Exclusive Offers</p>
                        </div>
                        <div class="benefit">
                            <div class="benefit-icon">&#x1F451;</div>
                            <p class="benefit-name">Tier Upgrades</p>
                        </div>
                        <div class="benefit">
                            <div class="benefit-icon">&#x1F4F1;</div>
                            <p class="benefit-name">Digital Card</p>
                        </div>
                    </div>
                    <!--[if mso]>
                    </td></tr></table>
                    <![endif]-->
                </div>

                <!-- Help -->
                <div class="help">
                    <p>
                        Need help? Contact us at
                        <a href="mailto:{{ $supportEmail }}">{{ $supportEmail }}</a>.
                        If you didn't make a booking with us, you can safely ignore this email.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>&copy; {{ date('Y') }} {{ $hotelName }}. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
