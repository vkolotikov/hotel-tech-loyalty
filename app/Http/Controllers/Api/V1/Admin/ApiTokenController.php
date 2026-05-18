<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Per-user Sanctum personal access tokens.
 *
 * Used to authenticate external systems (FDS Card Builder, Zapier, etc.)
 * pushing data INTO this CRM via POST /v1/integrations/leads. The token's
 * owner determines which org the pushed data lands in.
 *
 * Naming convention: tokens minted here use the prefix `integration:`
 * (e.g. `integration:fds_card_builder`) so they're easy to distinguish
 * from the short-lived `admin` tokens issued automatically on every
 * staff login.
 *
 * Plaintext token is shown EXACTLY ONCE — on creation. Subsequent listings
 * show only the abbreviated identifier (first 8 chars) and last-used time.
 * If the admin loses the token they need to revoke and mint a new one.
 */
class ApiTokenController extends Controller
{
    /**
     * GET /v1/admin/api-tokens
     *
     * List the calling user's integration tokens (NOT the ephemeral
     * `admin` login tokens — those are session-scoped, not for sharing).
     */
    public function index(Request $request): JsonResponse
    {
        $tokens = $request->user()->tokens()
            ->where('name', 'like', 'integration:%')
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'abilities', 'last_used_at', 'created_at']);

        return response()->json([
            'tokens' => $tokens->map(fn ($t) => [
                'id'           => $t->id,
                'name'         => $t->name,
                'label'        => str_replace('integration:', '', $t->name),
                'abilities'    => $t->abilities,
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'created_at'   => $t->created_at?->toIso8601String(),
            ]),
        ]);
    }

    /**
     * POST /v1/admin/api-tokens
     *
     * Body: { "label": "FDS Card Builder" }
     *
     * Returns the plaintext token ONCE. The DB only stores a hashed copy
     * — there is no way to retrieve the plaintext later.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'label' => 'required|string|min:1|max:80|regex:/^[a-zA-Z0-9 _\-\.]+$/',
        ]);

        // Slugify the label so the stored token name is greppable.
        $slug = strtolower(preg_replace('/[^a-z0-9]+/', '_', strtolower($validated['label'])));
        $slug = trim($slug, '_');
        $name = 'integration:' . ($slug ?: 'token');

        // Refuse duplicates (same user, same label) to avoid confusion.
        $exists = $request->user()->tokens()->where('name', $name)->exists();
        if ($exists) {
            return response()->json([
                'error' => 'A token with this label already exists. Revoke it first or pick a different name.',
            ], 422);
        }

        $token = $request->user()->createToken($name);

        AuditLog::create([
            'organization_id' => $request->user()->organization_id,
            'user_id'         => $request->user()->id,
            'action'          => 'api_token.created',
            'description'     => 'Created integration token ' . $name,
        ]);

        return response()->json([
            'id'         => $token->accessToken->id,
            'name'       => $token->accessToken->name,
            'label'      => $validated['label'],
            'token'      => $token->plainTextToken,
            'created_at' => $token->accessToken->created_at?->toIso8601String(),
            'warning'    => 'Copy this token now — it will not be shown again.',
        ], 201);
    }

    /**
     * DELETE /v1/admin/api-tokens/{id}
     *
     * Revokes the token immediately. Subsequent requests with that token
     * return 401.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $token = PersonalAccessToken::where('id', $id)
            ->where('tokenable_id', $request->user()->id)
            ->where('tokenable_type', get_class($request->user()))
            ->first();

        if (!$token) {
            return response()->json(['error' => 'Token not found'], 404);
        }

        $name = $token->name;
        $token->delete();

        AuditLog::create([
            'organization_id' => $request->user()->organization_id,
            'user_id'         => $request->user()->id,
            'action'          => 'api_token.revoked',
            'description'     => 'Revoked integration token ' . $name,
        ]);

        return response()->json(['success' => true]);
    }
}
