<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use Carbon\Language;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Locale;
use ResourceBundle;

/** A lead belongs to the country recorded on its own organisation's contact. */
final class LeadCountries
{
    private static ?array $names = null;

    /** @param Builder<Inquiry> $visible */
    public static function for(Builder $visible): array
    {
        $leads = (clone $visible)->select(['organization_id', 'guest_id']);
        $groups = DB::query()->fromSub($leads, 'i')->leftJoin('guests as g', function ($join) {
            $join->on('g.id', '=', 'i.guest_id')->on('g.organization_id', '=', 'i.organization_id');
        })->groupBy('g.country')->selectRaw('g.country, count(*) as leads')->get();
        $countries = [];
        $unknown = 0;
        foreach ($groups as $row) {
            $code = self::code((string) $row->country);
            if ($code === null) {
                $unknown += (int) $row->leads;
            } else {
                $countries[$code] = ($countries[$code] ?? 0) + (int) $row->leads;
            }
        }
        ksort($countries);
        arsort($countries, SORT_NUMERIC);
        $rows = [];
        foreach ($countries as $code => $count) {
            $rows[] = ['code' => $code, 'count' => $count];
        }

        return ['rows' => $rows, 'unknown' => $unknown, 'total' => array_sum($countries) + $unknown];
    }

    private static function code(string $raw): ?string
    {
        $name = self::key($raw);
        if ($name === '') return null;
        $iso = Language::regions();
        $code = strtoupper($name);
        if (isset($iso[$code])) return $code;
        if (strlen($code) === 3 && ctype_alpha($code) && class_exists(Locale::class)) {
            $short = Locale::getRegion(Locale::canonicalize('und_'.$code) ?: '');
            if (isset($iso[$short])) return $short;
        }
        if (self::$names === null) {
            $names = ['uk' => 'GB', 'great britain' => 'GB', 'united kingdom' => 'GB', 'england' => 'GB', 'scotland' => 'GB',
                'wales' => 'GB', 'northern ireland' => 'GB', 'usa' => 'US', 'united states' => 'US', 'czech republic' => 'CZ',
                'uae' => 'AE', 'south korea' => 'KR', 'the netherlands' => 'NL'];
            foreach ($iso as $region => $label) {
                $names[self::key($label)] = $region;
            }
            if (class_exists(ResourceBundle::class)) {
                foreach (['en','de','fr','es','ru'] as $lang) {
                    $labels = ResourceBundle::create($lang, 'ICUDATA-region')?->get('Countries');
                    foreach ($labels ?? [] as $region => $label) {
                        if (isset($iso[$region])) $names[self::key($label)] = $region;
                    }
                }
            }
            self::$names = $names;
        }
        return self::$names[$name] ?? null;
    }

    private static function key(string $text): string
    {
        return mb_strtolower(trim(preg_replace('/[\p{Z}\s]+/u', ' ', str_replace('.', '', $text)) ?? ''));
    }
}
