@extends('emails.layouts.luxury')

@section('title', 'Your ' . $hotelName . ' Membership')

@section('hero')
    <p class="hero-eyebrow">{{ $tierName }} Member</p>
    <h1 class="hero-headline">Welcome to the family</h1>
    <p class="hero-subline">
        @if($guestName)
            {{ explode(' ', $guestName)[0] }}, alongside your booking we've created a complimentary
        @else
            Alongside your booking we've created a complimentary
        @endif
        loyalty membership at {{ $hotelName }}.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName ?: 'Guest' }},</p>
    <p>
        Thank you for booking with {{ $hotelName }}. As part of your reservation we've
        opened a {{ $tierName }} membership for you — earn points on every stay,
        unlock exclusive offers, and progress through our tiered rewards programme.
    </p>

    <div class="panel">
        <div class="panel-title">Your membership</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Member number</td><td class="val">{{ $memberNumber }}</td></tr>
            <tr><td class="lbl">Tier</td><td class="val">{{ $tierName }}</td></tr>
            <tr><td class="lbl">Email</td><td class="val">{{ $email }}</td></tr>
            <tr><td class="lbl">Status</td><td class="val" style="color:#7adfa3;">Active</td></tr>
        </table>
    </div>

    <p style="text-align:center;font-size:13px;color:rgba(255,255,255,0.62);margin:28px 0 14px;">
        Activate your account using the code below.<br>
        It is valid for <strong style="color:#ffffff;">48 hours</strong>.
    </p>

    <div style="text-align:center;margin:0 0 28px;">
        <div class="code-chip">{{ $code }}</div>
    </div>

    <div class="panel">
        <div class="panel-title">How to activate</div>
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Download the <strong style="color:#ffffff;">{{ $hotelName }}</strong> member app from the App Store or Google Play.
        </p>
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">2.</strong>
            On the login screen, tap <strong style="color:#ffffff;">"Forgot password"</strong>.
        </p>
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">3.</strong>
            Enter your email <strong style="color:#ffffff;">{{ $email }}</strong>.
        </p>
        <p style="margin:0;">
            <strong style="color:#e3c66a;">4.</strong>
            Enter the 6-digit code above and choose your new password.
        </p>
    </div>

    <div class="panel">
        <div class="panel-title">Member benefits</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td width="50%" valign="top" style="padding:6px 8px 6px 0;">
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.78);">
                        <strong style="color:#e3c66a;">·</strong> Earn points on every stay
                    </p>
                </td>
                <td width="50%" valign="top" style="padding:6px 0 6px 8px;">
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.78);">
                        <strong style="color:#e3c66a;">·</strong> Exclusive member offers
                    </p>
                </td>
            </tr>
            <tr>
                <td width="50%" valign="top" style="padding:6px 8px 6px 0;">
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.78);">
                        <strong style="color:#e3c66a;">·</strong> Tier upgrades & perks
                    </p>
                </td>
                <td width="50%" valign="top" style="padding:6px 0 6px 8px;">
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.78);">
                        <strong style="color:#e3c66a;">·</strong> Digital membership card
                    </p>
                </td>
            </tr>
        </table>
    </div>

    <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.45);margin-top:24px;">
        If you didn't make a booking with us, you can safely ignore this email — your account stays inaccessible without the code.
    </p>
@endsection
