<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Connect Hexa-Tech to ChatGPT</title>
    <link rel="stylesheet" href="/assets/chatgpt/connect.css">
    <script src="/assets/chatgpt/connect.js" defer></script>
</head>
<body>
<main>
    <p class="eyebrow">HEXA-TECH / CHATGPT</p>
    <h1>Connect your workspace</h1>
    <p>Sign in to Hexa-Tech in the tab below, then return here to choose whether to allow access to CRM leads, customers and bookings.</p>
    <a class="button secondary" href="/login" target="_blank" rel="noopener">Open Hexa-Tech sign in</a>
    <button id="connect" type="button" data-session-url="{{ route('plugin.session') }}">Continue with signed-in account</button>
    <p id="status" role="status" aria-live="polite"></p>
    <p class="note">Your Hexa-Tech password and app sign-in token stay with Hexa-Tech.</p>
</main>
</body>
</html>
