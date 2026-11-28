<?php

namespace App\Services\Crm;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Grammars\PostgresGrammar;

final class SalesRecordSearch
{
    public static function inquiries(Builder $query, string $text): void
    {
        $query->where(function (Builder $q) use ($text) {
            $q->whereLike('event_name', '%'.$text.'%')->orWhereLike('room_type_requested', '%'.$text.'%')
                ->orWhereHas('guest', fn (Builder $guest) => self::people($guest, $text));
        });
    }

    public static function people(Builder $query, string $text, bool $includeNationality = false): void
    {
        $query->where(function (Builder $q) use ($text, $includeNationality) {
            $like = '%'.$text.'%';
            $q->whereLike('full_name', $like)->orWhereLike('company', $like)->orWhereLike('email', $like)
                ->orWhereLike('phone', $like)->orWhereLike('mobile', $like);
            if ($includeNationality) {
                $q->orWhereLike('nationality', $like);
            }
            $digits = preg_replace('/\D/', '', $text);
            if (strlen((string) $digits) >= 4 && preg_match('~^[+()\d\s./-]+$~u', $text)) {
                foreach (['phone', 'mobile'] as $column) {
                    $number = "coalesce({$column}, '')";
                    if ($q->getQuery()->getGrammar() instanceof PostgresGrammar) {
                        $number = "regexp_replace({$number}, '\D', '', 'g')";
                    } else {
                        foreach ([' ', '-', '+', '(', ')', '.', '/'] as $separator) {
                            $number = "replace({$number}, '{$separator}', '')";
                        }
                    }
                    $q->orWhereRaw("{$number} LIKE ?", ['%'.$digits.'%']);
                }
            }
        });
    }
}
