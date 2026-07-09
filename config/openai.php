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
    | Model used to generate post images. 'gpt-image-1' is best quality but
    | may require OpenAI org verification; the Content Planner auto-falls back
    | to 'dall-e-3' on an access error. Override with CONTENT_PLANNER_IMAGE_MODEL.
    | Image request timeout is separate (generation can take 10-40s).
    */

    'image_model' => env('CONTENT_PLANNER_IMAGE_MODEL', 'gpt-image-1'),
    'image_fallback_model' => env('CONTENT_PLANNER_IMAGE_FALLBACK_MODEL', 'dall-e-3'),
    'image_timeout' => env('CONTENT_PLANNER_IMAGE_TIMEOUT', 120),

];
