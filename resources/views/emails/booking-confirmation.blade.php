<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Booking Confirmation</title>
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
        .check-icon {
            display: inline-block;
            width: 56px; height: 56px;
            border-radius: 50%;
            background: linear-gradient(145deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05));
            border: 2px solid rgba(34,197,94,0.25);
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

        .ref-badge {
            background: linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.04));
            border: 1px solid rgba(201, 168, 76, 0.15);
            border-radius: 14px;
            padding: 16px 24px;
            text-align: center;
            margin: 20px 0 28px;
        }
        .ref-badge .label {
            font-size: 11px; font-weight: 600;
            color: #8a8a8e; letter-spacing: 1px;
            text-transform: uppercase;
            margin: 0 0 6px;
        }
        .ref-badge .value {
            font-size: 22px; font-weight: 700;
            color: #c9a84c; letter-spacing: 2px;
            font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
            margin: 0;
        }

        .details-card {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            overflow: hidden;
            margin: 24px 0;
        }
        .details-card .title-row {
            padding: 14px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .details-card .title-row h3 {
            margin: 0;
            font-size: 13px; font-weight: 700;
            color: #e5e5e5;
            letter-spacing: 0.3px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label {
            font-size: 13px;
            color: #737378;
        }
        .detail-value {
            font-size: 13px;
            color: #e5e5e5;
            font-weight: 600;
        }

        .price-section {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            overflow: hidden;
            margin: 24px 0;
        }
        .price-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .price-row:last-child { border-bottom: none; }
        .price-label { font-size: 13px; color: #a0a0a5; }
        .price-value { font-size: 13px; color: #e5e5e5; font-weight: 600; }
        .price-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px;
            background: rgba(201,168,76,0.06);
            border-top: 1px solid rgba(201,168,76,0.12);
        }
        .price-total .price-label {
            font-size: 14px; font-weight: 700; color: #e5e5e5;
        }
        .price-total .price-value {
            font-size: 18px; font-weight: 800; color: #c9a84c;
        }

        .policies {
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.04);
            padding: 16px 20px;
            margin-top: 24px;
        }
        .policies h4 {
            font-size: 11px; font-weight: 700;
            color: #737378;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            margin: 0 0 10px;
        }
        .policies p {
            font-size: 13px;
            color: #8a8a8e;
            margin: 0 0 6px;
            line-height: 1.5;
        }
        .policies p:last-child { margin-bottom: 0; }

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
            .detail-row, .price-row, .price-total { padding: 10px 16px; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <!-- Header -->
            <div class="header">
                <div class="check-icon">&#x2713;</div>
                <h1>Booking Confirmed</h1>
                <p class="tagline">{{ $hotelName }}</p>
            </div>

            <!-- Body -->
            <div class="body">
                <p>Dear <span class="gold">{{ explode(' ', $guestName)[0] }}</span>,</p>

                <p>
                    Thank you for your reservation at <strong style="color:#e5e5e5">{{ $hotelName }}</strong>.
                    Your booking has been confirmed and we look forward to welcoming you.
                </p>

                <!-- Booking Reference -->
                <div class="ref-badge">
                    <p class="label">Booking Reference</p>
                    <p class="value">{{ $bookingReference }}</p>
                </div>

                <!-- Stay Details -->
                <div class="details-card">
                    <div class="title-row">
                        <h3>&#x1F3E8; Stay Details</h3>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Room / Unit</span>
                        <span class="detail-value">{{ $unitName }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Check-in</span>
                        <span class="detail-value">{{ \Carbon\Carbon::parse($checkIn)->format('D, d M Y') }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Check-out</span>
                        <span class="detail-value">{{ \Carbon\Carbon::parse($checkOut)->format('D, d M Y') }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration</span>
                        <span class="detail-value">{{ $nights }} night{{ $nights !== 1 ? 's' : '' }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Guests</span>
                        <span class="detail-value">{{ $adults }} adult{{ $adults !== 1 ? 's' : '' }}{{ $children > 0 ? ", {$children} child" . ($children !== 1 ? 'ren' : '') : '' }}</span>
                    </div>
                </div>

                <!-- Price Breakdown -->
                <div class="price-section">
                    <div class="title-row" style="padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <h3 style="margin:0; font-size:13px; font-weight:700; color:#e5e5e5;">&#x1F4B0; Price Breakdown</h3>
                    </div>
                    <div class="price-row">
                        <span class="price-label">{{ $unitName }} &times; {{ $nights }} night{{ $nights !== 1 ? 's' : '' }}</span>
                        <span class="price-value">{{ $currency }} {{ number_format($roomTotal, 2) }}</span>
                    </div>
                    <div class="price-row" style="padding: 6px 20px;">
                        <span style="font-size: 11px; color: #636366;">{{ $currency }} {{ number_format($pricePerNight, 2) }} / night</span>
                        <span></span>
                    </div>
                    @if(!empty($extras))
                        @foreach($extras as $extra)
                            <div class="price-row">
                                <span class="price-label">{{ $extra['name'] ?? 'Extra' }}{{ ($extra['quantity'] ?? 1) > 1 ? ' &times; ' . $extra['quantity'] : '' }}</span>
                                <span class="price-value">{{ $currency }} {{ number_format($extra['total'] ?? 0, 2) }}</span>
                            </div>
                        @endforeach
                    @endif
                    <div class="price-total">
                        <span class="price-label">Total</span>
                        <span class="price-value">{{ $currency }} {{ number_format($grossTotal, 2) }}</span>
                    </div>
                </div>

                <!-- Policies -->
                @if(!empty($policies))
                    <div class="policies">
                        <h4>Policies</h4>
                        @if(!empty($policies['check_in_time']))
                            <p><strong style="color:#a0a0a5;">Check-in:</strong> from {{ $policies['check_in_time'] }}</p>
                        @endif
                        @if(!empty($policies['check_out_time']))
                            <p><strong style="color:#a0a0a5;">Check-out:</strong> until {{ $policies['check_out_time'] }}</p>
                        @endif
                        @if(!empty($policies['cancellation_policy']))
                            <p><strong style="color:#a0a0a5;">Cancellation:</strong> {{ $policies['cancellation_policy'] }}</p>
                        @endif
                        @if(!empty($policies['payment_terms']))
                            <p><strong style="color:#a0a0a5;">Payment:</strong> {{ $policies['payment_terms'] }}</p>
                        @endif
                    </div>
                @endif

                <!-- Help -->
                <div class="help">
                    <p>
                        Questions about your stay? Contact us at
                        <a href="mailto:{{ $supportEmail }}">{{ $supportEmail }}</a>.
                        Please include your booking reference <strong style="color:#c9a84c;">{{ $bookingReference }}</strong> in your message.
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
