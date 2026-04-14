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
                'organization_id' => $orgId,
                'provider'          => 'openai',
                'model_name'        => 'gpt-4.1',
                'temperature'       => 0.70,
                'top_p'             => 1.00,
                'max_tokens'        => 1024,   // raised from 500 — allows richer luxury responses
                'frequency_penalty' => 0.00,
                'presence_penalty'  => 0.00,
            ]);
    }
}
