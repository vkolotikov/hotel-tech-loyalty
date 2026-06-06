<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    {{-- Phase 8 — title + brand flex per industry. Hotel orgs see
         "Welcome to HotelTechAI" (was "Hotel Tech" pre-Phase-8;
         the sub-brand name is the customer-facing one). $brand /
         $profile / $industry are passed by WelcomeTrialMail::content.
         Fallbacks make the Blade safe to render in isolation
         (preview tools etc.). --}}
    @php
        $brand = $brand ?? 'HotelTechAI';
        $workspaceLabel = $profile?->workspaceLabel ?? 'hotel';
        $industry = $industry ?? 'hotel';
        // Phase 8 reviewer fix — every match() arm now branches on
        // all 8 industries (4 GTM + 4 settings-only) rather than
        // falling settings-only orgs through the hotel default arm,
        // which previously emitted "Connect Your PMS — Link Smoobu"
        // copy to a legal firm.
        $tagline = match ($industry) {
            'beauty'      => 'Your all-in-one salon & client platform is ready',
            'medical'     => 'Your all-in-one clinic & patient platform is ready',
            'restaurant'  => 'Your all-in-one restaurant & guest platform is ready',
            'legal'       => 'Your all-in-one firm & client platform is ready',
            'real_estate' => 'Your all-in-one agency & client platform is ready',
            'education'   => 'Your all-in-one school & student platform is ready',
            'fitness'     => 'Your all-in-one studio & member platform is ready',
            default       => 'Your all-in-one hospitality platform is ready',
        };
        // Reviewer fix (false-promise copy): pre-fix beauty said
        // "Sync with Google / iCloud / Outlook for treatment booking
        // visibility" and medical said "Optional EHR / calendar
        // sync" — neither integration is shipped (the product has
        // ServiceEngine for services + Smoobu for hotel PMS only,
        // no calendar / EHR connectors). Step 2 now references
        // features that actually exist.
        $hostingIntegrationStep = match ($industry) {
            'beauty'      => ['title' => 'Set Up Your Services',     'desc' => 'Configure treatments, durations, and prices for online booking'],
            'medical'     => ['title' => 'Set Up Your Services',     'desc' => 'Configure appointment types, durations, and prep instructions'],
            'restaurant'  => ['title' => 'Set Up Reservations',      'desc' => 'Configure table inventory and sittings for online reservations'],
            'legal'       => ['title' => 'Set Up Consultations',     'desc' => 'Configure consultation types, durations, and intake questions'],
            'real_estate' => ['title' => 'Set Up Viewings',          'desc' => 'Configure viewing slots, agent assignments, and listing details'],
            'education'   => ['title' => 'Set Up Your Courses',      'desc' => 'Configure classes, schedules, and enrolment details'],
            'fitness'     => ['title' => 'Set Up Your Classes',      'desc' => 'Configure classes, schedules, and capacity'],
            default       => ['title' => 'Connect Your PMS',         'desc' => 'Link Smoobu or your preferred property management system'],
        };
        $importStep = match ($industry) {
            'beauty'      => ['title' => 'Import Your Clients',   'desc' => 'Build your client database and launch your loyalty program'],
            'medical'     => ['title' => 'Import Your Patients',  'desc' => 'Build your patient database and set up appointment reminders'],
            'restaurant'  => ['title' => 'Import Your Diners',    'desc' => 'Build your diner database and launch your loyalty program'],
            'legal'       => ['title' => 'Import Your Clients',   'desc' => 'Build your client database and matter pipeline'],
            'real_estate' => ['title' => 'Import Your Clients',   'desc' => 'Build your client database and listing pipeline'],
            'education'   => ['title' => 'Import Your Students',  'desc' => 'Build your student database and launch your loyalty program'],
            'fitness'     => ['title' => 'Import Your Members',   'desc' => 'Build your member database and launch your loyalty program'],
            default       => ['title' => 'Import Your Guests',    'desc' => 'Build your guest database and launch your loyalty program'],
        };
        $engagementWord = match ($industry) {
            'beauty'      => 'client engagement',
            'medical'     => 'patient engagement',
            'restaurant'  => 'diner engagement',
            'legal'       => 'client engagement',
            'real_estate' => 'client engagement',
            'education'   => 'student engagement',
            'fitness'     => 'member engagement',
            default       => 'guest engagement',
        };
    @endphp
    <title>Welcome to {{ $brand }}</title>
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
        /* Reset */
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

        /* Header with gold gradient */
        .header {
            background: linear-gradient(145deg, #1a1610 0%, #111113 100%);
            padding: 48px 40px 36px;
            text-align: center;
            border-bottom: 1px solid rgba(201, 168, 76, 0.1);
        }
        .logo-mark {
            display: inline-block;
            width: 56px; height: 56px;
            border-radius: 16px;
            background: linear-gradient(145deg, #c9a84c, #a6883c);
            line-height: 56px;
            font-size: 24px; font-weight: 800;
            color: #0d0d0d;
            letter-spacing: -0.5px;
            margin-bottom: 20px;
            box-shadow: 0 8px 24px rgba(201, 168, 76, 0.25);
        }
        .header h1 {
            margin: 0 0 6px;
            font-size: 26px; font-weight: 700;
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

        /* Body */
        .body { padding: 36px 40px; }
        .body p {
            margin: 0 0 16px;
            font-size: 14px;
            line-height: 1.65;
            color: #a0a0a5;
        }
        .body p:last-child { margin-bottom: 0; }
        .gold { color: #c9a84c; font-weight: 600; }

        /* Trial badge */
        .trial-badge {
            background: linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.04));
            border: 1px solid rgba(201, 168, 76, 0.15);
            border-radius: 14px;
            padding: 18px 24px;
            text-align: center;
            margin: 24px 0 28px;
        }
        .trial-badge .plan {
            font-size: 18px; font-weight: 700;
            color: #c9a84c; letter-spacing: 0.5px;
            margin: 0 0 4px;
        }
        .trial-badge .days {
            font-size: 12px; font-weight: 500;
            color: #8a8a8e; letter-spacing: 0.3px;
            text-transform: uppercase;
            margin: 0;
        }

        /* Onboarding steps */
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
        .step-content {
            padding-top: 4px;
        }
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

        /* CTA button */
        .cta-wrap { text-align: center; margin: 32px 0 8px; }
        .cta {
            display: inline-block;
            background: linear-gradient(145deg, #c9a84c, #a6883c);
            color: #0d0d0d !important;
            text-decoration: none;
            font-weight: 700; font-size: 14px;
            padding: 14px 36px;
            border-radius: 12px;
            letter-spacing: 0.3px;
            box-shadow: 0 8px 20px rgba(201, 168, 76, 0.2), 0 2px 4px rgba(201, 168, 76, 0.15);
            transition: all 0.2s;
        }
        .cta:hover {
            box-shadow: 0 12px 28px rgba(201, 168, 76, 0.3);
        }

        /* Feature grid */
        .features {
            margin: 28px 0 24px;
        }
        .features-title {
            font-size: 11px; font-weight: 700;
            color: #737378;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0 0 16px;
        }
        .feature-row {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        .feature {
            flex: 1;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 14px 16px;
            text-align: center;
        }
        .feature-icon {
            font-size: 20px;
            margin-bottom: 6px;
        }
        .feature-name {
            font-size: 11px; font-weight: 600;
            color: #a0a0a5;
            margin: 0;
        }

        /* Help section */
        .help {
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.04);
            padding: 16px 20px;
            margin-top: 28px;
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

        /* Footer */
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
        .footer a {
            color: #6a6a6e;
            text-decoration: none;
        }

        /* Responsive */
        @media only screen and (max-width: 600px) {
            .wrapper { padding: 20px 12px; }
            .header { padding: 36px 24px 28px; }
            .body { padding: 28px 24px; }
            .footer { padding: 20px 24px; }
            .header h1 { font-size: 22px; }
            .feature-row { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <!-- Header -->
            <div class="header">
                <div class="logo-mark">H</div>
                <h1>Welcome to {{ $brand }}</h1>
                <p class="tagline">{{ $tagline }}</p>
            </div>

            <!-- Body -->
            <div class="body">
                <p>Hi <span class="gold">{{ $userName }}</span>,</p>

                <p>
                    Thank you for choosing {{ $brand }} for <strong style="color:#e5e5e5">{{ $hotelName }}</strong>.
                    Your account has been created and your trial is now active. Everything you need to
                    elevate your {{ str_replace(' engagement', ' experience', $engagementWord) }} is at your fingertips.
                </p>

                <!-- Trial Badge -->
                <div class="trial-badge">
                    <p class="plan">{{ $planName }} Plan</p>
                    <p class="days">{{ $trialDays }}-day free trial &mdash; no credit card required</p>
                </div>

                <!-- Onboarding Steps -->
                <div class="steps">
                    <div class="step">
                        <div class="step-num">1</div>
                        <div class="step-content">
                            <p class="step-title">Complete Setup Wizard</p>
                            <p class="step-desc">Configure your {{ $workspaceLabel }}, branding colors, and core settings</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">2</div>
                        <div class="step-content">
                            <p class="step-title">{{ $hostingIntegrationStep['title'] }}</p>
                            <p class="step-desc">{{ $hostingIntegrationStep['desc'] }}</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">3</div>
                        <div class="step-content">
                            <p class="step-title">{{ $importStep['title'] }}</p>
                            <p class="step-desc">{{ $importStep['desc'] }}</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-num">4</div>
                        <div class="step-content">
                            <p class="step-title">Deploy AI Chat Widget</p>
                            <p class="step-desc">Embed the AI chatbot on your website for 24/7 {{ $engagementWord }}</p>
                        </div>
                    </div>
                </div>

                <!-- CTA -->
                <div class="cta-wrap">
                    <a href="{{ $loginUrl }}" class="cta" target="_blank">Open Your Dashboard &rarr;</a>
                </div>

                <!-- Included Features -->
                <div class="features">
                    <p class="features-title">Included in your trial</p>
                    <!--[if mso]>
                    <table role="presentation" width="100%"><tr>
                    <td width="25%" valign="top" style="padding:0 5px 10px 0">
                    <![endif]-->
                    <div class="feature-row">
                        <div class="feature">
                            <div class="feature-icon">&#x1F3E8;</div>
                            <p class="feature-name">CRM</p>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">&#x2B50;</div>
                            <p class="feature-name">Loyalty</p>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">&#x1F4C5;</div>
                            <p class="feature-name">Bookings</p>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">&#x1F916;</div>
                            <p class="feature-name">AI Chat</p>
                        </div>
                    </div>
                    <!--[if mso]>
                    </td></tr></table>
                    <![endif]-->
                </div>

                <!-- Help -->
                <div class="help">
                    <p>
                        Need help getting started? Use the <strong style="color:#e5e5e5">AI assistant</strong> in your dashboard &mdash;
                        click the chat icon in the bottom-right corner. Or reach us at
                        <a href="mailto:{{ $supportEmail }}">{{ $supportEmail }}</a>.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><a href="https://hotel-tech.ai">hotel-tech.ai</a></p>
                <p>&copy; {{ date('Y') }} {{ $brand }}. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
