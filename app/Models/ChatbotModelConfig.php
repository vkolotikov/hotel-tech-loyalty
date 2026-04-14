<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatbotModelConfig extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'provider',
        'model_name',
        'temperature',
        'top_p',
        'max_tokens',
        'frequency_penalty',
        'presence_penalty',
        'stop_sequences',
        'reasoning_effort',
    ];

    protected $casts = [
        'temperature' => 'decimal:2',
        'top_p' => 'decimal:2',
        'max_tokens' => 'integer',
        'frequency_penalty' => 'decimal:2',
        'presence_penalty' => 'decimal:2',
        'stop_sequences' => 'array',
    ];

    public static function getForOrg(int $orgId): self
    {
        return static::where('organization_id', $orgId)->first()
            ?? new static([
                'organization_id'   => $orgId,
                'provider'          => 'openai',
                'model_name'        => 'gpt-4o',
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
