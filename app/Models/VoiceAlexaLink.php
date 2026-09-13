<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An Echo's Amazon account paired to one staff member. Only a SHA-256 of the
 * Amazon account id is stored. Deliberately not organization-scoped: the skill
 * endpoint resolves a link before any tenant context exists.
 */
class VoiceAlexaLink extends Model
{
    protected $fillable = [
        'alexa_user_hash', 'user_id', 'organization_id', 'can_write',
        'linked_at', 'last_used_at', 'revoked_at',
    ];

    protected $casts = [
        'can_write' => 'boolean',
        'linked_at' => 'datetime',
        'last_used_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public static function hashFor(string $alexaUserId): string
    {
        return hash('sha256', $alexaUserId);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeLive(Builder $query): Builder
    {
        return $query->whereNull('revoked_at');
    }
}
