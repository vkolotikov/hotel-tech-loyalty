<?php

// The native apps' versions (owner 2026-10-31), answered by GET /api/v1/apps/{app}/version. An app older than
// `min_version` shows only "Update" until it is updated; one older than `latest_version` offers the update. Set them
// in Laravel Cloud's environment when a release needs it (a new value takes effect with the next deploy). A value
// that is not a version (x.y.z) counts as none, so a typo never locks every phone out.
return [
    'staff' => [
        'min_version'    => env('STAFF_APP_MIN_VERSION', '1.0.0'),
        'latest_version' => env('STAFF_APP_LATEST_VERSION', '1.0.0'),
        'ios_url'        => env('STAFF_APP_IOS_URL'),
        'android_url'    => env('STAFF_APP_ANDROID_URL', 'https://play.google.com/store/apps/details?id=uk.hexatech.loyalty.staff'),
    ],
];
