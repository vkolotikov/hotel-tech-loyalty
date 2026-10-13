<?php

namespace App\Services\Appointments;

/**
 * A colour per team member on the appointments calendar (spec §5.3). The
 * palette lives here only: Setup shows it, the team update validates against
 * it, the calendar payload carries the assigned colour. Every colour reads at
 * 3:1 or better as a dot or ring on the workspace's light and dark surfaces
 * (TeamColoursTest). A person without a choice gets the first palette colour
 * nobody has chosen and nobody with a lower id was given; with more people
 * than colours the palette starts again. Nothing is written: the assignment is
 * worked out on every read, so it is stable as long as the team is.
 */
final class TeamColours
{
    public const PALETTE = [
        'blue'      => '#3b7dd8',
        'orange'    => '#c46f1b',
        'violet'    => '#8e5bd0',
        'raspberry' => '#c34b7d',
        'teal'      => '#2d9a80',
        'ochre'     => '#a0832a',
        'green'     => '#5c8f2e',
        'coral'     => '#d0553f',
        'indigo'    => '#5a73dc',
        'brown'     => '#9c6b4e',
    ];

    /**
     * @param  iterable<object{id:int, color:?string}>  $masters  the active team members
     * @return array<int, string> id => hex, ordered by id
     */
    public static function assign(iterable $masters): array
    {
        $palette = array_values(self::PALETTE);
        $list = collect($masters)->sortBy('id')->values();

        $chosen = static fn ($m) => is_string($m->color) && in_array(strtolower($m->color), $palette, true) ? strtolower($m->color) : null;
        $taken = $list->map($chosen)->filter()->values()->all();

        $out = [];
        $wrap = 0;
        foreach ($list as $m) {
            $own = $chosen($m);
            if ($own !== null) {
                $out[(int) $m->id] = $own;
                continue;
            }
            $free = array_values(array_diff($palette, $taken));
            $pick = $free[0] ?? $palette[$wrap++ % count($palette)];
            $out[(int) $m->id] = $pick;
            $taken[] = $pick;
        }

        return $out;
    }

    /** @return list<array{key:string, hex:string}> */
    public static function paletteList(): array
    {
        return array_map(fn ($key, $hex) => ['key' => $key, 'hex' => $hex], array_keys(self::PALETTE), array_values(self::PALETTE));
    }
}
