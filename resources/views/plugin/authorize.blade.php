<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Allow ChatGPT access to Hexa-Tech?</title>
    <link rel="stylesheet" href="/assets/chatgpt/connect.css">
</head>
<body>
<main>
    <p class="eyebrow">HEXA-TECH / CHATGPT</p>
    <h1>Allow access to your workspace?</h1>
    <p><strong>{{ $client->name }}</strong> is requesting access as {{ $user->email }}.</p>
    <p>Workspace: <strong>{{ $user->organization?->name ?? 'Your Hexa-Tech workspace' }}</strong></p>
    <ul>
        <li>Find customers and read their details.</li>
        <li>Find bookings and read their details.</li>
        <li>Add internal notes to customers and bookings when you request it.</li>
        <li>Use only the features and brands your staff account can access.</li>
    </ul>
    <p class="note">Information returned to ChatGPT is shared with ChatGPT. Changes require your instructions and remain subject to your Hexa-Tech permissions.</p>
    <form method="post" action="{{ route('passport.authorizations.approve') }}">
        @csrf
        <input type="hidden" name="auth_token" value="{{ $authToken }}">
        <button type="submit">Allow access</button>
    </form>
    <form method="post" action="{{ route('passport.authorizations.deny') }}">
        @csrf
        @method('DELETE')
        <input type="hidden" name="auth_token" value="{{ $authToken }}">
        <button type="submit" class="secondary">Cancel</button>
    </form>
</main>
</body>
</html>
