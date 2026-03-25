<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = [
        'name', 'email', 'password', 'phone', 'date_of_birth',
        'nationality', 'language', 'avatar_url', 'user_type',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'date_of_birth' => 'date',
        'password' => 'hashed',
    ];

    public function loyaltyMember()
    {
        return $this->hasOne(LoyaltyMember::class);
    }

    public function staff()
    {
        return $this->hasOne(Staff::class);
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
