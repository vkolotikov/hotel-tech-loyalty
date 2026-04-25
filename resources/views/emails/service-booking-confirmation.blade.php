@extends('emails.layouts.luxury')

@section('title', 'Reservation confirmed')

@section('hero')
    <p class="hero-eyebrow">Reservation Confirmed</p>
    <h1 class="hero-headline">{{ $serviceName }}</h1>
    <p class="hero-subline">
        We've reserved your appointment, {{ $guestName }} — confirmation
        <strong style="color:#e3c66a;letter-spacing:1px;">{{ $bookingReference }}</strong>.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName }},</p>
    <p>
        Your {{ $serviceName }} appointment at {{ $hotelName }} is confirmed.
        We're looking forward to taking care of you.
    </p>

    @php
        $start = \Carbon\Carbon::parse($startAt);
        $end = $start->copy()->addMinutes($durationMinutes);
        $hours = intdiv($durationMinutes, 60);
        $mins = $durationMinutes % 60;
        $durationLabel = $hours > 0
            ? ($hours . 'h' . ($mins > 0 ? ' ' . $mins . 'm' : ''))
            : $mins . ' min';
    @endphp

    <div class="panel">
        <div class="panel-title">Appointment</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Service</td><td class="val">{{ $serviceName }}</td></tr>
            @if($masterName)
                <tr><td class="lbl">Provider</td><td class="val">{{ $masterName }}</td></tr>
            @endif
            <tr><td class="lbl">Date</td><td class="val">{{ $start->format('l, F j, Y') }}</td></tr>
            <tr><td class="lbl">Time</td><td class="val">{{ $start->format('g:i A') }} – {{ $end->format('g:i A') }}</td></tr>
            <tr><td class="lbl">Duration</td><td class="val">{{ $durationLabel }}</td></tr>
            @if($partySize > 1)
                <tr><td class="lbl">Guests</td><td class="val">{{ $partySize }}</td></tr>
            @endif
        </table>
    </div>

    <div class="panel">
        <div class="panel-title">Pricing</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="lbl">{{ $serviceName }}</td>
                <td class="val">{{ $currency }} {{ number_format($servicePrice, 2) }}</td>
            </tr>
            @foreach($extras as $x)
                <tr>
                    <td class="lbl">{{ $x['name'] }}{{ ($x['quantity'] ?? 1) > 1 ? ' × ' . $x['quantity'] : '' }}</td>
                    <td class="val">{{ $currency }} {{ number_format($x['line_total'], 2) }}</td>
                </tr>
            @endforeach
        </table>
        <table role="presentation" class="row total-row" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="lbl">Total</td>
                <td class="val">{{ $currency }} {{ number_format($grossTotal, 2) }}</td>
            </tr>
        </table>
    </div>

    @if(!empty($cancellationPolicy))
        <div class="panel">
            <div class="panel-title">Cancellation policy</div>
            <p style="font-size:12px;color:rgba(255,255,255,0.62);line-height:1.7;margin:0;">
                {{ $cancellationPolicy }}
            </p>
        </div>
    @endif

    <p style="text-align:center;font-size:13px;color:rgba(255,255,255,0.55);margin-top:24px;">
        Please arrive 10 minutes before your appointment so we can welcome you properly.<br>
        See you soon.
    </p>
@endsection
