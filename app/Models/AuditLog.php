<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

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

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    public function causer(): MorphTo
    {
        return $this->morphTo();
    }

    public function scopeForAction($query, string $action)
    {
        return $query->where('action', $action);
    }

    public function scopeForSubjectType($query, string $type)
    {
        return $query->where('subject_type', $type);
    }

    public function scopeForCauser($query, int $userId)
    {
        return $query->where('causer_id', $userId)->where('causer_type', User::class);
    }

    public function scopeBetweenDates($query, ?string $from, ?string $to)
    {
        if ($from) $query->where('created_at', '>=', $from);
        if ($to) $query->where('created_at', '<=', $to . ' 23:59:59');
        return $query;
    }

    public static function record(string $action, $subject = null, array $newValues = [], array $oldValues = [], ?Model $causer = null, ?string $description = null): void
    {
        static::create([
            'action'       => $action,
            'subject_type' => $subject ? get_class($subject) : null,
            'subject_id'   => $subject?->id,
            'new_values'   => $newValues,
            'old_values'   => $oldValues,
            'causer_type'  => $causer ? get_class($causer) : null,
            'causer_id'    => $causer?->id,
            'ip_address'   => request()->ip(),
            'user_agent'   => request()->userAgent(),
            'description'  => $description,
        ]);
    }
}
