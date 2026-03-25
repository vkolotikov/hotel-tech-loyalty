<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainEvent extends Model
{
    protected $fillable = [
        'event_type', 'aggregate_type', 'aggregate_id',
        'payload', 'property_id', 'is_processed', 'processed_at',
    ];

    protected $casts = [
        'payload'      => 'array',
        'is_processed' => 'boolean',
        'processed_at' => 'datetime',
    ];

    /**
     * Record a domain event.
     */
    public static function record(
        string $eventType,
        Model  $aggregate,
        array  $payload = [],
        ?int   $propertyId = null,
    ): self {
        return static::create([
            'event_type'     => $eventType,
            'aggregate_type' => get_class($aggregate),
            'aggregate_id'   => $aggregate->getKey(),
            'payload'        => $payload,
            'property_id'    => $propertyId,
        ]);
    }

    public function markProcessed(): void
    {
        $this->update([
            'is_processed' => true,
            'processed_at' => now(),
        ]);
    }
}
