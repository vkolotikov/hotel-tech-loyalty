<?php

namespace App\OAuth;

use DateTimeImmutable;
use Laravel\Passport\Bridge\AccessToken;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use League\OAuth2\Server\CryptKeyInterface;

/** Adds resource and tenant claims through Passport's supported token extension. */
class PluginAccessTokenEntity extends AccessToken
{
    public ?int $organizationId = null;

    private CryptKeyInterface $signingKey;

    public function setPrivateKey(CryptKeyInterface $privateKey): void
    {
        $this->signingKey = $privateKey;
        parent::setPrivateKey($privateKey);
    }

    public function toString(): string
    {
        $jwt = Configuration::forAsymmetricSigner(
            new Sha256,
            InMemory::plainText($this->signingKey->getKeyContents(), $this->signingKey->getPassPhrase() ?? ''),
            InMemory::plainText('empty'),
        );
        $issuer = rtrim(config('chatgpt.url'), '/');

        // Passport requires the first audience to be the client identifier.
        return $jwt->builder()
            ->permittedFor($this->getClient()->getIdentifier(), $issuer.'/mcp')
            ->issuedBy($issuer)
            ->identifiedBy($this->getIdentifier())
            ->issuedAt(new DateTimeImmutable)
            ->canOnlyBeUsedAfter(new DateTimeImmutable)
            ->expiresAt($this->getExpiryDateTime())
            ->relatedTo((string) $this->getUserIdentifier())
            ->withClaim('scopes', $this->getScopes())
            ->withClaim('organization_id', $this->organizationId)
            ->getToken($jwt->signer(), $jwt->signingKey())->toString();
    }
}
