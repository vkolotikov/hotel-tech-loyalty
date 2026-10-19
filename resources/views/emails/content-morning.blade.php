{{-- HexaTech Content's morning email (spec 2026-10-19 §4.5). Inline styles, as every email: mail clients drop <style>. --}}
<!DOCTYPE html>
<html lang="{{ $locale }}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{{ $subject }}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:#1c1c1e;padding:24px 28px;color:#ffffff;">
            <p style="margin:0;font-size:12px;letter-spacing:1px;font-weight:700;color:#c9a84c;text-transform:uppercase;">{{ $eyebrow }}</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">{{ $heading }}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;font-size:15px;line-height:1.5;">
            <p style="margin:0 0 8px;">{{ $greeting }}</p>
            <p style="margin:0 0 8px;color:#3c3c43;">{{ $intro }}</p>
            @foreach ($brands as $brand)
              <h2 style="margin:20px 0 8px;font-size:16px;font-weight:700;">{{ $brand['name'] }}</h2>
              @foreach ($brand['posts'] as $post)
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5ea;">
                  <tr>
                    <td style="padding:10px 12px 10px 0;width:72px;vertical-align:top;font-weight:700;white-space:nowrap;">{{ $post['time'] }}</td>
                    <td style="padding:10px 0;vertical-align:top;">
                      <a href="{{ $post['url'] }}" style="color:#1c1c1e;font-weight:600;text-decoration:underline;">{{ $post['title'] }}</a>
                      <div style="font-size:13px;color:#6e6e73;">{{ $post['platform'] }} · {{ $post['status'] }}</div>
                    </td>
                  </tr>
                </table>
              @endforeach
              @if ($brand['missed'])
                <p style="margin:10px 0 0;font-size:14px;color:#9a4400;">{{ $brand['missed'] }}</p>
              @endif
            @endforeach
            <p style="margin:28px 0 0;text-align:center;">
              <a href="{{ $openUrl }}" style="display:inline-block;background:#1c1c1e;color:#ffffff;padding:12px 24px;border-radius:10px;font-weight:600;text-decoration:none;">{{ $open }}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 24px;font-size:12px;color:#6e6e73;border-top:1px solid #e5e5ea;">{{ $footer }}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
