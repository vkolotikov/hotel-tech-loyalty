<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceMaster extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'user_id', 'name', 'title', 'bio',
        'email', 'phone', 'avatar', 'specialties', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'specialties' => 'array',
        'is_active'   => 'boolean',
        'sort_order'  => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'service_master_service')
            ->withPivot(['price_override', 'duration_override_minutes'])
            ->withTimestamps();
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(ServiceMasterSchedule::class);
    }

    public function timeOff(): HasMany
    {
        return $this->hasMany(ServiceMasterTimeOff::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(ServiceBooking::class);
    }
}
