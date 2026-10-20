{{-- A switched-off short link (spec 2026-10-19 §5.3): its Link was cleared or its button removed. --}}
<!doctype html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ __('content_public.link_off', [], $lang) }}</title>
<link rel="stylesheet" href="{{ asset('landing/content-public.css') }}{{ \App\Support\AssetVersion::query('landing/content-public.css') }}">
</head>
<body class="cp">
<main class="cp-off">
  <h1>{{ __('content_public.link_off', [], $lang) }}</h1>
</main>
</body>
</html>
