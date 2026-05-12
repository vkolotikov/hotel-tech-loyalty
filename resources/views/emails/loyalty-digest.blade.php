<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>{{ $org_name }} — loyalty digest</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr>
    <td align="center" style="padding:24px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1c1c1e,#2c2c2e);padding:24px 28px;color:#ffffff;">
            <p style="margin:0;font-size:11px;letter-spacing:1px;font-weight:700;color:#c9a84c;text-transform:uppercase;">Loyalty digest</p>
            <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;">{{ $org_name }}</h1>
            <p style="margin:0;font-size:13px;color:#a0a0a8;">{{ $date_label }}{{ !empty($timezone) ? ' · ' . $timezone : '' }}</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 28px 0;">
            <p style="margin:0;font-size:15px;color:#1c1c1e;">Good morning {{ $recipientName ?: 'there' }} —</p>
            <p style="margin:8px 0 0;font-size:14px;color:#3c3c43;line-height:1.55;">
              Here's how your loyalty program moved yesterday.
            </p>
          </td>
        </tr>

        <!-- KPI tiles -->
        <tr>
          <td style="padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
              <tr>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">New members</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#0a84ff;">{{ $new_members }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">joined yesterday</p>
                </td>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Points earned</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#32d74b;">{{ number_format($points_earned) }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">awarded to members</p>
                </td>
              </tr>
              <tr>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Points redeemed</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#c9a84c;">{{ number_format($points_redeemed) }}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">spent by members</p>
                </td>
                <td width="50%" style="background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:10px;letter-spacing:0.8px;font-weight:700;color:#8e8e93;text-transform:uppercase;">Reward redemptions</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#8b5cf6;">{{ $reward_redemptions }}</p>
                  @if ($pending_redemptions > 0)
                    <p style="margin:2px 0 0;font-size:11px;color:#f59e0b;">{{ $pending_redemptions }} pending pickup</p>
                  @else
                    <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">claimed from catalog</p>
                  @endif
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Tier movement (30d) -->
        <tr>
          <td style="padding:8px 28px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1c1c1e;">Tier movement (last 30 days)</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
              <tr>
                <td width="50%" style="background:#ecfdf5;border-left:3px solid #32d74b;border-radius:6px;padding:10px 14px;">
                  <p style="margin:0;font-size:11px;color:#15803d;font-weight:600;">{{ $tier_upgrades_30d }} upgrades</p>
                </td>
                <td width="50%" style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;padding:10px 14px;">
                  <p style="margin:0;font-size:11px;color:#b91c1c;font-weight:600;">{{ $tier_downgrades_30d }} downgrades</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- At-risk members -->
        @if (!empty($at_risk_top))
          <tr>
            <td style="padding:18px 28px 4px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1c1c1e;">
                Win-back targets
                @if (!empty($at_risk_count))
                  <span style="font-size:11px;font-weight:500;color:#8e8e93;">({{ $at_risk_count }} total)</span>
                @endif
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                @foreach ($at_risk_top as $m)
                  <tr>
                    <td style="padding:8px 0;border-top:1px solid #eaeaec;">
                      <p style="margin:0;font-size:13px;color:#1c1c1e;font-weight:600;">{{ $m['name'] ?? 'Member' }}</p>
                      <p style="margin:2px 0 0;font-size:11px;color:#8e8e93;">
                        {{ $m['tier'] ?? '—' }} ·
                        {{ number_format($m['current_points'] ?? 0) }} pts ·
                        @if (!empty($m['days_since_activity']))
                          quiet {{ $m['days_since_activity'] }} days
                        @endif
                      </p>
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
            <a href="{{ rtrim(config('app.url'), '/') }}/analytics"
               style="display:inline-block;background:#c9a84c;color:#1a1205;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:10px;">
              Open Analytics →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px 24px;border-top:1px solid #eaeaec;">
            <p style="margin:0;font-size:11px;color:#8e8e93;line-height:1.5;">
              You're receiving this because you opted in to the daily loyalty digest.
              Manage from <a href="{{ rtrim(config('app.url'), '/') }}/analytics" style="color:#3c3c43;text-decoration:underline;">Analytics</a>.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
