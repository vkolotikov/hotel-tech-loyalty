<?php

namespace App\OAuth;

use App\Models\User;
use Laravel\Passport\Bridge\AccessTokenRepository;
use Laravel\Passport\Passport;
use League\OAuth2\Server\Entities\AccessTokenEntityInterface;
use League\OAuth2\Server\Entities\ClientEntityInterface;
use League\OAuth2\Server\Exception\OAuthServerException;

class PluginAccessTokenRepository extends AccessTokenRepository
{
    public function getNewToken(ClientEntityInterface $clientEntity, array $scopes, ?string $userIdentifier = null): AccessTokenEntityInterface
    {
        $user = User::query()->find($userIdentifier);
        $organization = request()->attributes->get('plugin.grant_organization_id');
        if ($clientEntity->getIdentifier() !== config('chatgpt.client_id') || ! PluginIdentity::active($user)
            || ! $organization || (int) $organization !== (int) $user->organization_id) {
            throw OAuthServerException::accessDenied('A configured plugin client and staff account are required.');
        }
        $token = parent::getNewToken($clientEntity, $scopes, $userIdentifier);
        $token->organizationId = (int) $organization;

        return $token;
    }

    public function persistNewAccessToken(AccessTokenEntityInterface $accessTokenEntity): void
    {
        parent::persistNewAccessToken($accessTokenEntity);
        Passport::token()->newQuery()->whereKey($accessTokenEntity->getIdentifier())
            ->update(['plugin_organization_id' => $accessTokenEntity->organizationId]);
    }
}
