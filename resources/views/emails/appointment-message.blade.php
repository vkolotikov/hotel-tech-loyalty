@extends('emails.layouts.luxury')

@section('title', $subject)

@section('hero')
    <p class="hero-eyebrow">{{ $venue['name'] }}</p>
    <h1 class="hero-headline">{{ $headline }}</h1>
@endsection

@section('main')
    <p>{{ $greeting }}</p>
    <p>{{ $intro }}</p>
    @foreach ($rows as $row)
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">{{ $row['label'] }}</td><td class="val">{{ $row['value'] }}</td></tr>
        </table>
    @endforeach
    <p>{{ $closing }}</p>
@endsection

@section('footer')
    <p>{{ $venue['name'] }}</p>
    @if ($venue['address'])<p>{{ $venue['address'] }}</p>@endif
    @if ($venue['phone'])<p>{{ $venue['phone'] }}</p>@endif
    @if ($venue['email'])<p><a href="mailto:{{ $venue['email'] }}">{{ $venue['email'] }}</a></p>@endif
@endsection
