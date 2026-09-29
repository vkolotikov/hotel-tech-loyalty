@extends('emails.layouts.luxury')

@section('title', 'A member cancelled a booking')

@section('hero')
    <p class="hero-eyebrow">Cancelled in the member portal</p>
    <h1 class="hero-headline">{{ $bookingReference }}</h1>
    <p class="hero-subline">{{ $guestName }} cancelled {{ $kind === 'stay' ? 'a stay' : 'an appointment' }} at {{ $hotelName }}.</p>
@endsection

@section('main')
    <div class="panel">
        <div class="panel-title">The booking</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Reference</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Member</td><td class="val">{{ $guestName }}</td></tr>
            @if ($guestEmail)
                <tr><td class="lbl">Email</td><td class="val">{{ $guestEmail }}</td></tr>
            @endif
            <tr><td class="lbl">Booking</td><td class="val">{{ $title }}</td></tr>
            <tr><td class="lbl">When</td><td class="val">{{ $when }}</td></tr>
        </table>
    </div>

    <div class="panel">
        <div class="panel-title">The money</div>
        @if ($money === 'refunded')
            <p>Refunded: {{ strtoupper($currency) }} {{ number_format($amount, 2) }}, in full, to the member's card.</p>
        @elseif ($money === 'released')
            <p>Released: the hold of {{ strtoupper($currency) }} {{ number_format($amount, 2) }} on the member's card. Nothing was charged.</p>
        @else
            <p>Nothing was paid online for this booking.</p>
        @endif
        @if ($couponReleased)
            <p>The coupon used for this booking was returned to the member.</p>
        @endif
    </div>

    @if ($pmsFailed)
        <p><strong>The reservation could NOT be cancelled in the booking system. Please cancel it there by hand.</strong> <a href="{{ $adminUrl }}" style="color:#e3c66a;">Open the console</a></p>
    @else
        <p>The time is free to book again. <a href="{{ $adminUrl }}" style="color:#e3c66a;">Open the console</a></p>
    @endif
@endsection
