<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceMasterSchedule extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'service_master_id',
        'day_of_week', 'start_time', 'end_time', 'is_active',
    ];

    protected $casts = [
        'day_of_week' => 'integer',
        'is_active'   => 'boolean',
    ];

    public function master(): BelongsTo
    {
        return $this->belongsTo(ServiceMaster::class, 'service_master_id');
    }
}
