<?php

// Voice is off by default. An empty allowlist denies every organization, and a
// medical organization is denied even when allowlisted until it also appears in
// the medical list, where it remains read-only.
return [
    'enabled' => (bool) env('VOICE_ENABLED', false),

    'organization_ids' => array_values(array_filter(
        array_map('trim', explode(',', env('VOICE_ORGANIZATION_IDS', ''))),
        fn ($id) => ctype_digit($id) && (int) $id > 0)),

    'medical_organization_ids' => array_values(array_filter(
        array_map('trim', explode(',', env('VOICE_MEDICAL_ORGANIZATION_IDS', ''))),
        fn ($id) => ctype_digit($id) && (int) $id > 0)),

    // A write proposal must be confirmed within this window.
    'proposal_ttl_seconds' => 120,

    // The gateway's own model settings. Voice answers are short, so the token
    // ceiling is low; the turn budget exists because the Alexa adapter has
    // roughly eight seconds for an entire turn.
    'model' => env('VOICE_MODEL', 'gpt-4o'),
    'provider' => env('VOICE_PROVIDER', 'openai'),
    'max_tokens' => 400,
    'max_tool_calls' => 4,
    'turn_budget_seconds' => 6,
];
