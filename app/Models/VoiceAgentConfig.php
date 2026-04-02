<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class VoiceAgentConfig extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'is_active',
        'voice',
        'tts_model',
        'realtime_enabled',
        'realtime_model',
        'voice_instructions',
        'language',
        'temperature',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'realtime_enabled' => 'boolean',
        'temperature' => 'float',
    ];

    public static function getForOrg(int $orgId): self
    {
        return static::where('organization_id', $orgId)->first()
            ?? new static([
                'organization_id' => $orgId,
                'is_active' => false,
                'voice' => 'alloy',
                'tts_model' => 'gpt-4o-mini-tts',
                'realtime_enabled' => false,
                'realtime_model' => 'gpt-4o-realtime-preview',
                'language' => 'en',
                'temperature' => 0.8,
            ]);
    }
}
