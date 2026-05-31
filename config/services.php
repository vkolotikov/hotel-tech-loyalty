<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],


    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY', ''),
        'model'   => env('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
    ],

    'saas' => [
        'jwt_secret'      => env('SAAS_JWT_SECRET', ''),
        'gateway_secret'  => env('SAAS_GATEWAY_SECRET', env('SAAS_JWT_SECRET', '')),
        'platform_url'    => env('SAAS_PLATFORM_URL', 'https://saas.hotel-tech.ai'),
        'api_url'         => env('SAAS_API_URL', 'https://saas.hotel-tech.ai/api'),
        'platform_admin_emails' => env('PLATFORM_ADMIN_EMAILS', 'info@hotel-tech.ai'),
    ],

    'cors' => [
        'allowed_origins' => env('CORS_ALLOWED_ORIGINS', '*'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'smoobu' => [
        'provider'       => env('SMOOBU_PROVIDER', 'mock'),
        'base_url'       => env('SMOOBU_BASE_URL', 'https://login.smoobu.com/api/'),
        'api_key'        => env('SMOOBU_API_KEY', ''),
        'channel_id'     => env('SMOOBU_CHANNEL_ID', ''),
        // 30s default — Smoobu's /reservations endpoint with
        // includePriceElements=1 + 100/page can legitimately take >8s
        // for properties with many bookings (Forrest Glamp at 1367
        // mirrored bookings was hitting cURL error 28 at 8s on every
        // sync page since 2026-05-25). Bumped 8 → 30.
        'timeout'        => env('SMOOBU_TIMEOUT_SECONDS', 30),
    ],

    /*
     * Meta Platform (Facebook Messenger Phase 1 — Instagram + WhatsApp later).
     *
     * The App ID + Secret belong to ONE Meta Developer App that every
     * customer's Page connection routes through. Provisioned by the
     * platform owner — see apps/loyalty/MESSENGER_INTEGRATION.md.
     *
     * Webhook verify token is invented by us and pasted into both the
     * Meta App dashboard (Messenger product → Webhooks → Add Callback URL)
     * AND this env var. They must match exactly for the GET handshake
     * to succeed.
     *
     * graph_version is pinned so we upgrade deliberately on Meta's
     * release schedule, not silently when they bump default. v25.0 as of
     * May 2026.
     */
    'meta' => [
        'app_id'        => env('META_APP_ID', ''),
        'app_secret'    => env('META_APP_SECRET', ''),
        'verify_token'  => env('META_WEBHOOK_VERIFY_TOKEN', ''),
        'graph_url'     => env('META_GRAPH_URL', 'https://graph.facebook.com'),
        'graph_version' => env('META_GRAPH_API_VERSION', 'v25.0'),
    ],

];
