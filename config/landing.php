<?php

return [
    /*
    | The host landing pages are served from. It must NEVER serve the admin
    | SPA: the admin keeps a non-expiring, all-abilities Sanctum token in
    | localStorage, which same-origin JavaScript can read. Separating the
    | origin is what reduces an XSS on customer content from a full tenant
    | compromise to a defaced page.
    */
    'host' => env('LANDING_HOST', 'sites.hexa-tech.uk'),

    /*
    | Words a tenant may not take. Our own path segments, plus every industry
    | id, which would otherwise read as one of our sub-brands.
    */
    'reserved_slugs' => [
        'api', 'admin', 'login', 'logout', 'register', 'spa', 'assets', 'storage',
        'www', 'sites', 'app', 'static', 'public', 'health', 'status', 'robots',
        'sitemap', 'favicon', 'preview', 'privacy', 'terms',
        // The framework health route. On the landing host /up matches
        // landing.show, so a tenant holding this slug would shadow it.
        'up',
    ],

    /** Seconds a published page may be cached. Short, and revalidating. */
    'cache_ttl' => env('LANDING_CACHE_TTL', 300),
];
