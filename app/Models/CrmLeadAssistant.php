<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Enter through a tenant- and brand-checked Inquiry. */
final class CrmLeadAssistant extends Model
{
    protected $table = 'crm_lead_assistant';

    protected $primaryKey = 'inquiry_id';

    public $incrementing = false;

    protected $fillable = ['inquiry_id', 'brand_id', 'revision', 'run', 'results', 'strategies', 'approved_quote', 'email_reviews'];

    protected $casts = [
        'inquiry_id' => 'integer', 'brand_id' => 'integer', 'revision' => 'integer',
        'run' => 'array', 'results' => 'array', 'strategies' => 'array', 'approved_quote' => 'array', 'email_reviews' => 'array',
    ];
}
