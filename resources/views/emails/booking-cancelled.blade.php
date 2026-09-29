@extends('emails.layouts.luxury')

@section('title', 'Your booking is cancelled')

@section('hero')
    <p class="hero-eyebrow">Cancelled</p>
    <h1 class="hero-headline">{{ $hotelName }}</h1>
    <p class="hero-subline">
        Your booking is cancelled, {{ $guestName }} — reference
        <strong style="color:#e3c66a;letter-spacing:1px;">{{ $bookingReference }}</strong>.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName }},</p>
    <p>As you asked, we have cancelled your booking at {{ $hotelName }}.</p>

    <div class="panel">
        <div class="panel-title">What was cancelled</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Reference</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Booking</td><td class="val">{{ $title }}</td></tr>
            <tr><td class="lbl">When</td><td class="val">{{ $when }}</td></tr>
        </table>
    </div>

    @if ($money === 'refunded')
        <p>
            <strong>Your payment.</strong><br>
            We have refunded <strong>{{ strtoupper($currency) }} {{ number_format($amount, 2) }}</strong> to the card you paid with.
            Refunds typically appear on your statement within <strong>5–10 business days</strong>, depending on your bank.
        </p>
    @elseif ($money === 'released')
        <p>
            <strong>Your payment.</strong><br>
            The hold of {{ strtoupper($currency) }} {{ number_format($amount, 2) }} on your card has been released; nothing was charged.
            Your bank may show the pending amount for a few more days before it disappears.
        </p>
    @else
        <p>Nothing was charged for this booking, so there is nothing to return.</p>
    @endif

    <p>
        If this was not you, or anything looks wrong, please reply to this email or contact us at
        <a href="mailto:{{ $supportEmail }}" style="color:#e3c66a;">{{ $supportEmail }}</a>
        and quote reference <strong>{{ $bookingReference }}</strong>.
    </p>

    <p>
        We hope to welcome you another time,<br>
        The {{ $hotelName }} team
    </p>
@endsection
