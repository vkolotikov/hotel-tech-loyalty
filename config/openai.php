<?php

return [

    /*
    |--------------------------------------------------------------------------
    | OpenAI API Key and Organization
    |--------------------------------------------------------------------------
    |
    | Here you may specify your OpenAI API Key and organization. This will be
    | used to authenticate with the OpenAI API - you can find your API key
    | and organization on your OpenAI dashboard, at https://openai.com.
    */

    'api_key' => env('OPENAI_API_KEY', ''),
    'organization' => env('OPENAI_ORGANIZATION'),

    /*
    |--------------------------------------------------------------------------
    | Request Timeout
    |--------------------------------------------------------------------------
    |
    | The timeout may be used to specify the maximum number of seconds to wait
    | for a response. By default, the client will time out after 30 seconds.
    */

    'request_timeout' => env('OPENAI_REQUEST_TIMEOUT', 30),

    /*
    |--------------------------------------------------------------------------
    | Default Model
    |--------------------------------------------------------------------------
    */

    'model' => env('OPENAI_MODEL', 'gpt-4o'),

    /*
    |--------------------------------------------------------------------------
    | Content Planner Image Model
    |--------------------------------------------------------------------------
    |
    | Current default: gpt-image-2.6-sunburst; alternative: gpt-image-2.6-flare.
    | ContentModels canonicalizes legacy overrides before use. Unknown models
    | are refused locally. An explicitly configured fallback is attempted only
    | after a definite model-access/verification refusal, never a timeout.
    | Both models use one high-quality PNG; pricing and estimator sources are
    | documented in docs/content-workspace.md. No fallback by default.
    | The image timeout is further bounded by the current execution deadline.
    */

    'image_model' => env('CONTENT_PLANNER_IMAGE_MODEL', 'gpt-image-2.6-sunburst'),
    'image_fallback_model' => env('CONTENT_PLANNER_IMAGE_FALLBACK_MODEL', ''),
    'image_timeout' => env('CONTENT_PLANNER_IMAGE_TIMEOUT', 120),

];
