<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = [
        'name', 'email', 'password', 'phone', 'date_of_birth',
        'nationality', 'language', 'avatar_url', 'user_type', 'organization_id',
        'wants_daily_summary',
    ];

    protected $hidden = ['password', 'remember_token', 'email_verified_at', 'organization_id'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'date_of_birth' => 'date',
        'password' => 'hashed',
        'wants_daily_summary' => 'boolean',
        'daily_summary_last_sent_at' => 'datetime',
    ];

    public function loyaltyMember()
    {
        return $this->hasOne(LoyaltyMember::class);
    }

    public function staff()
    {
        return $this->hasOne(Staff::class);
    }

    /**
     * Brands this staff user can access. A user with NO rows in the pivot is
     * implicitly granted access to every brand in their organization (legacy
     * behaviour — no surprise downgrades for existing staff). The
     * BrandMiddleware honours this rule when resolving the current brand.
     */
    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class)
            ->withPivot('role')
            ->withTimestamps();
    }

    public function isStaff(): bool
    {
        return $this->user_type === 'staff';
    }

    public function isMember(): bool
    {
        return $this->user_type === 'member';
    }
}
