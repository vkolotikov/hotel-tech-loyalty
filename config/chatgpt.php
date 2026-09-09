<?php

return [
    // Enable only after configuring Passport keys and the registered OAuth client.
    'enabled' => (bool) env('CHATGPT_PLUGIN_ENABLED', false),
    'url' => rtrim(env('CHATGPT_PLUGIN_URL', 'https://app.hexa-tech.uk'), '/'),
    'client_id' => env('CHATGPT_PLUGIN_CLIENT_ID', ''),
    // An empty pilot list denies access. Broad rollout must be explicit.
    'organization_ids' => array_values(array_filter(array_map('trim', explode(',', env('CHATGPT_PLUGIN_ORGANIZATION_IDS', ''))),
        fn ($id) => ctype_digit($id) && (int) $id > 0)),
    'all_organizations' => (bool) env('CHATGPT_PLUGIN_ALL_ORGANIZATIONS', false),
    // Optional same-workspace SaaS billing principals for locally invited staff.
    'billing_user_ids' => array_values(array_filter(array_map('trim', explode(',', env('CHATGPT_PLUGIN_BILLING_USER_IDS', ''))),
        fn ($id) => ctype_digit($id) && (int) $id > 0)),
    'subscription_max_age_seconds' => 300,
    'subscription_lock_wait_seconds' => 22,
    'redirect_uris' => array_values(array_filter(array_map('trim', explode(',', env('CHATGPT_PLUGIN_REDIRECT_URIS', ''))))),
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', env('CHATGPT_PLUGIN_ALLOWED_ORIGINS', ''))))),
];
