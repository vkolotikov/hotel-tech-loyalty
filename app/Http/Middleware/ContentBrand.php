<?php

namespace App\Http\Middleware;

use App\Services\Content\ContentContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware for HexaTech Content: every call works on exactly one
 * brand (spec 2026-10-14 §6.7). The `brand` middleware has already bound the
 * brand the portal named (?brand_id=), refused one a restricted member may
 * not use (403), and bound nothing for "none" or a brand of another
 * organisation; this one turns nothing into the person's default brand, so
 * BrandScope always filters and no content list mixes brands.
 */
class ContentBrand
{
    public function handle(Request $request, Closure $next): Response
    {
        $bound = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brandId = $bound ? (int) $bound : ContentContext::fallbackBrandId($request->user());

        if (!$brandId) {
            return response()->json([
                'error' => 'no_brand',
                'message' => 'This organisation has no brand yet.',
            ], 409);
        }

        app()->instance('current_brand_id', $brandId);
        $request->attributes->set('content_brand_id', $brandId);

        return $next($request);
    }
}
