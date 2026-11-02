<?php

return [
    'brand_id' => (int) env('CONTACTS_FEED_BRAND_ID', 0),
    // Only a SHA-256 digest is stored in the CRM; the bearer belongs to Contacts.
    'token_hash' => env('CONTACTS_FEED_TOKEN_HASH', ''),
];
