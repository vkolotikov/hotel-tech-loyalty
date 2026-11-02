<?php

namespace App\Http\Controllers\Api\V1\Integrations;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Scopes\TenantScope;
use App\Services\Integrations\ContactsFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactsFeedController extends Controller
{
    public function __invoke(Request $request, ContactsFeed $feed): JsonResponse
    {
        $hash = (string) config('contacts_feed.token_hash');
        $token = $request->bearerToken();
        abort_unless(strlen($hash) === 64 && is_string($token) && strlen($token) >= 32
            && hash_equals($hash, hash('sha256', $token)), 401, 'Feed authentication required.');
        $brand = Brand::withoutGlobalScope(TenantScope::class)->find((int) config('contacts_feed.brand_id'));
        abort_unless($brand !== null, 403, 'The export brand is unavailable.');
        $data = $request->validate(['limit' => 'sometimes|integer|min:1|max:100', 'cursor' => 'nullable|string|max:1000']);

        return response()->json($feed->page((int) $brand->organization_id, (int) $brand->id,
            (int) ($data['limit'] ?? 100), $data['cursor'] ?? null))
            ->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
    }
}
