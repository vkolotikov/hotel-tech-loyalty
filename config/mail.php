<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send any email
    | messages sent by your application. Alternative mailers may be setup
    | and used as needed; however, this mailer will be used by default.
    |
    */

    'default' => env('MAIL_MAILER', 'smtp'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    | Laravel supports a variety of mail "transport" drivers to be used while
    | sending an e-mail. You will specify which one you are using for your
    | mailers below. You are free to add additional mailers as required.
    |
    | Supported: "smtp", "sendmail", "mailgun", "ses", "ses-v2",
    |            "postmark", "log", "array", "failover", "roundrobin"
    |
    */

    'mailers' => [
        'smtp' => [
            'transport' => 'smtp',
            'url' => env('MAIL_URL'),
            'host' => env('MAIL_HOST', 'smtp.mailgun.org'),
            'port' => env('MAIL_PORT', 587),
            'encryption' => env('MAIL_ENCRYPTION', 'tls'),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => null,
            'local_domain' => env('MAIL_EHLO_DOMAIN'),
        ],

        'ses' => [
            'transport' => 'ses',
        ],

        'postmark' => [
            'transport' => 'postmark',
            // 'message_stream_id' => null,
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'mailgun' => [
            'transport' => 'mailgun',
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'sendmail' => [
            'transport' => 'sendmail',
            'path' => env('MAIL_SENDMAIL_PATH', '/usr/sbin/sendmail -bs -i'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'failover' => [
            'transport' => 'failover',
            'mailers' => [
                'smtp',
                'log',
            ],
        ],

        'roundrobin' => [
            'transport' => 'roundrobin',
            'mailers' => [
                'ses',
                'postmark',
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all e-mails sent by your application to be sent from
    | the same address. Here, you may specify a name and address that is
    | used globally for all e-mails that are sent by your application.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | Campaign pacing
    |--------------------------------------------------------------------------
    |
    | Seconds to wait between chunks of SendEmailCampaignChunk::CHUNK (100)
    | recipients. Shared SMTP relays enforce an hourly ceiling — commonly a few
    | hundred messages — and exceeding it gets mail deferred or the account
    | throttled, which reads as a spam run to the receiving side.
    |
    | 60s => 100 recipients/minute => 6,000/hour. Raise it only to whatever the
    | relay actually permits; a dedicated ESP can take far more.
    |
    */

    'campaign_chunk_seconds' => env('MAIL_CAMPAIGN_CHUNK_SECONDS', 60),

    /*
    |--------------------------------------------------------------------------
    | Campaign hourly ceilings
    |--------------------------------------------------------------------------
    |
    | Chunk spacing paces ONE campaign. These cap the total, which is the only
    | number the mail provider actually sees: two campaigns running at once
    | otherwise send twice as much, and ten tenants ten times as much.
    |
    | per_org  — stops one tenant's big stale list consuming the whole budget,
    |            and their bounce rate becoming everyone's problem. All tenants
    |            share one sending domain, so reputation damage is collective.
    | global   — protects the provider's own ceiling. On shared hosting this is
    |            a few hundred per hour; SES production accounts allow far more,
    |            so raise both after the cutover.
    |
    | Set either to 0 to disable that ceiling. Transactional mail is never
    | subject to these — see CampaignRateLimiter.
    |
    */

    'campaign_hourly_limit_per_org' => env('MAIL_CAMPAIGN_HOURLY_PER_ORG', 2000),
    'campaign_hourly_limit_global'  => env('MAIL_CAMPAIGN_HOURLY_GLOBAL', 6000),

    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
        'name' => env('MAIL_FROM_NAME', 'Example'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Markdown Mail Settings
    |--------------------------------------------------------------------------
    |
    | If you are using Markdown based email rendering, you may configure your
    | theme and component paths here, allowing you to customize the design
    | of the emails. Or, you may simply stick with the Laravel defaults!
    |
    */

    'markdown' => [
        'theme' => 'default',

        'paths' => [
            resource_path('views/vendor/mail'),
        ],
    ],

];
