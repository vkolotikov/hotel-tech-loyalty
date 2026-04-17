<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceMasterTimeOff extends Model
{
    use BelongsToOrganization;

    protected $table = 'service_master_time_off';

    protected $fillable = [
        'organization_id', 'service_master_id',
        'date', 'start_time', 'end_time', 'reason',
    ];

    protected $casts = [
        'date' => 'date',
    ];

    public function master(): BelongsTo
    {
        return $this->belongsTo(ServiceMaster::class, 'service_master_id');
    }
}
