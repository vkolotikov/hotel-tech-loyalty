<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;

/**
 * A staff member restricted to some brands named another one (BrandMiddleware).
 * The answer keeps the shape every admin screen already reads (`error` and
 * `message`, the sentence) and adds `code`, so a workspace can drop a stored
 * brand no longer allowed and ask again without one (Content spec 2026-10-14
 * §6.7). It renders itself: the API's catch-all renderer would turn an
 * HttpResponseException into a 500.
 */
final class BrandNotAllowed extends \RuntimeException
{
    public const MESSAGE = 'You do not have access to this brand.';

    public function __construct()
    {
        parent::__construct(self::MESSAGE);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => self::MESSAGE, 'message' => self::MESSAGE, 'code' => 'brand_not_allowed'], 403);
    }

    /** An expected refusal, not an incident. */
    public function report(): void
    {
    }
}
