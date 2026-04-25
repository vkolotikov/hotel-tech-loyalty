{{--
  Shared luxury email layout. Every transactional email (booking confirm,
  membership welcome, service confirm, etc.) extends this so the visual
  language stays in one place — same dark navy substrate, same muted-gold
  accents, same Cormorant + Inter type pairing as the mobile app.

  Sections to override:
    - title    : tab title (browser/email subject preview)
    - hero     : top hero band (eyebrow + Cormorant headline)
    - main     : everything between the hero and the support footer
    - footer   : short closing block (support contact + brand tagline)
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>@yield('title', $hotelName ?? 'Hotel')</title>

    {{-- Web fonts. Apple Mail / iOS / modern Gmail will pick these up;
         Outlook falls back to Georgia / Helvetica via the font-family chain. --}}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

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
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; max-width: 100%; }

        body {
            margin: 0; padding: 0; width: 100%; min-width: 100%;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background-color: #0a0d14;
            color: rgba(255,255,255,0.72);
            -webkit-font-smoothing: antialiased;
            line-height: 1.55;
        }

        /* Frame */
        .wrap { max-width: 620px; margin: 0 auto; padding: 32px 16px 56px; }
        .card {
            background: #12161f;
            border-radius: 20px;
            border: 1px solid rgba(201,168,76,0.14);
            overflow: hidden;
            box-shadow: 0 32px 64px rgba(0,0,0,0.45);
        }

        /* Hero — gold-washed band that opens every email */
        .hero {
            background:
                radial-gradient(circle at 85% 30%, rgba(227,198,106,0.18), transparent 55%),
                linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(138,106,37,0.06) 50%, transparent 100%),
                #12161f;
            padding: 44px 36px 38px;
            border-bottom: 1px solid rgba(201,168,76,0.14);
            text-align: left;
            position: relative;
        }
        .hero-eyebrow {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #d8b453;
            margin: 0 0 12px;
        }
        .hero-headline {
            font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
            font-size: 36px;
            line-height: 1.15;
            font-weight: 700;
            color: #ffffff;
            margin: 0;
            letter-spacing: -0.5px;
        }
        .hero-subline {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: rgba(255,255,255,0.62);
            margin: 14px 0 0;
        }

        /* Main body */
        .body { padding: 32px 36px 8px; }

        /* Section heading */
        .section-eyebrow {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1.6px;
            text-transform: uppercase;
            color: #d8b453;
            margin: 0 0 8px;
        }
        .section-title {
            font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
            font-size: 22px;
            line-height: 1.25;
            color: #ffffff;
            margin: 0 0 16px;
            font-weight: 600;
        }
        .section-sub {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.65;
            color: rgba(255,255,255,0.62);
            margin: 0 0 20px;
        }

        p {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.7;
            color: rgba(255,255,255,0.78);
            margin: 0 0 14px;
        }

        /* Inset surface card (for booking summary, pricing, policies) */
        .panel {
            background: rgba(255,255,255,0.025);
            border: 1px solid rgba(201,168,76,0.12);
            border-radius: 14px;
            padding: 20px 22px;
            margin: 0 0 18px;
        }
        .panel-title {
            font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
            font-size: 18px;
            font-weight: 600;
            color: #ffffff;
            margin: 0 0 14px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(201,168,76,0.12);
        }

        /* Detail rows used inside panels */
        .row { width: 100%; margin: 0 0 9px; }
        .row td {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            padding: 5px 0;
        }
        .row .lbl { color: rgba(255,255,255,0.55); }
        .row .val { color: #ffffff; font-weight: 600; text-align: right; }
        .row .val-gold { color: #e3c66a; font-weight: 700; text-align: right; font-size: 15px; }

        /* Total row — heavier border */
        .total-row {
            border-top: 1px solid rgba(201,168,76,0.22);
            margin-top: 14px;
            padding-top: 14px;
        }
        .total-row .lbl { color: #ffffff; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
        .total-row .val { color: #e3c66a; font-weight: 700; font-size: 22px; font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; }

        /* Gold pill button */
        .btn-wrap { text-align: center; padding: 8px 0 20px; }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #f2d878 0%, #d8b453 55%, #8a6a25 100%);
            color: #1a1205 !important;
            text-decoration: none;
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 0.4px;
            padding: 14px 32px;
            border-radius: 999px;
            box-shadow: 0 8px 24px rgba(201,168,76,0.28);
        }

        /* Decorative gold divider */
        .divider {
            text-align: center;
            margin: 18px 0;
            color: rgba(201,168,76,0.55);
            font-size: 12px;
            letter-spacing: 6px;
        }

        /* Code chip — used by membership emails */
        .code-chip {
            display: inline-block;
            font-family: 'Inter', 'Courier New', monospace;
            font-weight: 700;
            font-size: 26px;
            letter-spacing: 8px;
            color: #e3c66a;
            background: rgba(201,168,76,0.08);
            border: 1px solid rgba(201,168,76,0.30);
            border-radius: 14px;
            padding: 16px 28px;
        }

        /* Footer */
        .footer {
            padding: 24px 36px 36px;
            text-align: center;
            border-top: 1px solid rgba(255,255,255,0.04);
        }
        .footer p {
            font-size: 12px;
            color: rgba(255,255,255,0.38);
            margin: 0 0 4px;
            line-height: 1.6;
        }
        .footer a { color: #d8b453; text-decoration: none; }

        /* Mobile breakpoint */
        @media only screen and (max-width: 480px) {
            .wrap { padding: 16px 8px 36px; }
            .hero { padding: 32px 22px 28px; }
            .hero-headline { font-size: 28px; }
            .body { padding: 24px 22px 4px; }
            .footer { padding: 20px 22px 28px; }
            .panel { padding: 16px 16px; }
            .btn { padding: 13px 26px; font-size: 13px; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td>
                    <div class="card">
                        <div class="hero">
                            @yield('hero')
                        </div>
                        <div class="body">
                            @yield('main')
                        </div>
                        <div class="footer">
                            @hasSection('footer')
                                @yield('footer')
                            @else
                                <p>Need help? Reach us at <a href="mailto:{{ $supportEmail ?? 'support@hotel-tech.ai' }}">{{ $supportEmail ?? 'support@hotel-tech.ai' }}</a>.</p>
                                <p>{{ $hotelName ?? 'Your Hotel' }} · Hospitality, refined.</p>
                            @endif
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
