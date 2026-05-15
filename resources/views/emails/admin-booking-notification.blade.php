<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New {{ $kind }} booking</title>
</head>
<body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;line-height:1.5;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0b0d12;padding:24px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#11141a;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">

        {{-- Header --}}
        <tr>
          <td style="background:linear-gradient(135deg,#c9a84c 0%,#a8862d 100%);padding:24px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="color:#1a1a1a;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;opacity:.75;">
                  {{ $hotelName }} · Admin alert
                </td>
                <td align="right" style="color:#1a1a1a;font-size:11px;font-weight:700;opacity:.65;">
                  #{{ $bookingReference }}
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:10px;color:#0f172a;font-size:22px;font-weight:800;letter-spacing:-0.3px;">
                  @if($kind === 'service')
                    🗓️ New service booking
                  @else
                    🏨 New room reservation
                  @endif
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:4px;color:#1a1a1a;font-size:13px;font-weight:500;opacity:.8;">
                  {{ $guestName }}
                  @if($kind === 'service' && $serviceName)
                    booked <strong>{{ $serviceName }}</strong>
                  @elseif($kind !== 'service' && $unitName)
                    booked <strong>{{ $unitName }}</strong>
                  @endif
                </td>
              </tr>
            </table>
          </td>
        </tr>

        {{-- Headline amount --}}
        <tr>
          <td style="padding:24px 28px 8px 28px;">
            <div style="background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:18px 20px;">
              <div style="color:#86efac;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Total</div>
              <div style="color:#22c55e;font-size:32px;font-weight:800;letter-spacing:-0.5px;margin-top:4px;">
                {{ number_format($grossTotal, 2) }} <span style="font-size:14px;font-weight:600;color:#86efac;">{{ $currency }}</span>
              </div>
              @if($paymentStatus)
                <div style="margin-top:8px;display:inline-block;padding:3px 10px;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.4);border-radius:6px;color:#93c5fd;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                  {{ $paymentStatus }}
                </div>
              @endif
            </div>
          </td>
        </tr>

        {{-- Guest details --}}
        <tr>
          <td style="padding:16px 28px 4px 28px;">
            <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Guest</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#161a22;border:1px solid #1f2937;border-radius:10px;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="color:#fff;font-size:15px;font-weight:700;">{{ $guestName }}</div>
                  @if($guestEmail)
                    <div style="margin-top:6px;color:#93c5fd;font-size:13px;">
                      <a href="mailto:{{ $guestEmail }}" style="color:#93c5fd;text-decoration:none;">✉️ {{ $guestEmail }}</a>
                    </div>
                  @endif
                  @if($guestPhone)
                    <div style="margin-top:4px;color:#86efac;font-size:13px;">
                      <a href="tel:{{ $guestPhone }}" style="color:#86efac;text-decoration:none;">📞 {{ $guestPhone }}</a>
                    </div>
                  @endif
                </td>
              </tr>
            </table>
          </td>
        </tr>

        {{-- Reservation details --}}
        <tr>
          <td style="padding:16px 28px 4px 28px;">
            <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
              @if($kind === 'service') Appointment @else Stay @endif
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#161a22;border:1px solid #1f2937;border-radius:10px;">
              @if($kind === 'service')
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Service</td>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $serviceName ?? '—' }}</td>
                </tr>
                @if($masterName)
                  <tr>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Staff member</td>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $masterName }}</td>
                  </tr>
                @endif
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">When</td>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">
                    {{ $startAt ? \Illuminate\Support\Carbon::parse($startAt)->format('D, M j · g:i A') : '—' }}
                  </td>
                </tr>
                @if($durationMinutes)
                  <tr>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Duration</td>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $durationMinutes }} min</td>
                  </tr>
                @endif
                @if($partySize)
                  <tr>
                    <td style="padding:12px 18px;color:#94a3b8;font-size:13px;">Party size</td>
                    <td style="padding:12px 18px;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $partySize }}</td>
                  </tr>
                @endif
              @else
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Room</td>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $unitName ?? '—' }}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Check-in</td>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">
                    {{ $checkIn ? \Illuminate\Support\Carbon::parse($checkIn)->format('D, M j Y') : '—' }}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Check-out</td>
                  <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">
                    {{ $checkOut ? \Illuminate\Support\Carbon::parse($checkOut)->format('D, M j Y') : '—' }}
                  </td>
                </tr>
                @if($nights)
                  <tr>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Nights</td>
                    <td style="padding:12px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ $nights }}</td>
                  </tr>
                @endif
                <tr>
                  <td style="padding:12px 18px;color:#94a3b8;font-size:13px;">Guests</td>
                  <td style="padding:12px 18px;color:#fff;font-size:13px;font-weight:600;text-align:right;">
                    {{ $adults ?? 1 }} adult{{ ($adults ?? 1) === 1 ? '' : 's' }}@if($children){{ ' · ' . $children . ' child' . ($children === 1 ? '' : 'ren') }}@endif
                  </td>
                </tr>
              @endif
            </table>
          </td>
        </tr>

        {{-- Extras --}}
        @if(!empty($extras))
          <tr>
            <td style="padding:16px 28px 4px 28px;">
              <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Extras</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#161a22;border:1px solid #1f2937;border-radius:10px;">
                @foreach($extras as $i => $ex)
                  <tr>
                    <td style="padding:10px 18px;{{ $i < count($extras) - 1 ? 'border-bottom:1px solid #1f2937;' : '' }}color:#e5e7eb;font-size:13px;">
                      {{ $ex['name'] ?? 'Extra' }} <span style="color:#64748b;">× {{ $ex['quantity'] ?? 1 }}</span>
                    </td>
                    <td style="padding:10px 18px;{{ $i < count($extras) - 1 ? 'border-bottom:1px solid #1f2937;' : '' }}color:#fff;font-size:13px;font-weight:600;text-align:right;">
                      {{ number_format($ex['total'] ?? $ex['line_total'] ?? 0, 2) }} {{ $currency }}
                    </td>
                  </tr>
                @endforeach
              </table>
            </td>
          </tr>
        @endif

        {{-- Money breakdown --}}
        <tr>
          <td style="padding:16px 28px 4px 28px;">
            <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Breakdown</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#161a22;border:1px solid #1f2937;border-radius:10px;">
              <tr>
                <td style="padding:10px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">
                  @if($kind === 'service') Service @else Room @endif
                </td>
                <td style="padding:10px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ number_format($baseTotal, 2) }} {{ $currency }}</td>
              </tr>
              @if($extrasTotal > 0)
                <tr>
                  <td style="padding:10px 18px;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;">Extras</td>
                  <td style="padding:10px 18px;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;font-weight:600;text-align:right;">{{ number_format($extrasTotal, 2) }} {{ $currency }}</td>
                </tr>
              @endif
              <tr>
                <td style="padding:12px 18px;color:#c9a84c;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;">Total</td>
                <td style="padding:12px 18px;color:#c9a84c;font-size:18px;font-weight:800;text-align:right;letter-spacing:-0.3px;">{{ number_format($grossTotal, 2) }} {{ $currency }}</td>
              </tr>
            </table>
          </td>
        </tr>

        @if($specialRequests)
          <tr>
            <td style="padding:16px 28px 4px 28px;">
              <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Special requests</div>
              <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:12px 16px;color:#fcd34d;font-size:13px;line-height:1.6;white-space:pre-wrap;">{{ $specialRequests }}</div>
            </td>
          </tr>
        @endif

        {{-- CTA --}}
        <tr>
          <td style="padding:24px 28px;text-align:center;">
            <a href="{{ $adminUrl }}/{{ $kind === 'service' ? 'bookings' : 'bookings' }}"
               style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#a8862d);color:#1a1a1a;text-decoration:none;font-size:14px;font-weight:800;letter-spacing:0.3px;padding:14px 32px;border-radius:10px;">
              Open in admin →
            </a>
          </td>
        </tr>

        {{-- Footer --}}
        <tr>
          <td style="padding:20px 28px;background:#0f1117;border-top:1px solid #1f2937;text-align:center;">
            <p style="margin:0;color:#64748b;font-size:11px;line-height:1.6;">
              This is an automated notification from {{ $hotelName }}.<br>
              You're getting it because you're set up as an admin recipient.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
