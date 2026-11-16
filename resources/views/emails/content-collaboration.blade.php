<!doctype html>
<html lang="{{ app()->getLocale() }}">
<body>
<h1>{{ __('content_collaboration.' . $kind) }}</h1>
<p>{{ $title }}</p>
@if ($note !== '')<p>{{ $note }}</p>@endif
<p><a href="{{ $url }}">{{ __('content_collaboration.open') }}</a></p>
<p>{{ __('content_collaboration.consent') }} <a href="{{ $settingsUrl }}">{{ __('content_collaboration.settings') }}</a></p>
</body>
</html>
