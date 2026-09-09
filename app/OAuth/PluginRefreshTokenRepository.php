<?php

namespace App\OAuth;

use App\Models\User;
use Laravel\Passport\Bridge\RefreshTokenRepository;
use Laravel\Passport\Passport;

class PluginRefreshTokenRepository extends RefreshTokenRepository
{
    public function isRefreshTokenRevoked(string $tokenId): bool
    {
        if (parent::isRefreshTokenRevoked($tokenId)) {
            return true;
        }
        $refresh = Passport::refreshToken()->newQuery()->find($tokenId);
        $access = Passport::token()->newQuery()->find($refresh?->access_token_id);
        $user = User::query()->find($access?->user_id);

        // Moving a user to another organization must never move an old grant.
        $invalid = ! $access || $access->revoked || ! PluginIdentity::active($user)
            || $access->client_id !== config('chatgpt.client_id')
            || ! $access->plugin_organization_id
            || (int) $access->plugin_organization_id !== (int) $user->organization_id;
        if (! $invalid) {
            request()->attributes->set('plugin.grant_organization_id', (int) $access->plugin_organization_id);
        }

        return $invalid;
    }
}
