<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>{{ $org_name }} — engagement summary</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr>
    <td align="center" style="padding:24px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1c1c1e,#2c2c2e);padding:24px 28px;color:#ffffff;">
            <p style="margin:0;font-size:11px;letter-spacing:1px;font-weight:700;color:#c9a84c;text-transform:uppercase;">Engagement summary</p>
            <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;">{{ $org_name }}</h1>
            <p style="margin:0;font-size:13px;color:#a0a0a8;">{{ $date_label }}{{ !empty($timezone) ? ' · ' . $timezone : '' }}</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 28px 0;">
            <p style="margin:0;font-size:15px;color:#1c1c1e;">Good morning {{ $recipientName ?: 'there' }} —</p>
            <p style="margin:8px 0 0;font-size:14px;color:#3c3c43;line-height:1.55;">
              Here's how your chat-driven engagement performed yesterday.
            </p>
          </td>
        </tr>

        <!-- KPI tiles -->
        <tr>
          <td style="padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
              <tr>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Hot leads captured</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#f59e0b;">{{ $hot_leads_count }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">{{ $leads_total }} total in CRM</p>
                </td>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Handled by AI</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#8b5cf6;">{{ $ai_handled_count }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">{{ $ai_handled_rate }}% resolution rate</p>
                </td>
              </tr>
              <tr>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Unanswered now</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#ef4444;">{{ $unanswered_now }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">awaiting human reply</p>
                </td>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Booking-page · no contact</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#0a84ff;">{{ $booking_visitors_unconverted }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">missed conversions yesterday</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Top unanswered list -->
        @if (!empty($unanswered_top))
          <tr>
            <td style="padding:0 28px 4px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1c1c1e;">Currently waiting</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                @foreach ($unanswered_top as $row)
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #eaeaec;">
                      <p style="margin:0;font-size:13px;color:#1c1c1e;font-weight:600;">{{ $row['visitor_name'] }}</p>
                      @if (!empty($row['waiting_minutes']))
                        <p style="margin:2px 0 0;font-size:11px;color:#ef4444;">Waiting {{ $row['waiting_minutes'] }} min</p>
                      @endif
                    </td>
                  </tr>
                @endforeach
              </table>
            </td>
          </tr>
        @endif

        <!-- CTA -->
        <tr>
          <td style="padding:24px 28px 28px;">
            <a href="{{ rtrim(config('app.url'), '/') }}/engagement"
               style="display:inline-block;background:#c9a84c;color:#1a1205;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:10px;">
              Open Engagement Hub →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px 24px;border-top:1px solid #eaeaec;">
            <p style="margin:0;font-size:11px;color:#8e8e93;line-height:1.5;">
              You're receiving this because you opted in to the daily engagement summary.
              Manage from your <a href="{{ rtrim(config('app.url'), '/') }}/settings" style="color:#3c3c43;text-decoration:underline;">Settings</a>.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
