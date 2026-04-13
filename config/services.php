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
        'model'   => env('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
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
        'webhook_secret' => env('SMOOBU_WEBHOOK_SECRET', ''),
        'timeout'        => env('SMOOBU_TIMEOUT_SECONDS', 8),
    ],

];
