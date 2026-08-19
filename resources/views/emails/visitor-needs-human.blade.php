<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Someone is waiting to speak to you</title>
</head>
<body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;line-height:1.5;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0b0d12;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background:#12151d;border:1px solid #232838;border-radius:14px;overflow:hidden;">

        <tr>
          <td style="padding:22px 24px 16px;border-bottom:1px solid #232838;">
            <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#9aa4b2;margin-bottom:6px;">{{ $venueName }} · Live chat</div>
            <div style="font-size:19px;font-weight:600;color:#ffffff;">
              {{ $visitorName ?: 'A visitor' }} asked to speak to a person
            </div>
            <div style="font-size:13px;color:#9aa4b2;margin-top:4px;">{{ $sentAt }}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 24px;">
            <div style="font-size:12px;color:#9aa4b2;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">What they said</div>
            <div style="background:#0f1218;border:1px solid #232838;border-radius:10px;padding:14px 16px;font-size:15px;color:#e5e7eb;">
              {{ $lastMessage }}
            </div>

            @if ($visitorEmail || $visitorPhone || $pageUrl)
              <div style="font-size:12px;color:#9aa4b2;text-transform:uppercase;letter-spacing:1.2px;margin:20px 0 8px;">Details</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size:14px;">
                @if ($visitorEmail)
                  <tr>
                    <td style="padding:4px 0;color:#9aa4b2;width:80px;">Email</td>
                    <td style="padding:4px 0;color:#e5e7eb;"><a href="mailto:{{ $visitorEmail }}" style="color:#e5e7eb;">{{ $visitorEmail }}</a></td>
                  </tr>
                @endif
                @if ($visitorPhone)
                  <tr>
                    <td style="padding:4px 0;color:#9aa4b2;">Phone</td>
                    <td style="padding:4px 0;color:#e5e7eb;"><a href="tel:{{ $visitorPhone }}" style="color:#e5e7eb;">{{ $visitorPhone }}</a></td>
                  </tr>
                @endif
                @if ($pageUrl)
                  <tr>
                    <td style="padding:4px 0;color:#9aa4b2;">Page</td>
                    <td style="padding:4px 0;color:#e5e7eb;word-break:break-all;">{{ $pageUrl }}</td>
                  </tr>
                @endif
              </table>
            @endif

            <div style="margin-top:24px;">
              <a href="{{ $inboxUrl }}"
                 style="display:inline-block;background:#c9a84c;color:#0b0d12;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
                Reply in the inbox
              </a>
            </div>

            @unless ($visitorEmail || $visitorPhone)
              <p style="font-size:13px;color:#9aa4b2;margin:18px 0 0;">
                They have not left contact details, so the chat is the only way to reach them.
              </p>
            @endunless
          </td>
        </tr>

        <tr>
          <td style="padding:14px 24px 20px;border-top:1px solid #232838;font-size:12px;color:#6b7280;">
            You are receiving this because a handover email is set on your chat widget. Change it in
            Chatbot Setup → Widget → Talk to a Person.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
