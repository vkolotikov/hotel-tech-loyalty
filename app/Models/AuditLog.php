<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'subject_type', 'subject_id', 'action', 'old_values',
        'new_values', 'causer_type', 'causer_id', 'ip_address',
        'user_agent', 'description',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    public static function record(string $action, $subject = null, array $newValues = [], array $oldValues = [], ?User $causer = null): void
    {
        static::create([
            'action' => $action,
            'subject_type' => $subject ? get_class($subject) : null,
            'subject_id' => $subject?->id,
            'new_values' => $newValues,
            'old_values' => $oldValues,
            'causer_type' => $causer ? get_class($causer) : null,
            'causer_id' => $causer?->id,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }
}
