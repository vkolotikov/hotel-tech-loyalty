<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatbotBehaviorConfig extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
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

    /**
     * Get the chatbot behavior config for an org+brand combination. Falls
     * back to the org's default brand when $brandId is null. Returns an
     * unsaved template instance when no row exists yet so the caller can
     * use it as defaults without persisting.
     *
     * Bypasses the global brand scope on the lookup so this works during
     * setup wizards where no brand context is bound yet.
     */
    public static function getForOrg(int $orgId, ?int $brandId = null): self
    {
        $brandId = $brandId ?? Brand::currentOrDefaultIdForOrg($orgId);

        $existing = static::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->first();

        if ($existing) {
            return $existing;
        }

        return new static([
            'organization_id' => $orgId,
            'brand_id'        => $brandId,
            'assistant_name'  => 'Hotel Assistant',
            'sales_style'     => 'consultative',
            'tone'            => 'professional',
            'reply_length'    => 'moderate',
            'language'        => 'en',
            'is_active'       => true,
        ]);
    }
}
