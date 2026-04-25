@extends('emails.layouts.luxury')

@section('title', 'Your booking is confirmed')

@section('hero')
    <p class="hero-eyebrow">Booking Confirmed</p>
    <h1 class="hero-headline">{{ $hotelName }}</h1>
    <p class="hero-subline">
        Your stay is booked, {{ $guestName }} — confirmation reference
        <strong style="color:#e3c66a;letter-spacing:1px;">{{ $bookingReference }}</strong>.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName }},</p>
    <p>
        Thank you for choosing {{ $hotelName }}. We're looking forward to welcoming
        you{{ $checkIn ? ' on ' . \Carbon\Carbon::parse($checkIn)->format('l, F j') : '' }} —
        full details of your reservation are below.
    </p>

    <div class="panel">
        <div class="panel-title">Stay details</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Check-in</td><td class="val">{{ \Carbon\Carbon::parse($checkIn)->format('M j, Y') }}</td></tr>
            <tr><td class="lbl">Check-out</td><td class="val">{{ \Carbon\Carbon::parse($checkOut)->format('M j, Y') }}</td></tr>
            <tr><td class="lbl">Nights</td><td class="val">{{ $nights }}</td></tr>
            <tr><td class="lbl">Room</td><td class="val">{{ $unitName }}</td></tr>
            <tr><td class="lbl">Guests</td><td class="val">{{ $adults }} {{ $adults === 1 ? 'adult' : 'adults' }}@if($children > 0), {{ $children }} {{ $children === 1 ? 'child' : 'children' }}@endif</td></tr>
        </table>
    </div>

    <div class="panel">
        <div class="panel-title">Pricing</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="lbl">Room ({{ $nights }} {{ $nights === 1 ? 'night' : 'nights' }} × {{ $currency }} {{ number_format($pricePerNight, 2) }})</td>
                <td class="val">{{ $currency }} {{ number_format($roomTotal, 2) }}</td>
            </tr>
            @foreach($extras as $x)
                <tr>
                    <td class="lbl">{{ $x['name'] ?? $x['extra_name'] ?? 'Extra' }}{{ isset($x['quantity']) && $x['quantity'] > 1 ? ' × ' . $x['quantity'] : '' }}</td>
                    <td class="val">{{ $currency }} {{ number_format($x['line_total'] ?? 0, 2) }}</td>
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

    @if(!empty($policies['cancellation']) || !empty($policies['check_in_time']) || !empty($policies['check_out_time']))
        <div class="panel">
            <div class="panel-title">Good to know</div>
            @if(!empty($policies['check_in_time']))
                <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                    <tr><td class="lbl">Check-in from</td><td class="val">{{ $policies['check_in_time'] }}</td></tr>
                </table>
            @endif
            @if(!empty($policies['check_out_time']))
                <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                    <tr><td class="lbl">Check-out by</td><td class="val">{{ $policies['check_out_time'] }}</td></tr>
                </table>
            @endif
            @if(!empty($policies['cancellation']))
                <p style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6;margin:14px 0 0;">
                    <strong style="color:rgba(255,255,255,0.78);">Cancellation:</strong> {{ $policies['cancellation'] }}
                </p>
            @endif
        </div>
    @endif

    <p style="text-align:center;font-size:13px;color:rgba(255,255,255,0.55);margin-top:24px;">
        We'll send your final pre-arrival details a few days before check-in.<br>
        See you soon.
    </p>
@endsection
