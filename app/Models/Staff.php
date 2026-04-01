<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToOrganization;

class Staff extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'user_id', 'role', 'hotel_name', 'department',
        'can_award_points', 'can_redeem_points', 'can_manage_offers',
        'can_view_analytics', 'is_active', 'last_login_at',
    ];

    protected $hidden = ['organization_id', 'created_at', 'updated_at'];

    protected $casts = [
        'can_award_points' => 'boolean',
        'can_redeem_points' => 'boolean',
        'can_manage_offers' => 'boolean',
        'can_view_analytics' => 'boolean',
        'is_active' => 'boolean',
        'last_login_at' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }

    public function isSuperAdmin(): bool { return $this->role === 'super_admin'; }
    public function isManager(): bool { return in_array($this->role, ['super_admin', 'manager']); }
}
