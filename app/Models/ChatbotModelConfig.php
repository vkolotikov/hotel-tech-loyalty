<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatbotModelConfig extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'provider',
        'model_name',
        'temperature',
        'top_p',
        'max_tokens',
        'frequency_penalty',
        'presence_penalty',
        'stop_sequences',
        'reasoning_effort',
        'verbosity',
    ];

    protected $casts = [
        'temperature' => 'decimal:2',
        'top_p' => 'decimal:2',
        'max_tokens' => 'integer',
        'frequency_penalty' => 'decimal:2',
        'presence_penalty' => 'decimal:2',
        'stop_sequences' => 'array',
    ];

    /**
     * Get the chatbot model config for an org+brand combination. Falls back
     * to the org's default brand when $brandId is null. Returns an unsaved
     * template instance when no row exists yet.
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
            'organization_id'   => $orgId,
            'brand_id'          => $brandId,
            'provider'          => 'openai',
            'model_name'        => 'gpt-5.5',
            'temperature'       => 0.70,
            'top_p'             => 1.00,
            'max_tokens'        => 1024,
            'frequency_penalty' => 0.00,
            'presence_penalty'  => 0.00,
            // reasoning_effort intentionally omitted from defaults:
            // the DB column has default('low') and we don't want to force-send
            // this field on saves before the production migration has run.
        ]);
    }
}
