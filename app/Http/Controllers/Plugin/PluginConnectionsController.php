<?php

namespace App\Http\Controllers\Plugin;

use App\Models\User;
use App\OAuth\PluginIdentity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Passport\Passport;
use Laravel\Passport\Token;

class PluginConnectionsController
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->staffUser($request);
        $clientId = (string) config('chatgpt.client_id', '');
        $connections = collect();

        if ($clientId !== '') {
            $connections = $this->tokensFor($user, $clientId)
                ->where('revoked', false)
                ->where(function (Builder $query): void {
                    // Expired access tokens may still have a refresh token that
                    // can renew the connection. Keep those grants visible.
                    $query->whereNull('expires_at')->orWhere('expires_at', '>', now())
                        ->orWhereHas('refreshToken', fn (Builder $refresh) => $refresh
                            ->where('revoked', false)->where('expires_at', '>', now()));
                })
                ->orderByDesc('created_at')
                ->get(['id', 'name', 'scopes', 'created_at', 'expires_at'])
                ->map(fn (Token $token) => [
                    'id' => $token->id,
                    'name' => $token->name ?: 'Hexa-Tech ChatGPT and Codex',
                    'scopes' => $token->scopes ?? [],
                    'created_at' => $token->created_at?->toIso8601String(),
                    'expires_at' => $token->expires_at?->toIso8601String(),
                ]);
        }

        return response()->json([
            'enabled' => (bool) config('chatgpt.enabled') && PluginIdentity::organizationAllowed((int) $user->organization_id),
            'configured' => $clientId !== '',
            'connections' => $connections,
        ])->header('Cache-Control', 'no-store, private');
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $user = $this->staffUser($request);
        $clientId = (string) config('chatgpt.client_id', '');

        if ($clientId !== '') {
            Passport::token()->getConnection()->transaction(function () use ($user, $clientId): void {
                // OAuth issuance takes the same client lock. It must finish
                // before this query, preventing an in-flight refresh or code
                // exchange from creating a successor after disconnection.
                Passport::client()->newQuery()->whereKey($clientId)->lockForUpdate()->first();

                $tokens = $this->tokensFor($user, $clientId);

                Passport::refreshToken()->newQuery()->whereIn('access_token_id', (clone $tokens)->select('id'))
                    ->update(['revoked' => true]);
                $tokens->update(['revoked' => true]);

                Passport::authCode()->newQuery()->where('user_id', $user->id)
                    ->where('plugin_organization_id', $user->organization_id)
                    ->where('client_id', $clientId)->update(['revoked' => true]);
            });
        }

        return response()->json(['success' => true])->header('Cache-Control', 'no-store, private');
    }

    private function staffUser(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->isStaff() && $user->organization_id,
            403, 'This endpoint requires a staff account with a workspace.');

        return $user;
    }

    private function tokensFor(User $user, string $clientId): Builder
    {
        return Passport::token()->newQuery()->where('user_id', $user->id)
            ->where('plugin_organization_id', $user->organization_id)
            ->where('client_id', $clientId);
    }
}
