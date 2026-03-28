<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuestImportRun extends Model
{
    protected $fillable = [
        'total_rows', 'created_count', 'updated_count', 'skipped_count',
        'errors', 'performed_by',
    ];

    protected $casts = [
        'errors' => 'array',
    ];
}
