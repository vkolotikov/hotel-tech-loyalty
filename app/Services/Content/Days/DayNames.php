<?php

namespace App\Services\Content\Days;

/**
 * The English name of every built-in day (spec 2026-10-16 §9.3): the AI reads these; the portal keeps its own words
 * under the same ids in the five bundles (a test in Plan 4A-2 ties the two lists).
 */
final class DayNames
{
    public const EN = [
        // Shared public holidays.
        'new_year' => "New Year's Day",
        'good_friday' => 'Good Friday',
        'easter_sunday' => 'Easter Sunday',
        'easter_monday' => 'Easter Monday',
        'labour_day' => 'Labour Day',
        'ascension' => 'Ascension Day',
        'whit_monday' => 'Whit Monday',
        'pentecost' => 'Whitsunday (Pentecost)',
        'assumption' => 'Assumption Day',
        'all_saints' => "All Saints' Day",
        'all_souls' => "All Souls' Day",
        'midsummer' => 'Midsummer Day',
        'christmas_eve' => 'Christmas Eve',
        'christmas' => 'Christmas Day',
        'christmas_second' => 'Second Day of Christmas',
        'new_years_eve' => "New Year's Eve",
        'mothers_day' => "Mother's Day",
        'fathers_day' => "Father's Day",
        // United Kingdom (England and Wales).
        'gb.early_may' => 'Early May bank holiday',
        'gb.spring' => 'Spring bank holiday',
        'gb.summer' => 'Summer bank holiday',
        'gb.boxing_day' => 'Boxing Day',
        // Ireland.
        'ie.st_brigid' => "St Brigid's Day",
        'ie.st_patrick' => "St Patrick's Day",
        'ie.may' => 'May bank holiday',
        'ie.june' => 'June bank holiday',
        'ie.august' => 'August bank holiday',
        'ie.october' => 'October bank holiday',
        'ie.st_stephen' => "St Stephen's Day",
        // Germany, France, Spain.
        'de.unity' => 'Day of German Unity',
        'fr.victory' => 'Victory in Europe Day',
        'fr.bastille' => 'Bastille Day',
        'fr.armistice' => 'Armistice Day',
        'es.epiphany' => 'Epiphany',
        'es.national' => 'National Day of Spain',
        'es.constitution' => 'Constitution Day',
        'es.immaculate' => 'Immaculate Conception',
        // Latvia, Lithuania, Estonia.
        'lv.independence' => 'Restoration of Independence Day',
        'lv.ligo' => 'Midsummer Eve (Līgo Day)',
        'lv.proclamation' => 'Proclamation Day of the Republic of Latvia',
        'lt.state' => 'Day of Restoration of the State',
        'lt.independence' => 'Day of Restoration of Independence',
        'lt.st_johns' => "St John's Day",
        'lt.statehood' => 'Statehood Day',
        'ee.independence' => 'Independence Day',
        'ee.spring_day' => 'Spring Day',
        'ee.victory' => 'Victory Day',
        'ee.restoration' => 'Day of Restoration of Independence',
        // United States.
        'us.mlk' => 'Martin Luther King Jr. Day',
        'us.washington' => "Washington's Birthday",
        'us.memorial' => 'Memorial Day',
        'us.juneteenth' => 'Juneteenth',
        'us.independence' => 'Independence Day',
        'us.labor' => 'Labor Day',
        'us.columbus' => 'Columbus Day',
        'us.veterans' => 'Veterans Day',
        'us.thanksgiving' => 'Thanksgiving Day',
        // Marketing days.
        'valentines' => "Valentine's Day",
        'womens_day' => "International Women's Day",
        'halloween' => 'Halloween',
        'black_friday' => 'Black Friday',
        // Industry days.
        'world_health' => 'World Health Day',
        'world_heart' => 'World Heart Day',
        'world_mental_health' => 'World Mental Health Day',
        'yoga' => 'International Day of Yoga',
        'global_wellness' => 'Global Wellness Day',
        'global_running' => 'Global Running Day',
        'world_tourism' => 'World Tourism Day',
        'world_food' => 'World Food Day',
        'world_book' => 'World Book and Copyright Day',
        'literacy' => 'International Literacy Day',
        'teachers' => "World Teachers' Day",
        'world_ip' => 'World Intellectual Property Day',
        'human_rights' => 'Human Rights Day',
        'world_habitat' => 'World Habitat Day',
        'msme' => 'Micro, Small and Medium-sized Enterprises Day',
    ];

    public static function en(string $id): string
    {
        return self::EN[$id] ?? $id;
    }
}
