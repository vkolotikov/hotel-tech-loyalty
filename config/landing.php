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
    |
    | The second group is a different hazard from the first, and a quieter
    | one. Every name there is a real directory under public/, and the front
    | controller serves existing paths BEFORE PHP -- Apache's
    | `RewriteCond %{REQUEST_FILENAME} !-d`, nginx's `try_files $uri $uri/`.
    | So /staff returns the Expo staff app shell and /build, /landing and
    | /widget return the web server's own 404: Laravel never runs, which
    | means nothing in the request cycle can notice or report it. The
    | tenant's POST is accepted with a 201, the admin shows the page as live,
    | and the address simply never works. LandingSlugTest scans public/ so a
    | directory added later cannot slip in unreserved.
    */
    'reserved_slugs' => [
        'api', 'admin', 'login', 'logout', 'register', 'spa', 'assets', 'storage',
        'www', 'sites', 'app', 'static', 'public', 'health', 'status', 'robots',
        'sitemap', 'favicon', 'preview', 'privacy', 'terms',
        // Directories under public/, shadowed by the web server before PHP.
        // 'spa', 'assets', 'app' and 'storage' are above already.
        'build', 'landing', 'staff', 'widget',
        // The framework health route. On the landing host /up matches
        // landing.show, so a tenant holding this slug would shadow it.
        'up',
    ],

    /** Seconds a published page may be cached. Short, and revalidating. */
    'cache_ttl' => env('LANDING_CACHE_TTL', 300),
];
