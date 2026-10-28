<?php

namespace App\Services\Loyalty\Campaigns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Read-only filtering, applied inside each channel's existing tenant/source query. */
final class CampaignListFilter
{
    public static function apply(Builder $query, Request $request, array $columns): void
    {
        $data = $request->validate([
            'q' => 'nullable|string|max:200',
            'status' => ['nullable', Rule::in(['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'])],
        ]);
        $text = trim((string) ($data['q'] ?? ''));
        if ($text !== '') {
            // Explicit escape character works on both PostgreSQL and SQLite. Wildcards are literal user text.
            $pattern = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($text)) . '%';
            $query->where(function (Builder $inner) use ($columns, $pattern): void {
                foreach ($columns as $column) {
                    $inner->orWhereRaw("LOWER({$column}) LIKE ? ESCAPE '!'", [$pattern]);
                }
            });
        }
        if (!empty($data['status'])) {
            $query->where('status', $data['status']);
        }
    }
}
