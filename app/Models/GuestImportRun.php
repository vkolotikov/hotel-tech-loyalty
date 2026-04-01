<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class GuestImportRun extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'total_rows', 'created_count', 'updated_count', 'skipped_count',
        'errors', 'performed_by',
    ];

    protected $casts = [
        'errors' => 'array',
    ];
}
