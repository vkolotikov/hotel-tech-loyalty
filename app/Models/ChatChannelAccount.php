<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Crypt;

/**
 * ChatChannelAccount — a connected external chat platform Page/number.
 *
 * Phase 1 supports `channel='messenger'`. WhatsApp/Instagram reserved.
 *
 * page_access_token is Laravel-encrypted at rest via the `saving` hook
 * below — same pattern as HotelSetting::ENCRYPTED_KEYS for Stripe and
 * Smoobu credentials. Callers always see plaintext via the accessor.
 * Legacy plaintext rows (none yet, but kept for safety) pass through
 * the catch unchanged and get re-encrypted on next save.
 *
 * Multi-tenancy:
 *   - BelongsToOrganization: scoped to the current org
 *   - BelongsToBrand: scoped to current brand when bound (chat widget
 *     is brand-scoped, so Messenger accounts match)
 */
class ChatChannelAccount extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const CHANNEL_MESSENGER = 'messenger';
    public const CHANNEL_WHATSAPP  = 'whatsapp';   // Phase 2+
    public const CHANNEL_INSTAGRAM = 'instagram';  // Phase 2+

    public const STATUS_ACTIVE       = 'active';
    public const STATUS_REAUTH       = 'reauth_required';
    public const STATUS_DISCONNECTED = 'disconnected';

    protected $fillable = [
        'organization_id',
        'brand_id',
        'channel',
        'external_id',
        'display_name',
        'display_avatar_url',
        'page_access_token',
        'status',
        'token_verified_at',
        'last_webhook_at',
        'last_error',
        'meta_config',
        'connected_by_user_id',
    ];

    protected $casts = [
        'meta_config'       => 'array',
        'token_verified_at' => 'datetime',
        'last_webhook_at'   => 'datetime',
    ];

    protected $hidden = [
        // Belt-and-braces: never serialise the token to JSON. Callers
        // that need it must explicitly access $model->page_access_token
        // server-side; the accessor returns plaintext but API responses
        // skip the field entirely.
        'page_access_token',
    ];

    protected static function booted(): void
    {
        // Encrypt the page access token before persisting. Idempotent: if
        // the raw value already looks like a Laravel cipher payload (i.e.
        // we'd be able to decrypt it), skip re-encryption.
        static::saving(function (self $account) {
            $raw = $account->getAttributes()['page_access_token'] ?? null;
            if ($raw === null || $raw === '') return;
            try {
                Crypt::decryptString($raw);
                return; // already encrypted
            } catch (DecryptException) {
                // plaintext — encrypt below
            }
            $account->attributes['page_access_token'] = Crypt::encryptString($raw);
        });
    }

    /**
     * Transparent decrypt accessor. Legacy plaintext rows return as-is
     * (matches HotelSetting pattern for migration safety).
     */
    public function getPageAccessTokenAttribute(?string $raw): ?string
    {
        if ($raw === null || $raw === '') return $raw;
        try {
            return Crypt::decryptString($raw);
        } catch (DecryptException) {
            return $raw;
        }
    }

    // ─── Relationships ───────────────────────────────────────────────

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function connectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'connected_by_user_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(ChatConversation::class, 'channel_account_id');
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE
            && !empty($this->getAttributes()['page_access_token']);
    }

    public function markWebhookReceived(): void
    {
        $this->forceFill(['last_webhook_at' => now()])->saveQuietly();
    }

    public function markError(string $message): void
    {
        $this->forceFill(['last_error' => substr($message, 0, 2000)])->save();
    }

    public function clearError(): void
    {
        if ($this->last_error !== null) {
            $this->forceFill(['last_error' => null])->saveQuietly();
        }
    }
}
