<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailVerificationCode extends Model
{
    protected $fillable = ['email', 'code', 'expires_at', 'verified_at', 'user_id', 'purpose'];

    /** Issue for a specific account; another tenant's invitation is never invalidated. */
    public static function issueFor(User $user, string $purpose, \DateTimeInterface $expires): self
    {
        return \Illuminate\Support\Facades\DB::transaction(function () use ($user, $purpose, $expires) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            static::where('user_id', $user->id)->where('purpose', $purpose)->whereNull('verified_at')->delete();
            do {
                $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            } while (static::where('email', $user->email)->where('code', $code)->exists());

            return static::create(['email' => $user->email, 'user_id' => $user->id, 'purpose' => $purpose,
                'code' => $code, 'expires_at' => $expires]);
        });
    }

    protected $casts = [
        'expires_at'  => 'datetime',
        'verified_at' => 'datetime',
    ];

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }
}
