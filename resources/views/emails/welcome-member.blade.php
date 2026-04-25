@extends('emails.layouts.luxury')

@section('title', 'Welcome to ' . $hotelName)

@section('hero')
    <p class="hero-eyebrow">{{ $tierName }} Member</p>
    <h1 class="hero-headline">Welcome to {{ $hotelName }}</h1>
    <p class="hero-subline">
        @if($memberName)
            {{ explode(' ', $memberName)[0] }}, your loyalty membership is ready.
        @else
            Your loyalty membership is ready.
        @endif
        Set your password below to start earning points.
    </p>
@endsection

@section('main')
    <p>Dear {{ $memberName ?: 'Member' }},</p>
    <p>
        Your {{ $hotelName }} loyalty membership has been created. You can now earn
        points on every stay, unlock exclusive offers, and progress through our
        tiered rewards programme.
    </p>

    <div class="panel">
        <div class="panel-title">Your membership</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Member number</td><td class="val">{{ $memberNumber }}</td></tr>
            <tr><td class="lbl">Tier</td><td class="val">{{ $tierName }}</td></tr>
            <tr><td class="lbl">Email</td><td class="val">{{ $email }}</td></tr>
        </table>
    </div>

    <p style="text-align:center;font-size:13px;color:rgba(255,255,255,0.62);margin:28px 0 14px;">
        Use the code below to set your password.<br>
        It is valid for <strong style="color:#ffffff;">48 hours</strong>.
    </p>

    <div style="text-align:center;margin:0 0 28px;">
        <div class="code-chip">{{ $code }}</div>
    </div>

    <div class="panel">
        <div class="panel-title">How to activate</div>
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Download the <strong style="color:#ffffff;">{{ $hotelName }}</strong> member app, or open the member portal.
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

    <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.45);margin-top:24px;">
        If you didn't expect this email, simply ignore it — your account stays inaccessible without the code.
    </p>
@endsection
