@extends('emails.layouts.luxury')

@section('title', $isFull ? 'Your refund is on its way' : 'Partial refund issued')

@section('hero')
    <p class="hero-eyebrow">{{ $isFull ? 'Refund Issued' : 'Partial Refund Issued' }}</p>
    <h1 class="hero-headline">{{ $hotelName }}</h1>
    <p class="hero-subline">
        We've issued your refund, {{ $guestName }} — reference
        <strong style="color:#e3c66a;letter-spacing:1px;">{{ $bookingReference }}</strong>.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName }},</p>
    <p>
        @if ($isFull)
            We've processed a full refund for your booking at {{ $hotelName }}. The original charge will be reversed on the card you used to pay.
        @else
            We've processed a partial refund of <strong>{{ strtoupper($currency) }} {{ number_format($refundAmount, 2) }}</strong> for your booking at {{ $hotelName }}. The amount will appear back on the card you used to pay.
        @endif
    </p>

    <div class="panel">
        <div class="panel-title">Refund details</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Reference</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Room</td><td class="val">{{ $unitName }}</td></tr>
            <tr><td class="lbl">Original check-in</td><td class="val">{{ $checkIn }}</td></tr>
            <tr><td class="lbl">Original check-out</td><td class="val">{{ $checkOut }}</td></tr>
            <tr><td class="lbl">Refund amount</td><td class="val"><strong>{{ strtoupper($currency) }} {{ number_format($refundAmount, 2) }}</strong></td></tr>
            <tr><td class="lbl">Type</td><td class="val">{{ $isFull ? 'Full refund' : 'Partial refund' }}</td></tr>
        </table>
    </div>

    <p>
        <strong>When will I see the refund?</strong><br>
        Refunds typically appear on your statement within <strong>5–10 business days</strong>, depending on your bank. If you don't see it after that, please reach out and we'll trace it for you.
    </p>

    @if ($isFull)
        <p>
            Your reservation has been cancelled. We're sorry it didn't work out this time — we'd love to host you on a future stay whenever you're ready.
        </p>
    @endif

    <p>
        If anything looks wrong on this refund, please reply to this email or contact us at
        <a href="mailto:{{ $supportEmail }}" style="color:#e3c66a;">{{ $supportEmail }}</a>
        and quote reference <strong>{{ $bookingReference }}</strong>.
    </p>

    <p>
        With thanks,<br>
        The {{ $hotelName }} team
    </p>
@endsection
