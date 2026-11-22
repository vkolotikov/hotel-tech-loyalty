<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Only enter through a tenant-scoped Guest or a job that rechecks its organisation. */
class GuestBusinessProfile extends Model
{
    protected $primaryKey = 'guest_id';

    public $incrementing = false;

    protected $fillable = ['guest_id', 'revision', 'fields', 'sources', 'discovery'];

    protected $casts = [
        'guest_id' => 'integer',
        'revision' => 'integer',
        'fields' => 'array',
        'sources' => 'array',
        'discovery' => 'array',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }
}
