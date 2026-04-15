<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReviewFormQuestion extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'form_id', 'order', 'kind', 'label',
        'help_text', 'options', 'required', 'weight',
        'condition_index', 'condition_operator', 'condition_value',
    ];

    protected $casts = [
        'options'         => 'array',
        'required'        => 'boolean',
        'order'           => 'integer',
        'weight'          => 'integer',
        'condition_index' => 'integer',
        'condition_value' => 'array',
    ];

    public function form(): BelongsTo
    {
        return $this->belongsTo(ReviewForm::class, 'form_id');
    }
}
