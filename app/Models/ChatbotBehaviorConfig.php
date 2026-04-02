<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatbotBehaviorConfig extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'assistant_name',
        'assistant_avatar',
        'identity',
        'goal',
        'sales_style',
        'tone',
        'reply_length',
        'language',
        'core_rules',
        'escalation_policy',
        'fallback_message',
        'custom_instructions',
        'is_active',
    ];

    protected $casts = [
        'core_rules' => 'array',
        'is_active' => 'boolean',
    ];

    public static function getForOrg(int $orgId): self
    {
        return static::where('organization_id', $orgId)->first()
            ?? new static([
                'organization_id' => $orgId,
                'assistant_name' => 'Hotel Assistant',
                'sales_style' => 'consultative',
                'tone' => 'professional',
                'reply_length' => 'moderate',
                'language' => 'en',
                'is_active' => true,
            ]);
    }
}
