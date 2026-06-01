@extends('emails.layouts.luxury')

@section('title', 'Your booking is confirmed')

@php
    use Illuminate\Support\Carbon;

    $accent          = $brandPrimaryColor ?: '#e3c66a';
    $statusKey       = strtolower($paymentStatus ?? '');
    $statusLabel     = match ($statusKey) {
        'paid'       => 'Paid',
        'authorized' => 'Card authorized',
        'pending'    => 'Payment pending',
        'refunded'   => 'Refunded',
        'partially_refunded' => 'Partially refunded',
        ''           => null,
        default      => ucfirst(str_replace('_', ' ', $statusKey)),
    };
    $statusColor     = match ($statusKey) {
        'paid'       => '#5fd28a',
        'authorized' => '#e3c66a',
        'refunded', 'partially_refunded' => '#f47c7c',
        'pending'    => '#d8b453',
        default      => 'rgba(255,255,255,0.55)',
    };
    $methodLabel = null;
    if ($paymentMethod) {
        $m = strtolower($paymentMethod);
        if ($m === 'card' || $m === 'stripe') {
            $brand = $paymentBrand ? ucfirst($paymentBrand) : 'Card';
            $methodLabel = $paymentLast4 ? "{$brand} ending {$paymentLast4}" : $brand;
        } elseif ($m === 'mock') {
            $methodLabel = 'Test booking (no charge)';
        } elseif ($m === 'cash') {
            $methodLabel = 'Cash on arrival';
        } else {
            $methodLabel = ucfirst(str_replace('_', ' ', $m));
        }
    }
@endphp

@section('hero')
    @if(!empty($brandLogoUrl))
        <div style="margin:0 0 18px;">
            <img src="{{ $brandLogoUrl }}" alt="{{ $hotelName }}" height="36" style="height:36px;width:auto;border:0;display:block;">
        </div>
    @endif
    <p class="hero-eyebrow" style="color:{{ $accent }};">Booking Confirmed</p>
    <h1 class="hero-headline">{{ $hotelName }}</h1>
    <p class="hero-subline">
        Thank you {{ $guestName }} — confirmation
        <strong style="color:{{ $accent }};letter-spacing:1px;">{{ $bookingReference }}</strong>
        @if($bookingDate)
            <br><span style="color:rgba(255,255,255,0.45);font-size:12px;">Booked {{ Carbon::parse($bookingDate)->format('M j, Y · g:i A') }}</span>
        @endif
    </p>
@endsection

@section('main')
    <p>
        Dear {{ $guestName }}, your reservation is confirmed. We're looking forward to
        welcoming you{{ $checkIn ? ' on ' . Carbon::parse($checkIn)->format('l, F j') : '' }}.
        Below is the full breakdown of your stay — please keep this email for your records.
    </p>

    {{-- Reservation summary --}}
    <div class="panel">
        <div class="panel-title">Reservation</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Confirmation #</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Check-in</td><td class="val">{{ Carbon::parse($checkIn)->format('D, M j Y') }}</td></tr>
            <tr><td class="lbl">Check-out</td><td class="val">{{ Carbon::parse($checkOut)->format('D, M j Y') }}</td></tr>
            <tr><td class="lbl">Nights</td><td class="val">{{ $nights }}</td></tr>
            <tr>
                <td class="lbl">Guests</td>
                <td class="val">
                    {{ $adults }} {{ $adults === 1 ? 'adult' : 'adults' }}@if($children > 0), {{ $children }} {{ $children === 1 ? 'child' : 'children' }}@endif
                </td>
            </tr>
            @if($arrivalTime)
                <tr><td class="lbl">Arrival time</td><td class="val">{{ $arrivalTime }}</td></tr>
            @endif
        </table>
    </div>

    {{-- Unit / room card --}}
    <div class="panel">
        <div class="panel-title">Your room</div>
        @if(!empty($unitImageUrl))
            <div style="margin:0 0 14px;border-radius:10px;overflow:hidden;">
                <img src="{{ $unitImageUrl }}" alt="{{ $unitName }}" width="540" style="display:block;width:100%;max-width:540px;height:auto;border:0;border-radius:10px;">
            </div>
        @endif
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;color:#ffffff;font-weight:600;">{{ $unitName }}</div>
        @if($unitMaxGuests)
            <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:6px;letter-spacing:0.4px;">Sleeps up to {{ $unitMaxGuests }}</div>
        @endif
    </div>

    {{-- Itemised pricing --}}
    <div class="panel">
        <div class="panel-title">Price details</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="lbl">{{ $unitName }} ({{ $nights }} {{ $nights === 1 ? 'night' : 'nights' }} × {{ $currency }} {{ number_format($pricePerNight, 2) }})</td>
                <td class="val">{{ $currency }} {{ number_format($roomTotal, 2) }}</td>
            </tr>
            @foreach($extras as $x)
                @php
                    $exName  = $x['name'] ?? $x['extra_name'] ?? 'Extra';
                    $exQty   = (int) ($x['quantity'] ?? 1);
                    $exTotal = (float) ($x['line_total'] ?? $x['total'] ?? 0);
                    $exUnit  = $exQty > 0 ? round($exTotal / $exQty, 2) : $exTotal;
                @endphp
                <tr>
                    <td class="lbl">
                        {{ $exName }}@if($exQty > 1) <span style="color:rgba(255,255,255,0.45);">× {{ $exQty }} @ {{ $currency }} {{ number_format($exUnit, 2) }}</span>@endif
                    </td>
                    <td class="val">{{ $currency }} {{ number_format($exTotal, 2) }}</td>
                </tr>
            @endforeach
            @if($extrasTotal > 0 && count($extras) > 1)
                <tr>
                    <td class="lbl" style="color:rgba(255,255,255,0.45);font-size:12px;">Extras subtotal</td>
                    <td class="val" style="color:rgba(255,255,255,0.7);font-size:12px;">{{ $currency }} {{ number_format($extrasTotal, 2) }}</td>
                </tr>
            @endif
        </table>
        <table role="presentation" class="row total-row" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="lbl">Total</td>
                <td class="val">{{ $currency }} {{ number_format($grossTotal, 2) }}</td>
            </tr>
        </table>
    </div>

    {{-- Payment --}}
    @if($statusLabel || $methodLabel)
        <div class="panel">
            <div class="panel-title">Payment</div>
            <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                @if($statusLabel)
                    <tr>
                        <td class="lbl">Status</td>
                        <td class="val">
                            <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.04);color:{{ $statusColor }};font-weight:700;font-size:12px;letter-spacing:0.5px;">● {{ $statusLabel }}</span>
                        </td>
                    </tr>
                @endif
                @if($methodLabel)
                    <tr><td class="lbl">Method</td><td class="val">{{ $methodLabel }}</td></tr>
                @endif
                @if($statusKey === 'paid')
                    <tr><td class="lbl">Captured</td><td class="val">{{ $currency }} {{ number_format($grossTotal, 2) }}</td></tr>
                @endif
            </table>
            @if($receiptUrl)
                <p style="margin:14px 0 0;font-size:12px;color:rgba(255,255,255,0.6);">
                    <a href="{{ $receiptUrl }}" style="color:{{ $accent }};text-decoration:none;">View official receipt →</a>
                </p>
            @endif
        </div>
    @endif

    {{-- Guest contact --}}
    @if($guestEmail || $guestPhone || $guestAddress)
        <div class="panel">
            <div class="panel-title">Guest details</div>
            <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                <tr><td class="lbl">Name</td><td class="val">{{ $guestName }}</td></tr>
                @if($guestEmail)
                    <tr><td class="lbl">Email</td><td class="val">{{ $guestEmail }}</td></tr>
                @endif
                @if($guestPhone)
                    <tr><td class="lbl">Phone</td><td class="val">{{ $guestPhone }}</td></tr>
                @endif
                @if($guestAddress)
                    <tr><td class="lbl">Address</td><td class="val">{{ $guestAddress }}</td></tr>
                @endif
            </table>
        </div>
    @endif

    {{-- Special requests --}}
    @if($specialRequests)
        <div class="panel" style="border-color:rgba(245,158,11,0.35);background:rgba(245,158,11,0.06);">
            <div class="panel-title" style="border-bottom-color:rgba(245,158,11,0.25);">Your requests</div>
            <p style="margin:0;font-size:13px;color:#fcd34d;line-height:1.7;white-space:pre-wrap;">{{ $specialRequests }}</p>
            <p style="margin:10px 0 0;font-size:11px;color:rgba(255,255,255,0.45);">
                We've passed these along to the team and will do our best to accommodate.
            </p>
        </div>
    @endif

    {{-- What's next --}}
    <div class="panel">
        <div class="panel-title">What's next</div>
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
        @if($contactPhone)
            <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                <tr><td class="lbl">Contact</td><td class="val"><a href="tel:{{ $contactPhone }}" style="color:{{ $accent }};text-decoration:none;">{{ $contactPhone }}</a></td></tr>
            </table>
        @endif
        @if($hotelAddress)
            <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
                <tr><td class="lbl">Address</td><td class="val">{{ $hotelAddress }}</td></tr>
            </table>
        @endif
        @if(!empty($policies['cancellation']))
            <p style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.65;margin:14px 0 0;">
                <strong style="color:rgba(255,255,255,0.82);">Cancellation policy:</strong> {{ $policies['cancellation'] }}
            </p>
        @endif
        <p style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.65;margin:14px 0 0;">
            We'll send your pre-arrival details a few days before check-in. If you have any
            questions, simply reply to this email — we're happy to help.
        </p>
    </div>

    <p style="text-align:center;font-size:13px;color:rgba(255,255,255,0.55);margin-top:24px;">
        See you soon.<br>
        <span style="font-family:'Cormorant Garamond',Georgia,serif;color:{{ $accent }};font-size:16px;letter-spacing:0.5px;">— The {{ $hotelName }} team</span>
    </p>
@endsection
