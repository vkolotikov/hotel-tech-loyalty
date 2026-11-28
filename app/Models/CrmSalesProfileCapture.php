<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Access through a brand resolved for the caller, or the matching queued run. */
final class CrmSalesProfileCapture extends Model
{
    protected $primaryKey = 'brand_id';

    public $incrementing = false;

    protected $fillable = ['brand_id', 'run_id', 'requested_by', 'status', 'queued_at', 'input', 'outcome'];

    protected $hidden = ['input', 'requested_by'];

    protected $casts = ['queued_at' => 'datetime', 'input' => 'encrypted:array', 'outcome' => 'array'];
}
