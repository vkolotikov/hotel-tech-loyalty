<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Installed-app identity, per GTM host
    |--------------------------------------------------------------------------
    |
    | The web manifest is fetched by the browser before anyone signs in, so it
    | cannot know the tenant or the brand — there is no session to read. The
    | host is the only signal available at that moment, and it is enough: each
    | sub-brand has its own domain.
    |
    | This mirrors HOST_INDUSTRY in frontend/src/lib/industryHosts.ts. The two
    | lists must agree, so a test asserts every host there appears here rather
    | than trusting anyone to remember.
    |
    | short_name is what Windows prints under the Start Menu tile and in the
    | taskbar, where it is truncated hard — keep it under about twelve
    | characters and let `name` carry the full title.
    |
    */

    'default' => [
        'name'       => 'Hexa-Tech Admin',
        'short_name' => 'Hexa-Tech',
    ],

    'hosts' => [
        'hotel-tech.ai'            => ['name' => 'HotelTechAI Admin',     'short_name' => 'HotelTechAI'],
        'loyalty.hotel-tech.ai'    => ['name' => 'HotelTechAI Admin',     'short_name' => 'HotelTechAI'],
        'beauty-tech.uk'           => ['name' => 'BeautyTech Admin',      'short_name' => 'BeautyTech'],
        'med.hexa-tech.uk'         => ['name' => 'MedTechAI Admin',       'short_name' => 'MedTechAI'],
        'hospitality.hexa-tech.uk' => ['name' => 'HospitalityTech Admin', 'short_name' => 'Hospitality'],

        // The umbrella host deliberately carries no sub-brand — it is where a
        // visitor picks one — so it keeps the platform name.
        'app.hexa-tech.uk'         => ['name' => 'Hexa-Tech Admin',       'short_name' => 'Hexa-Tech'],
    ],

    /*
    | Painted behind the icon while the window opens, and used for the title
    | bar. Tenants restyle the app itself at runtime, which the manifest cannot
    | follow, so this stays on the product's own dark chrome.
    */
    'theme_color'      => '#0d0d0d',
    'background_color' => '#0d0d0d',

    /*
    | Right-click the taskbar icon on Windows and these appear as a jump list.
    | Every path must be a real route in the SPA; a shortcut to a 404 is worse
    | than no shortcut.
    */
    'shortcuts' => [
        ['name' => 'Members',    'url' => '/customers'],
        ['name' => 'Scan',       'url' => '/scan'],
        ['name' => 'Chat inbox', 'url' => '/chat-inbox'],
        ['name' => 'Analytics',  'url' => '/analytics'],
    ],
];
