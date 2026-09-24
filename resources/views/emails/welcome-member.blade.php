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
    @php
        // Phase 8.x — industry-aware "every stay" copy. Hotel orgs see
        // verbatim back-compat; beauty/restaurant get "every visit",
        // medical orgs typically never reach this email per decision
        // #5 but the medical fallback is defensive. $nouns is provided
        // by HasIndustryVocab trait via the Mailable's with().
        $visitNoun = $nouns['stays'] ?? 'stays';
        $industryId = $industry ?? 'hotel';
    @endphp
    <p>Dear {{ $memberName ?: 'Member' }},</p>
    <p>
        Your {{ $hotelName }} loyalty membership has been created. You can now earn
        points on every {{ rtrim($visitNoun, 's') }}, unlock exclusive offers, and progress through our
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
        @if (!empty($portalUrl))
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Open the member portal:
            <a href="{{ $portalUrl }}" style="color:#e3c66a;font-weight:600;">{{ $portalUrl }}</a>
        </p>
        @else
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Open the <strong style="color:#ffffff;">{{ $hotelName }}</strong> member portal or member app.
        </p>
        @endif
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">2.</strong>
            Enter your email <strong style="color:#ffffff;">{{ $email }}</strong> and choose 'I already have a code'.
        </p>
        <p style="margin:0;">
            <strong style="color:#e3c66a;">3.</strong>
            Enter the 6-digit code above and choose your password.
        </p>
    </div>

    <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.45);margin-top:24px;">
        If you didn't expect this email, simply ignore it — your account stays inaccessible without the code.
    </p>
@endsection
