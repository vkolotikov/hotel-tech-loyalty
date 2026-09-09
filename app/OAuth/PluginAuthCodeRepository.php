<?php

namespace App\OAuth;

use App\Models\User;
use Laravel\Passport\Bridge\AuthCodeRepository;
use Laravel\Passport\Passport;
use League\OAuth2\Server\Entities\AuthCodeEntityInterface;
use League\OAuth2\Server\Exception\OAuthServerException;

class PluginAuthCodeRepository extends AuthCodeRepository
{
    public function persistNewAuthCode(AuthCodeEntityInterface $authCodeEntity): void
    {
        $user = User::query()->find($authCodeEntity->getUserIdentifier());
        $organization = request()->session()->get('plugin.consent_organization_id');
        if (! PluginIdentity::active($user) || (int) $user->organization_id !== (int) $organization) {
            throw OAuthServerException::accessDenied('The workspace changed. Connect again.');
        }
        parent::persistNewAuthCode($authCodeEntity);
        Passport::authCode()->newQuery()->whereKey($authCodeEntity->getIdentifier())
            ->update(['plugin_organization_id' => $organization]);
    }

    public function isAuthCodeRevoked(string $codeId): bool
    {
        if (parent::isAuthCodeRevoked($codeId)) {
            return true;
        }
        $code = Passport::authCode()->newQuery()->find($codeId);
        $user = User::query()->find($code?->user_id);

        $invalid = ! PluginIdentity::active($user)
            || ! $code?->plugin_organization_id
            || $code->client_id !== config('chatgpt.client_id')
            || (int) $code->plugin_organization_id !== (int) $user->organization_id;
        if (! $invalid) {
            request()->attributes->set('plugin.grant_organization_id', (int) $code->plugin_organization_id);
        }

        return $invalid;
    }
}
