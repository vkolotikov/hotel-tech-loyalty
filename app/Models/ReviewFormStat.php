<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * Per-form daily counters (views / submissions). Incremented from the
 * public endpoints so the analytics tab gets completion-rate + trend
 * without scanning review_submissions.
 */
class ReviewFormStat extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'form_id', 'date', 'views', 'submissions'];

    protected $casts = ['date' => 'date'];

    /**
     * Atomic daily upsert-increment; safe under concurrent public hits.
     * whereDate (not a raw equality) because the `date` cast serialises
     * to a midnight datetime on engines whose column type is loose
     * (sqlite in tests) while Postgres holds a true DATE.
     */
    public static function bump(int $orgId, int $formId, string $column): void
    {
        $today = now()->toDateString();
        $updated = static::withoutGlobalScopes()
            ->where('form_id', $formId)->whereDate('date', $today)
            ->increment($column);
        if ($updated === 0) {
            try {
                static::withoutGlobalScopes()->create([
                    'organization_id' => $orgId,
                    'form_id'         => $formId,
                    'date'            => $today,
                    $column           => 1,
                ]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                // Concurrent first-hit of the day created the row between
                // our increment and create — retry the increment.
                static::withoutGlobalScopes()
                    ->where('form_id', $formId)->whereDate('date', $today)
                    ->increment($column);
            }
        }
    }
}
