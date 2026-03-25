<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class QrToken extends Model
{
    protected $fillable = [
        'member_id', 'token', 'signature', 'issued_at', 'expires_at',
        'max_uses', 'use_count', 'is_revoked',
    ];

    protected $casts = [
        'issued_at'  => 'datetime',
        'expires_at' => 'datetime',
        'is_revoked' => 'boolean',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function isValid(): bool
    {
        return !$this->is_revoked
            && $this->expires_at->isFuture()
            && $this->use_count < $this->max_uses;
    }

    public function consume(): bool
    {
        if (!$this->isValid()) {
            return false;
        }

        $this->increment('use_count');
        return true;
    }

    public function revoke(): void
    {
        $this->update(['is_revoked' => true]);
    }

    /**
     * Issue a new signed QR token for a member.
     */
    public static function issue(LoyaltyMember $member, int $ttlMinutes = 30, int $maxUses = 5): self
    {
        // Revoke any existing active tokens
        static::where('member_id', $member->id)
            ->where('is_revoked', false)
            ->where('expires_at', '>', now())
            ->update(['is_revoked' => true]);

        $token = Str::random(64);
        $signature = hash_hmac('sha256', $token . $member->id . $member->member_number, config('app.key'));

        return static::create([
            'member_id' => $member->id,
            'token'     => $token,
            'signature' => $signature,
            'issued_at' => now(),
            'expires_at'=> now()->addMinutes($ttlMinutes),
            'max_uses'  => $maxUses,
        ]);
    }

    /**
     * Validate a token and return the member if valid.
     */
    public static function validate(string $token): ?LoyaltyMember
    {
        $qr = static::where('token', $token)
            ->where('is_revoked', false)
            ->where('expires_at', '>', now())
            ->first();

        if (!$qr || !$qr->isValid()) {
            return null;
        }

        // Verify signature
        $expectedSig = hash_hmac('sha256', $qr->token . $qr->member_id . $qr->member->member_number, config('app.key'));
        if (!hash_equals($expectedSig, $qr->signature)) {
            return null;
        }

        return $qr->member;
    }
}
