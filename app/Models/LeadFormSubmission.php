<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per form submit. Stores the raw payload + foreign keys to
 * the Guest / Inquiry that got created. Lets the admin inspect the
 * incoming data, replay a failed submit, or tag spam.
 */
class LeadFormSubmission extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'lead_form_id',
        'payload', 'guest_id', 'inquiry_id',
        'ip', 'user_agent', 'referrer',
        'status', 'error_message',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function leadForm(): BelongsTo
    {
        return $this->belongsTo(LeadForm::class);
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(Inquiry::class);
    }
}
