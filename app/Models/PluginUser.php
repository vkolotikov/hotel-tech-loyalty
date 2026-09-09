<?php

namespace App\Models;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Laravel\Passport\Contracts\OAuthenticatable;
use Laravel\Passport\Contracts\ScopeAuthorizable;
use Laravel\Passport\Passport;
use Laravel\Passport\PersonalAccessTokenResult;
use LogicException;

/**
 * OAuth identity over the existing users table. User's Sanctum trait stays intact.
 * Passport's trait cannot be mixed into User: its property and method signatures
 * conflict with Sanctum. These adapters implement Passport's public contract.
 */
class PluginUser extends User implements OAuthenticatable
{
    protected $table = 'users';

    public function oauthApps(): MorphMany
    {
        return $this->morphMany(Passport::clientModel(), 'owner');
    }

    public function tokens(): HasMany
    {
        return $this->hasMany(Passport::tokenModel(), 'user_id');
    }

    public function tokenCan(string $scope): bool
    {
        return $this->accessToken !== null && $this->accessToken->can($scope);
    }

    public function tokenCant(string $scope): bool
    {
        return ! $this->tokenCan($scope);
    }

    public function createToken(string $name, array $scopes = [], ?DateTimeInterface $expiresAt = null): PersonalAccessTokenResult
    {
        throw new LogicException('Plugin tokens require an OAuth authorization code and PKCE.');
    }

    public function currentAccessToken(): ?ScopeAuthorizable
    {
        return $this->accessToken;
    }

    public function withAccessToken($accessToken): static
    {
        if ($accessToken !== null && ! $accessToken instanceof ScopeAuthorizable) {
            throw new LogicException('A Passport access token is required.');
        }
        $this->accessToken = $accessToken;

        return $this;
    }

    public function getProviderName(): string
    {
        return 'plugin_users';
    }

    // The inherited relations must retain User's foreign keys, not plugin_user_id.
    public function staff()
    {
        return $this->hasOne(Staff::class, 'user_id');
    }

    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class, 'brand_user', 'user_id', 'brand_id')
            ->withPivot('role')->withTimestamps();
    }
}
