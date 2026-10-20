{{--
  A brand's link-in-bio page (spec 2026-10-19 §6.2, §6.3), on the public host under the landing CSP: our own
  stylesheet, and the brand colour through the one nonce'd block. Its values come from CssColor::safe only, so none of
  them is a customer string. No scripts, no style attributes, {{ }} only.
--}}
<!doctype html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }}</title>
@if ($line)
<meta name="description" content="{{ $line }}">
@endif
<meta property="og:title" content="{{ $title }}">
@if ($og_image)
<meta property="og:image" content="{{ $og_image }}">
@endif
<link rel="stylesheet" href="{{ asset('landing/content-public.css') }}{{ \App\Support\AssetVersion::query('landing/content-public.css') }}">
<style nonce="{{ $cspNonce }}">:root{--cp-brand: {{ $brand }};--cp-on-brand: {{ $onBrand }};}</style>
</head>
<body class="cp">
<main class="cp-bio">
  <header class="cp-head">
    @if ($logo)
      <img class="cp-logo" src="{{ $logo }}" alt="{{ __('content_public.logo', ['name' => $title], $lang) }}" width="88" height="88">
    @else
      <span class="cp-logo cp-initials" aria-hidden="true">{{ $initials }}</span>
    @endif
    <h1 class="cp-title">{{ $title }}</h1>
    @if ($line)
      <p class="cp-line">{{ $line }}</p>
    @endif
  </header>
  @if ($buttons)
    <nav class="cp-buttons" aria-label="{{ __('content_public.links', [], $lang) }}">
      <ul>
        @foreach ($buttons as $button)
          <li><a class="cp-button" href="{{ $button['href'] }}">{{ $button['label'] }}</a></li>
        @endforeach
      </ul>
    </nav>
  @endif
  @if ($tiles)
    <section class="cp-posts" aria-labelledby="cp-posts-title">
      <h2 id="cp-posts-title">{{ __('content_public.latest', [], $lang) }}</h2>
      <ul class="cp-tiles">
        @foreach ($tiles as $tile)
          <li>
            <a class="cp-tile" href="{{ $tile['href'] }}">
              @if ($tile['picture'])
                <img src="{{ $tile['picture'] }}" alt="{{ $tile['text'] }}" loading="lazy">
              @else
                <span class="cp-tile-text">{{ $tile['text'] }}</span>
              @endif
              @if ($tile['date'])
                <time datetime="{{ $tile['date'] }}">{{ $tile['date_label'] }}</time>
              @endif
            </a>
          </li>
        @endforeach
      </ul>
    </section>
  @endif
</main>
</body>
</html>
