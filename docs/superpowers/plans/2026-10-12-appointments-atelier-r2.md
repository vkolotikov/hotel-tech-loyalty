# HexaTech Appointments "Atelier" — Release 2 (faster daily work) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desk work faster in the Appointments workspace: Find (Ctrl K / ⌘ K or "/"), keyboard shortcuts with a "?" sheet, a colour per team member, a Today strip with team chips above the day view, and a hover preview on calendar cards.

**Architecture:** One additive, nullable column `service_masters.color` holds a manager's choice from a fixed 10-colour palette that the SERVER owns (`App\Services\Appointments\TeamColours`); the server assigns a colour to every active team member in the calendar payload and serves the palette to Setup (one source of truth). Everything else is frontend inside `frontend/src/appointments`: pure modules (`findResults`, `shortcuts`, `todayFigures`, prefs) carry the logic and have unit tests; components stay thin. The hover preview reuses the appointment-detail query the panel already uses, so opening the panel after a preview is instant.

**Tech Stack:** Laravel 13 (PHP 8.4), React 19 + TypeScript, TanStack Query, Vite 5, Tailwind 3.4, vitest (node env, static render), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-12-appointments-atelier-design.md` §5 (and §2 decisions, §6–7). Release 1 is live (prod `dd5b9ddfe`); its rules stay binding.

## Global Constraints

- PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Never run a bare `artisan test`; run `artisan test tests/Feature/Appointments/`, `tests/Unit/Appointments/` (and other named directories) in the foreground and read the `Tests:` line.
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run` — only the 3 known `plannerMeta` failures may remain.
- Never run `npm run build` on the feature branch; never commit `frontend/dist`, `public/spa`, `resources/spa-shell`.
- Windows: edit with the Edit/Write tools, not `sed`/`python`. Git Bash for git.
- Only `a-*` colour classes in `frontend/src/appointments`; no hex literals in `.tsx` (member colours arrive as data and are applied through the CSS variable `--a-m`); every rule in `appointments.css` starts with `[data-appointments]`; no text below 12 px (`text-xs` floor).
- Fills use the brand (`bg-a-accent`); lines and text use `--a-accent-text` (`ring-/border-/outline-/text-a-accent-text`). Status is always icon + word, never person colour (spec §5.3).
- Text ≥ 4.5:1 in both themes; a member colour drawn as a dot or ring (non-text) ≥ 3:1 on the workspace's light AND dark surfaces.
- Money stays manager-only (`boot.staff.can_manage`), as today.
- Shortcuts never act while someone types in a field, while focus is inside a dialog, or while a modal (`aria-modal="true"`) is open; the grid's own arrow-key moves on a focused card/slot (`[data-stop]`) win over ← / →.
- The migration is additive and nullable; no backfill; the full admin ignores the column.
- Refinements of spec §5 made in this plan: the Today strip's manager tile shows the day's net takings and the number of
  payments (the Takings screen's own figures) — "expected" is not computed, because the calendar payload carries no
  prices; the List view keeps its one-person picker like the Week view (chips are Day-view only); the colour rule
  reserves every manager's choice first, then gives the rest the first free colour in id order (no duplicates while
  the palette lasts).
- New strings go into all five `appointments/i18n/appointments.{en,de,es,fr,ru}.json` files with the exact words given in each task.
- Commits end with a trailer naming the implementing model, e.g. `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A team larger than the palette (11+ active people): every person still gets a colour (the palette wraps) and nobody's explicit choice is changed — Task 1 tests it.
2. Ctrl/⌘ K pressed while typing in the client search or a form field: Find opens (it is the one shortcut that works while typing), but N / T / D / W / L / "/" / "?" / ← → type normally — Task 7 tests every case.
3. Hiding people with the team chips, then that person is deleted or deactivated: the stored hidden id is ignored and nobody is stuck hidden; at least one person always stays visible — Task 3 tests it.
4. Hover preview over a card whose detail fails to load (network, 403): the preview still shows what the card already knows and no error is thrown — Task 5 tests it.
5. Find with an accented or differently-cased query ("emilie" for "Émilie", "MIA" for "Mia"): it matches — Task 6 tests it.

## File Structure

| File | Responsibility |
|------|----------------|
| `database/migrations/2026_10_12_100000_add_color_to_service_masters_table.php` | The nullable `color` column. |
| `app/Services/Appointments/TeamColours.php` | The palette and the assignment rule. |
| `app/Models/ServiceMaster.php`, `app/Services/Booking/Setup/TeamSetup.php` | `color` fillable, validated against the palette. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php` | `color` on each calendar master. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/SetupController.php` + `SetupPresenter` | `palette`, `team_colors`, member `color`. |
| `tests/Unit/Appointments/TeamColoursTest.php`, `tests/Feature/Appointments/Setup/TeamColourTest.php`, `tests/Concerns/SetsUpAppointmentsSchema.php` | Server tests + test-schema column. |
| `frontend/src/appointments/lib/types.ts` | `color` fields, palette types. |
| `frontend/src/appointments/theme/appointments.css` | `.a-member-dot`, `.a-member-ring`. |
| `frontend/src/appointments/calendar/{TimeGrid,AppointmentCard}.tsx` | Colour dot/ring; hover preview wiring. |
| `frontend/src/appointments/setup/TeamEditor.tsx` | Colour picker. |
| `frontend/src/appointments/lib/prefs.ts` | `hiddenMasters`. |
| `frontend/src/appointments/calendar/{TeamChips,TodayStrip,todayFigures,CardPreview}.tsx/.ts` | New day-view pieces. |
| `frontend/src/appointments/calendar/{CalendarPage,Toolbar,DayOverview}.tsx` | Wiring; person picker off the day view; overview keeps the legend. |
| `frontend/src/appointments/find/{findResults.ts,FindDialog.tsx}` | Find. |
| `frontend/src/appointments/lib/shortcuts.ts`, `frontend/src/appointments/ui/ShortcutsSheet.tsx` | Shortcuts. |
| `frontend/src/appointments/AppointmentsShell.tsx` | Find button, global shortcuts, sheet. |

---

### Task 1: Team colours on the server

**Files:**
- Create: `database/migrations/2026_10_12_100000_add_color_to_service_masters_table.php`
- Create: `app/Services/Appointments/TeamColours.php`
- Modify: `app/Models/ServiceMaster.php` (fillable), `app/Services/Booking/Setup/TeamSetup.php` (FIELDS + rules), `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php` (master rows), `app/Http/Controllers/Api/V1/Admin/Appointments/SetupController.php` (payload), the `SetupPresenter::member()` method (find it with `grep -rn "class SetupPresenter" app/`)
- Modify: `tests/Concerns/SetsUpAppointmentsSchema.php` (`addColumnsIfMissing('service_masters', …)` gains `color`)
- Test: `tests/Unit/Appointments/TeamColoursTest.php`, `tests/Feature/Appointments/Setup/TeamColourTest.php`

**Interfaces:**
- Produces: `TeamColours::PALETTE` (`array<string,string>` key → lowercase hex, 10 entries, order fixed); `TeamColours::assign(iterable $masters): array<int,string>` (id → hex); `TeamColours::paletteList(): list<array{key:string,hex:string}>`; calendar JSON `masters[].color` (hex, always set); setup JSON `palette` (list), `team_colors` (object id → hex, active members only), `team[].color` (stored choice or null); team create/update accepts `color` (palette hex or null).

- [ ] **Step 1: Write the failing unit test**

```php
<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\TeamColours;
use PHPUnit\Framework\TestCase;

/** Team colours (spec §5.3): a fixed palette the server owns; every active person gets one, choices are kept. */
class TeamColoursTest extends TestCase
{
    private static function lum(string $hex): float
    {
        $c = array_map(fn ($i) => hexdec(substr($hex, $i, 2)) / 255, [1, 3, 5]);
        $c = array_map(fn ($v) => $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4, $c);

        return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
    }

    private static function ratio(string $a, string $b): float
    {
        [$x, $y] = [self::lum($a), self::lum($b)];

        return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
    }

    public function test_the_palette_has_ten_distinct_lowercase_colours(): void
    {
        $this->assertCount(10, TeamColours::PALETTE);
        $this->assertSame(array_values(TeamColours::PALETTE), array_values(array_unique(TeamColours::PALETTE)));
        foreach (TeamColours::PALETTE as $hex) {
            $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $hex);
        }
    }

    public function test_every_colour_reads_as_a_dot_on_light_and_dark_surfaces(): void
    {
        // Atelier surfaces (spec §4.1): light canvas, surface, surface-2; dark canvas, surface, surface-2.
        foreach (TeamColours::PALETTE as $key => $hex) {
            foreach (['#f4f6f8', '#ffffff', '#eef2f5', '#0e1a24', '#13232f', '#1a2e3c'] as $surface) {
                $this->assertGreaterThanOrEqual(3.0, self::ratio($hex, $surface), "$key $hex on $surface");
            }
        }
    }

    public function test_choices_are_kept_and_the_rest_take_the_first_free_colour_by_id(): void
    {
        $p = array_values(TeamColours::PALETTE);
        $members = [
            (object) ['id' => 7, 'color' => null],
            (object) ['id' => 3, 'color' => $p[0]],   // a manager's choice
            (object) ['id' => 5, 'color' => null],
            (object) ['id' => 9, 'color' => 'not-a-palette-colour'],
        ];

        $this->assertSame([3 => $p[0], 5 => $p[1], 7 => $p[2], 9 => $p[3]], TeamColours::assign($members));
    }

    public function test_a_team_larger_than_the_palette_wraps_and_never_changes_a_choice(): void
    {
        $p = array_values(TeamColours::PALETTE);
        $members = array_map(fn ($id) => (object) ['id' => $id, 'color' => null], range(1, 12));
        $members[] = (object) ['id' => 13, 'color' => $p[4]];
        $out = TeamColours::assign($members);

        $this->assertCount(13, $out);
        $this->assertSame($p[4], $out[13]);
        foreach ($out as $hex) {
            $this->assertContains($hex, $p);
        }
    }

    public function test_the_palette_list_keeps_the_order(): void
    {
        $list = TeamColours::paletteList();
        $this->assertSame(array_keys(TeamColours::PALETTE), array_column($list, 'key'));
        $this->assertSame(array_values(TeamColours::PALETTE), array_column($list, 'hex'));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Appointments/TeamColoursTest.php`
Expected: FAIL — class `TeamColours` not found.

- [ ] **Step 3: Implement the service**

```php
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
        'raspberry' => '#c2477a',
        'teal'      => '#2e9e83',
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
```

- [ ] **Step 4: Run the unit test**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Appointments/TeamColoursTest.php`
Expected: PASS (5). If the contrast case fails for a colour, move that colour's lightness only (keep its hue; e.g. darken an orange by a few steps) until it passes on all six surfaces, and say which in the report — never lower the 3.0.

- [ ] **Step 5: Migration, model, test schema**

Migration:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A manager's choice of calendar colour for a team member (Appointments, spec §5.3). Null = automatic. */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('service_masters', 'color')) {
            Schema::table('service_masters', function (Blueprint $table) {
                $table->string('color', 7)->nullable()->after('avatar');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('service_masters', 'color')) {
            Schema::table('service_masters', function (Blueprint $table) {
                $table->dropColumn('color');
            });
        }
    }
};
```

`ServiceMaster::$fillable` gains `'color'`. In `tests/Concerns/SetsUpAppointmentsSchema.php`, the `addColumnsIfMissing('service_masters', [...])` list gains `'color' => fn (Blueprint $t) => $t->string('color', 7)->nullable(),`.

- [ ] **Step 6: Write the failing feature test**

`tests/Feature/Appointments/Setup/TeamColourTest.php` — follow the neighbouring Setup feature tests for setup (`use DatabaseTransactions, SetsUpAppointmentsSchema;`, `setUpAppointments()`, `asStaff()` = a manager of `$this->org`, `api($path)`), and the way they create team members (read one test in `tests/Feature/Appointments/Setup/` first and reuse its helper for a ServiceMaster with hours). Cases:

```php
    public function test_the_calendar_gives_every_active_person_a_colour(): void
    {
        // two active people, one with a choice; the response carries masters[].color for both
        // assert: the chosen one keeps its hex; the other gets TeamColours::PALETTE['blue'] unless blue is chosen
    }

    public function test_setup_serves_the_palette_and_each_persons_assigned_colour(): void
    {
        // GET setup: json('palette') === TeamColours::paletteList(); json('team_colors')[id] is set for active people;
        // json('team')[...]['color'] is the stored choice (null when automatic)
    }

    public function test_a_manager_picks_a_colour_and_can_go_back_to_automatic(): void
    {
        // PATCH setup/team/{id} {color: palette hex} → 200, stored lower case; PATCH {color: null} → 200, stored null
    }

    public function test_a_colour_outside_the_palette_is_refused(): void
    {
        // PATCH {color: '#123456'} → 422 with an error on `color`
    }
```

Write each body completely with the helpers you found (no placeholders left in the committed test).

- [ ] **Step 7: Run it to see it fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Setup/TeamColourTest.php`
Expected: FAIL (no `color` in payloads / validation missing).

- [ ] **Step 8: Wire it**

- `CalendarController::calendar()`: after `$masters = ServiceMaster::where('is_active', true)…->get();` add `$colours = TeamColours::assign($masters);` and in the master row add `'color' => $colours[$m->id],` after `'avatar'`.
- `TeamSetup::FIELDS` gains `'color'`; `TeamSetup::rules()` gains `'color' => ['nullable', 'string', Rule::in(array_values(TeamColours::PALETTE))],` — and lower-case the incoming value before validation (in the controller: `$request->merge(['color' => is_string($request->input('color')) ? strtolower($request->input('color')) : $request->input('color')])` when the key is present).
- `SetupPresenter::member()`: add `'color' => $master->color,`.
- `SetupController` payload: add `'palette' => TeamColours::paletteList(),` and `'team_colors' => (object) TeamColours::assign(ServiceMaster::where('is_active', true)->get(['id', 'color'])),`.

- [ ] **Step 9: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Appointments/` and `… tests/Feature/Appointments/` — read both `Tests:` lines; all pass.

- [ ] **Step 10: Commit**

```bash
git add database/migrations/2026_10_12_100000_add_color_to_service_masters_table.php app/Services/Appointments/TeamColours.php app/Models/ServiceMaster.php app/Services/Booking/Setup/TeamSetup.php app/Http/Controllers/Api/V1/Admin/Appointments tests
git commit -m "Appointments: a colour per team member, chosen from the server's palette" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Team colours in the workspace

**Files:**
- Modify: `frontend/src/appointments/lib/types.ts`, `frontend/src/appointments/theme/appointments.css`, `frontend/src/appointments/calendar/TimeGrid.tsx`, `frontend/src/appointments/calendar/AppointmentCard.tsx`, `frontend/src/appointments/setup/TeamEditor.tsx`, `frontend/src/appointments/lib/api.ts` (only if `TeamBody` lives there), i18n ×5
- Test: `frontend/src/appointments/calendar/calendar.test.tsx`, `frontend/src/appointments/setup/editors.test.tsx`, `frontend/src/appointments/theme/contrast.test.ts` (scope check of the new rules)

**Interfaces:**
- Consumes: Task 1 JSON (`masters[].color`, `palette`, `team_colors`, `team[].color`).
- Produces: `CalendarMaster.color: string`; `SetupTeamMember.color: string | null`; `SetupPayload.palette: { key: string; hex: string }[]`; `SetupPayload.team_colors: Record<string, string>`; `TeamBody.color?: string | null`; `AppointmentCard` prop `memberColor?: string`; CSS classes `a-member-dot`, `a-member-ring` reading `--a-m`.

- [ ] **Step 1: Words**

Add `setup.team.colour`, `setup.team.colour_auto`, `setup.team.colour_hint` and a top-level `colours` object:

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| setup.team.colour | Colour on the calendar | Farbe im Kalender | Color en el calendario | Couleur dans le calendrier | Цвет в календаре |
| setup.team.colour_auto | Automatic | Automatisch | Automático | Automatique | Автоматически |
| setup.team.colour_hint | Shown as a dot on their appointments and a ring on their column. | Erscheint als Punkt auf ihren Terminen und als Ring über ihrer Spalte. | Se muestra como un punto en sus citas y un aro en su columna. | Affichée en point sur ses rendez-vous et en anneau sur sa colonne. | Точка на их записях и кольцо над их колонкой. |
| colours.blue / orange / violet / raspberry / teal / ochre / green / coral / indigo / brown | Blue / Orange / Violet / Raspberry / Teal / Ochre / Green / Coral / Indigo / Brown | Blau / Orange / Violett / Himbeere / Petrol / Ocker / Grün / Koralle / Indigo / Braun | Azul / Naranja / Violeta / Frambuesa / Verde azulado / Ocre / Verde / Coral / Índigo / Marrón | Bleu / Orange / Violet / Framboise / Bleu canard / Ocre / Vert / Corail / Indigo / Brun | Синий / Оранжевый / Фиолетовый / Малиновый / Бирюзовый / Охра / Зелёный / Коралловый / Индиго / Коричневый |

- [ ] **Step 2: Write the failing tests**

In `calendar.test.tsx` (use its existing render helpers and fixtures; give the fixture masters `color` values — e.g. read them from a constant array in the test, never from hex literals inside `.tsx` source files):
- a day-view column head's avatar carries `a-member-ring` and `--a-m:<that master's colour>`;
- a card in that column carries an `a-member-dot` with the same `--a-m`;
- the status mark is unchanged (icon + word) — the colour is never the only signal.

In `editors.test.tsx` (TeamEditor): the colour group is a `radiogroup` named "Colour on the calendar" with "Automatic" plus one radio per palette entry named by its colour word ("Blue", …), the stored choice is checked (Automatic when `color` is null), and the swatch for an automatic member's assigned colour (`team_colors[id]`) is marked as the current one in the hint (e.g. `aria-describedby` text "Currently Blue"). Saving sends `color` (hex or null).

In `contrast.test.ts`: the `.a-member-dot` and `.a-member-ring` rules exist and start with `[data-appointments]`.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/calendar src/appointments/setup src/appointments/theme`
Expected: the new cases FAIL.

- [ ] **Step 4: Implement**

Types (in `lib/types.ts`): `CalendarMaster` gains `color: string`; `SetupTeamMember` gains `color: string | null`; `SetupPayload` gains `palette: { key: string; hex: string }[]; team_colors: Record<string, string>`; `TeamBody` gains `color?: string | null`.

CSS (in `appointments.css`, after the hatch rule):

```css
/* A team member's calendar colour (spec §5.3), set as --a-m on the element from the server's palette. */
[data-appointments] .a-member-dot {
  background-color: var(--a-m);
}

[data-appointments] .a-member-ring {
  box-shadow: 0 0 0 2px var(--a-m);
}
```

`TimeGrid.tsx`: the column-head avatar `span` gets `a-member-ring` (drop its `ring-1 ring-a-border`) and `style={{ '--a-m': col.master.color } as CSSProperties}` (import `type CSSProperties`); pass `memberColor={col.master.color}` to each `AppointmentCard`.

`AppointmentCard.tsx`: new optional prop `memberColor?: string`; when set, render `<span aria-hidden className="a-member-dot h-2 w-2 shrink-0 rounded-full" style={{ '--a-m': memberColor } as CSSProperties} />` as the first element of the time row in every density.

`TeamEditor.tsx`: the draft gains `color: string | null` (from `member?.color ?? null`); `toBody` sends `color: draft.color`. After the active checkbox, add:

```tsx
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.team.colour', 'Colour on the calendar')}</legend>
              <div role="radiogroup" aria-label={t('appointments.setup.team.colour', 'Colour on the calendar')} aria-describedby="team-colour-hint" className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-a-border px-3 py-1.5 text-sm text-a-text has-[:checked]:border-a-accent-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-accent-text">
                  <input type="radio" name="team-colour" className="sr-only" checked={draft.color === null} onChange={() => set({ color: null })} />
                  {t('appointments.setup.team.colour_auto', 'Automatic')}
                </label>
                {palette.map(c => (
                  <label key={c.key} className="relative inline-flex h-8 w-8 items-center justify-center rounded-full has-[:checked]:ring-2 has-[:checked]:ring-offset-2 has-[:checked]:ring-a-accent-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-accent-text">
                    <input type="radio" name="team-colour" className="sr-only" checked={draft.color === c.hex} onChange={() => set({ color: c.hex })} />
                    <span aria-hidden className="a-member-dot h-6 w-6 rounded-full" style={{ '--a-m': c.hex } as CSSProperties} />
                    <span className="sr-only">{t(`appointments.colours.${c.key}`, c.key)}</span>
                  </label>
                ))}
              </div>
              <p id="team-colour-hint" className="text-xs text-a-text-2">{t('appointments.setup.team.colour_hint', 'Shown as a dot on their appointments and a ring on their column.')}</p>
            </fieldset>
```

`palette` and the member's assigned colour come from the Setup payload (pass `palette` and `assigned = team_colors[String(member.id)]` into `TeamEditor` from `TeamTab`); when `draft.color === null` and `assigned` is set, append to the hint ` (${t(`appointments.colours.${keyOf(assigned)}`)})` so the automatic colour is named.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass; then `npx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: team colours on the calendar and a picker in Setup" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Team chips on the day view

**Files:**
- Modify: `frontend/src/appointments/lib/prefs.ts` (+ `lib/prefs.test.ts`)
- Create: `frontend/src/appointments/calendar/TeamChips.tsx` (+ `calendar/teamChips.test.tsx`)
- Modify: `frontend/src/appointments/calendar/CalendarPage.tsx`, `frontend/src/appointments/calendar/Toolbar.tsx` (+ `toolbar.test.tsx`), i18n ×5

**Interfaces:**
- Consumes: `CalendarMaster.color` (Task 2).
- Produces: `Prefs.hiddenMasters: number[]`; `toggleHidden(hidden: number[], id: number, allIds: number[]): number[]`; `<TeamChips masters hidden counts onToggle />`; `Toolbar` prop `personPicker: boolean`.

- [ ] **Step 1: Words**

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| calendar.team_chips | Team on the calendar | Team im Kalender | Equipo en el calendario | Équipe dans le calendrier | Команда в календаре |
| calendar.team_chips_last | At least one person stays on the calendar | Mindestens eine Person bleibt im Kalender | Al menos una persona sigue en el calendario | Au moins une personne reste dans le calendrier | Хотя бы один человек остаётся в календаре |

- [ ] **Step 2: Write the failing tests**

`lib/prefs.test.ts` — add:

```ts
  it('keeps the people hidden on the day view, as whole ids, once each', () => {
    expect(parsePrefs('{"hiddenMasters":[3,3,7]}').hiddenMasters).toEqual([3, 7])
    expect(parsePrefs('{"hiddenMasters":[1.5,"2",null,4]}').hiddenMasters).toEqual([4])
    expect(parsePrefs('{"hiddenMasters":"3"}').hiddenMasters).toEqual([])
    expect(parsePrefs(null).hiddenMasters).toEqual([])
  })
```

`calendar/teamChips.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamChips, toggleHidden } from './TeamChips'
import type { CalendarMaster } from '../lib/types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

const COLOURS = ['#3b7dd8', '#c46f1b']
const masters = [
  { id: 1, name: 'Marie', title: null, avatar: null, days: {}, color: COLOURS[0] },
  { id: 2, name: 'Anouk', title: null, avatar: null, days: {}, color: COLOURS[1] },
] as CalendarMaster[]

describe('team chips', () => {
  it('hides and shows people, never the last one, and forgets people who are gone', () => {
    expect(toggleHidden([], 1, [1, 2])).toEqual([1])
    expect(toggleHidden([1], 1, [1, 2])).toEqual([])
    expect(toggleHidden([1], 2, [1, 2])).toEqual([1])      // 2 is the last one visible: stays
    expect(toggleHidden([9, 1], 2, [1, 2])).toEqual([1])    // 9 left the team: dropped, 2 is still the last
  })

  it('is a named group of pressed buttons with each person\'s colour and count', () => {
    const html = renderToStaticMarkup(<TeamChips masters={masters} hidden={[2]} counts={{ 1: 3, 2: 0 }} onToggle={() => {}} />)
    expect(html).toMatch(/role="group"[^>]*aria-label="Team on the calendar"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Marie/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>[\s\S]*?Anouk/)
    expect(html).toContain(`--a-m:${COLOURS[0]}`)
  })

  it('says why the last visible person cannot be hidden', () => {
    const html = renderToStaticMarkup(<TeamChips masters={masters} hidden={[2]} counts={{}} onToggle={() => {}} />)
    expect(html).toMatch(/aria-disabled="true"[^>]*title="At least one person stays on the calendar"[^>]*>[\s\S]*?Marie|title="At least one person stays on the calendar"[^>]*aria-disabled="true"/)
  })
})
```

`toolbar.test.tsx` — add: with `personPicker={false}` there is no `<select` for the team member; with `true` there is.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/lib/prefs.test.ts src/appointments/calendar`
Expected: FAIL.

- [ ] **Step 4: Implement**

`lib/prefs.ts`: `Prefs` gains `hiddenMasters: number[]`; `DEFAULT_PREFS.hiddenMasters = []`; in `parsePrefs`:

```ts
    hiddenMasters: Array.isArray(v.hiddenMasters)
      ? [...new Set(v.hiddenMasters.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)))]
      : [],
```

`calendar/TeamChips.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { CalendarMaster } from '../lib/types'

/** Hidden ids that still name someone on the team; the one visible person cannot be hidden (spec §5.4). */
// eslint-disable-next-line react-refresh/only-export-components
export function toggleHidden(hidden: number[], id: number, allIds: number[]): number[] {
  const current = hidden.filter(h => allIds.includes(h))
  if (current.includes(id)) return current.filter(h => h !== id)
  const visible = allIds.filter(a => !current.includes(a))
  if (visible.length <= 1 && visible.includes(id)) return current
  return [...current, id]
}

/** Show or hide people on the day view, remembered on this device. */
export function TeamChips({ masters, hidden, counts, onToggle }: {
  masters: CalendarMaster[]; hidden: number[]; counts: Record<number, number>; onToggle: (id: number) => void
}) {
  const { t } = useTranslation()
  const ids = masters.map(m => m.id)
  const visible = ids.filter(id => !hidden.includes(id))
  return (
    <div role="group" aria-label={t('appointments.calendar.team_chips', 'Team on the calendar')} className="flex flex-wrap items-center gap-2">
      {masters.map(m => {
        const shown = !hidden.includes(m.id)
        const last = shown && visible.length === 1
        return (
          <button key={m.id} type="button" aria-pressed={shown} aria-disabled={last || undefined}
            title={last ? t('appointments.calendar.team_chips_last', 'At least one person stays on the calendar') : undefined}
            onClick={() => { if (!last) onToggle(m.id) }}
            style={{ '--a-m': m.color } as CSSProperties}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${shown ? 'border-a-border bg-a-surface text-a-text' : 'border-dashed border-a-border bg-transparent text-a-text-2'}`}>
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${shown ? 'a-member-dot' : 'a-member-ring'}`} />
            {m.name}
            <span className="font-a-mono text-xs text-a-text-2">{counts[m.id] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
```

`CalendarPage.tsx` (day view only; week and list keep today's behaviour):
- `const hidden = prefs.hiddenMasters.filter(id => masters.some(m => m.id === id))`
- `const dayMasters = masters.filter(m => !hidden.includes(m.id))`
- for `view === 'day'`: columns from `columnsFor('day', date, dayMasters, null, …)` and `shown` = appointments whose `master` is null or in `dayMasters` (unassigned appointments stay visible as before); for week/list keep `masterId` exactly as now;
- `counts`: per master, the date's non-cancelled appointments;
- render `<TeamChips masters={masters} hidden={hidden} counts={counts} onToggle={(id) => setPrefs({ ...prefs, hiddenMasters: toggleHidden(prefs.hiddenMasters, id, masters.map(m => m.id)) })} />` between the toolbar and the grid, only in the day view (`px-4 lg:px-6 pb-3`).
- `Toolbar` gets `personPicker={view !== 'day'}` and renders its team `<select>` only when true.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass (update only toolbar/calendar-page assertions that expected the picker on the day view; list them).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: team chips show and hide people on the day view" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Today strip

**Files:**
- Create: `frontend/src/appointments/calendar/todayFigures.ts` (+ `calendar/todayFigures.test.ts`), `frontend/src/appointments/calendar/TodayStrip.tsx` (+ `calendar/todayStrip.test.tsx`)
- Modify: `frontend/src/appointments/calendar/CalendarPage.tsx`, `frontend/src/appointments/calendar/DayOverview.tsx` (+ its test), i18n ×5

**Interfaces:**
- Consumes: `dayOverview()`, `needsAttention()` (`lib/status.ts`), `appointmentsApi.takings(date)`, `money()` (`frontend/src/lib/money.ts`), `useBoot()`.
- Produces: `todayFigures(appointments: AppointmentSummary[], masters: CalendarMaster[], date: DateKey, now: { date: DateKey; minutes: number }): TodayFigures` where `TodayFigures = { total: number; done: number; noShow: number; attention: number; next: AppointmentSummary | null; nextIsFirst: boolean; teamIn: CalendarMaster[]; teamOff: CalendarMaster[] }`; `takenNet(t: Takings, currency: string): { amount: number; payments: number }`; `<TodayStrip date now appointments masters />`.

- [ ] **Step 1: Words**

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| today.label | At a glance | Auf einen Blick | De un vistazo | En un coup d'œil | Коротко о дне |
| today.done_noshow | {{done}} done · {{noshow}} no-show | {{done}} erledigt · {{noshow}} nicht erschienen | {{done}} hechas · {{noshow}} no presentadas | {{done}} terminés · {{noshow}} absences | Завершено: {{done}} · неявок: {{noshow}} |
| today.next | Next up | Als Nächstes | Siguiente | Ensuite | Далее |
| today.first | First appointment | Erster Termin | Primera cita | Premier rendez-vous | Первая запись |
| today.next_line | {{service}} · {{client}} with {{member}} | {{service}} · {{client}} bei {{member}} | {{service}} · {{client}} con {{member}} | {{service}} · {{client}} avec {{member}} | {{service}} · {{client}} — {{member}} |
| today.nothing_more | Nothing else booked today | Heute nichts mehr gebucht | Nada más reservado hoy | Plus rien de réservé aujourd'hui | Сегодня больше записей нет |
| today.nothing | Nothing booked | Nichts gebucht | Nada reservado | Rien de réservé | Записей нет |
| today.takings | Takings | Einnahmen | Cobros | Encaissements | Касса |
| today.payments | Payments: {{count}} | Zahlungen: {{count}} | Pagos: {{count}} | Paiements : {{count}} | Платежей: {{count}} |
| today.attention_hint | Awaiting confirmation or late | Unbestätigt oder verspätet | Sin confirmar o con retraso | À confirmer ou en retard | Ждут подтверждения или опаздывают |
| today.team | Team | Team | Equipo | Équipe | Команда |
| today.team_in | In: {{count}} | Da: {{count}} | Presentes: {{count}} | Présents : {{count}} | На месте: {{count}} |
| today.team_off | Off: {{names}} | Frei: {{names}} | Libres: {{names}} | Absents : {{names}} | Не работают: {{names}} |

- [ ] **Step 2: Write the failing tests**

`calendar/todayFigures.test.ts` — build `AppointmentSummary` and `CalendarMaster` fixtures with the existing test helpers if there are any (grep `calendar.test.tsx` for an appointment factory) and cover:
- counts: total excludes cancelled; `done` = completed; `noShow` = no_show; `attention` equals `dayOverview(...).attention`;
- next on the venue's today = the earliest pending/confirmed appointment starting at or after `now.minutes`, `nextIsFirst = false`; none left → `next = null`;
- another day → the earliest non-cancelled appointment of that day, `nextIsFirst = true`;
- team: a master with working windows on the date and no whole-day time off is in; a whole-day time off (`start` and `end` null) or no windows is off;
- `takenNet`: sums `in - out` over every method of the given currency and counts the rows of that currency; another currency is ignored.

`calendar/todayStrip.test.tsx` — static render with a mocked `useBoot()` (manager and staff variants) and a QueryClient with the takings data pre-set (`['appointments', 'takings', date]`):
- a manager sees "Takings" with the money string from `money()` and "Payments: N"; staff see "Needs attention" with the count and no money string anywhere in the markup;
- "Next up" shows the time in the display face and the "service · client with member" line; another day shows "First appointment";
- the team tile lists "In: N" and "Off: names";
- it is a `section` named "At a glance".

`DayOverview` test: the counts are gone; the status legend remains.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/calendar`
Expected: FAIL — missing modules.

- [ ] **Step 4: Implement**

`calendar/todayFigures.ts`:

```ts
import { dayOverview } from '../lib/status'
import type { AppointmentSummary, CalendarMaster, DateKey, Takings } from '../lib/types'
import { dateOf, wallMinutes } from '../lib/wallClock'

export interface TodayFigures {
  total: number; done: number; noShow: number; attention: number
  next: AppointmentSummary | null; nextIsFirst: boolean
  teamIn: CalendarMaster[]; teamOff: CalendarMaster[]
}

/** The day at a glance (spec §5.4), from what the calendar already holds — no second source of numbers. */
export function todayFigures(appointments: AppointmentSummary[], masters: CalendarMaster[], date: DateKey, now: { date: DateKey; minutes: number }): TodayFigures {
  const day = appointments.filter(a => dateOf(a.start) === date && a.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  const isToday = date === now.date
  const next = isToday
    ? day.find(a => (a.status === 'pending' || a.status === 'confirmed') && wallMinutes(a.start) >= now.minutes) ?? null
    : day[0] ?? null
  const working = (m: CalendarMaster) => {
    const d = m.days[date]
    if (!d || d.windows.length === 0) return false
    return !d.time_off.some(off => off.start === null && off.end === null)
  }
  return {
    total: day.length,
    done: day.filter(a => a.status === 'completed').length,
    noShow: day.filter(a => a.status === 'no_show').length,
    attention: dayOverview(appointments, date, now).attention,
    next,
    nextIsFirst: !isToday,
    teamIn: masters.filter(working),
    teamOff: masters.filter(m => !working(m)),
  }
}

/** Net money taken on the day in one currency, and how many movements made it (the Takings screen's own figures). */
export function takenNet(t: Takings, currency: string): { amount: number; payments: number } {
  const methods = t.totals[currency] ?? {}
  const amount = Object.values(methods).reduce((sum, m) => sum + (m?.in ?? 0) - (m?.out ?? 0), 0)
  const payments = t.rows.filter(r => r.currency === currency).length
  return { amount: Math.round(amount * 100) / 100, payments }
}
```

(If `TakingsRow`/`MoneyMovement` has no `currency` field, count `t.rows.length` and adjust the test — check `lib/types.ts` `MoneyMovement` first.)

`calendar/TodayStrip.tsx` — a `<section aria-label={t('appointments.today.label', 'At a glance')} className="grid grid-cols-2 gap-3 px-4 lg:px-6 pb-3 xl:grid-cols-4">` with four tiles (`rounded-xl border border-a-border bg-a-surface p-4 shadow-a-sm animate-a-rise`, the second to fourth with `[animation-delay:60ms]`, `[animation-delay:120ms]`, `[animation-delay:180ms]` for the ≤ 60 ms stagger of spec §4.7), each tile an `Eyebrow`-styled heading (`h2` with the eyebrow classes) and a `Figure`-styled value (`p` with `font-a-display text-3xl font-light tabular-nums`):
1. Appointments: `total`; sub `today.done_noshow`.
2. Next up / First appointment: `timeOf(next.start)` or `—`; sub `today.next_line` (service name or "—", client name, master name or "—") or `today.nothing_more` (today) / `today.nothing` (other day).
3. Managers (`boot.staff.can_manage`): Takings — `useQuery({ queryKey: ['appointments', 'takings', date], queryFn: () => appointmentsApi.takings(date), enabled: canManage, staleTime: 30_000 })`; value `money(amount, boot.venue.currency)`, sub `today.payments`; while loading `—`. Everyone else: Needs attention (`t('appointments.overview.attention', 'Needs attention')`) — `attention`, sub `today.attention_hint`.
4. Team: a stack of initials avatars (`a-member-ring`, `--a-m` = colour, `-ml-1.5` overlap, the first without) for `teamIn`, sub `today.team_in` + (when any) ` · ` + `today.team_off` with the names joined by ", ".

`CalendarPage.tsx`: in the day view render `<TodayStrip …/>` above `<TeamChips …/>` (Task 3), passing the unfiltered `appointments` and `masters`, `date`, `now`.

`DayOverview.tsx`: remove the counts block and its hint; keep the "Statuses" legend (rename the component's section label to the legend only).

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass; `npx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: the Today strip — appointments, next up, takings or attention, team" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hover preview on calendar cards

**Files:**
- Create: `frontend/src/appointments/calendar/CardPreview.tsx` (+ `calendar/cardPreview.test.tsx`)
- Modify: `frontend/src/appointments/calendar/TimeGrid.tsx`, `frontend/src/appointments/calendar/AppointmentCard.tsx`, i18n ×5

**Interfaces:**
- Consumes: `appointmentsApi.booking(id)` and its query key `['appointments', 'booking', id]` (the panel's), `money()`, `useBoot()`.
- Produces: `previewPlacement(colIndex: number, colCount: number, cardTop: number, gridHeight: number): { side: 'right' | 'left'; above: boolean }`; `<CardPreview id appointment memberName placement top bottom />`; `AppointmentCard` props `onPreviewStart?: (id: number) => void`, `onPreviewEnd?: () => void`, `previewId?: string`.

- [ ] **Step 1: Words**

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| preview.points | {{tier}} · {{points}} points | {{tier}} · {{points}} Punkte | {{tier}} · {{points}} puntos | {{tier}} · {{points}} points | {{tier}} · баллов: {{points}} |
| preview.points_only | {{points}} points | {{points}} Punkte | {{points}} puntos | {{points}} points | Баллов: {{points}} |
| preview.with | with {{name}} | bei {{name}} | con {{name}} | avec {{name}} | мастер: {{name}} |
| preview.length | {{minutes}} min | {{minutes}} Min. | {{minutes}} min | {{minutes}} min | {{minutes}} мин |
| preview.hint | Click to open | Zum Öffnen klicken | Haz clic para abrir | Cliquez pour ouvrir | Нажмите, чтобы открыть |

- [ ] **Step 2: Write the failing tests**

`calendar/cardPreview.test.tsx` (static render; QueryClient with or without `['appointments', 'booking', id]` data; mocked `useBoot()` with `loyalty.programme_on` true/false):
- `previewPlacement`: last column → `left`, others `right`; a card in the lower 40 % of the grid → `above: true`;
- with detail data: client name (display face), "Gold · 2,350 points" (use the workspace's number formatting as the component does), service, `10:00 – 11:00 · 60 min`, `with Marie`, the price via `money()` and the payment word (`appointments.payment.<state>`); `role="tooltip"` with the given id;
- without detail data (loading or failed): it still shows the client, service, time, length and member from the card, and no price line — and it does not throw;
- with the programme off: no points line.

`calendar.test.tsx` — the card passes `aria-describedby` that includes the preview id while the preview is open (render `TimeGrid` with an initial preview state if you expose one for tests, or test `AppointmentCard` directly with `previewId`).

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/calendar`
Expected: FAIL.

- [ ] **Step 4: Implement**

`calendar/CardPreview.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { AppointmentSummary } from '../lib/types'
import { timeOf } from '../lib/wallClock'

/** Where a preview goes: beside the card, away from the grid's right edge and bottom (spec §5.5). */
// eslint-disable-next-line react-refresh/only-export-components
export function previewPlacement(colIndex: number, colCount: number, cardTop: number, gridHeight: number): { side: 'right' | 'left'; above: boolean } {
  return { side: colIndex === colCount - 1 ? 'left' : 'right', above: gridHeight > 0 && cardTop > gridHeight * 0.6 }
}

/**
 * A small card beside a calendar card after a short rest of the pointer or on
 * keyboard focus. It reads the same appointment detail the panel loads, so the
 * panel opens at once afterwards; until (or unless) that detail arrives it shows
 * what the calendar card already knows.
 */
export function CardPreview({ id, appointment, memberName, placement, top, bottom }: {
  id: string; appointment: AppointmentSummary; memberName: string | null
  placement: { side: 'right' | 'left'; above: boolean }; top: number; bottom: number
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const detail = useQuery({
    queryKey: ['appointments', 'booking', appointment.id],
    queryFn: () => appointmentsApi.booking(appointment.id),
    staleTime: 30_000,
    retry: false,
  })
  const b = detail.data?.booking
  const member = b?.loyalty?.member ?? b?.client.member ?? null
  const points = member ? new Intl.NumberFormat(i18n.language || 'en').format(member.points) : null
  const style = {
    [placement.side === 'right' ? 'left' : 'right']: 'calc(100% + 8px)',
    ...(placement.above ? { bottom: `calc(100% - ${bottom}px)` } : { top }),
  }

  return (
    <div id={id} role="tooltip" style={style}
      className="pointer-events-none absolute z-30 w-[17rem] space-y-1.5 rounded-xl border border-a-border bg-a-surface p-3.5 text-sm text-a-text shadow-a-lg animate-a-pop">
      <div className="font-a-display text-base font-normal leading-tight">{appointment.client.name}</div>
      {boot.loyalty.programme_on && member && points !== null && (
        <div className="text-xs text-a-text-2">{member.tier
          ? t('appointments.preview.points', '{{tier}} · {{points}} points', { tier: member.tier, points })
          : t('appointments.preview.points_only', '{{points}} points', { points })}</div>
      )}
      <div>{appointment.service?.name ?? '—'}</div>
      <div className="font-a-mono text-xs text-a-text-2">{timeOf(appointment.start)} – {timeOf(appointment.end)} · {t('appointments.preview.length', '{{minutes}} min', { minutes: appointment.duration_minutes })}</div>
      {memberName && <div className="text-a-text-2">{t('appointments.preview.with', 'with {{name}}', { name: memberName })}</div>}
      {b && (
        <div className="text-a-text-2"><span className="font-semibold text-a-text">{money(b.price.total, b.price.currency)}</span> · {t(`appointments.payment.${b.payment.state}`)}</div>
      )}
      <div className="border-t border-a-border pt-1.5 text-xs text-a-text-2">{t('appointments.preview.hint', 'Click to open')}</div>
    </div>
  )
}
```

(Cast the `style` object to `CSSProperties`.)

`AppointmentCard.tsx`: new props `onPreviewStart?`, `onPreviewEnd?`, `previewId?`. On the button: `onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPreviewStart?.(item.id) }}`, `onPointerLeave={() => onPreviewEnd?.()}`, `onBlur={() => onPreviewEnd?.()}`; in the existing `onFocus` also call `onPreviewStart?.(item.id)`; `aria-describedby={[describedBy, previewId].filter(Boolean).join(' ') || undefined}`; `onKeyDown`: `Escape` with an open preview → `onPreviewEnd?.()` (do not stop propagation otherwise).

`TimeGrid.tsx`: state `const [preview, setPreview] = useState<number | null>(null)` and a `useRef<number>()` timer; `start(id)` = clear the timer, then `window.setTimeout(() => setPreview(id), 300)` unless a drag is active (`drag` truthy); `end()` = clear the timer and `setPreview(null)`; clear the timer on unmount (`useEffect` cleanup); close the preview when a drag begins (`if (drag && preview !== null) setPreview(null)` while rendering). For each placed card pass `onPreviewStart={start} onPreviewEnd={end} previewId={preview === p.item.id ? `card-preview-${p.item.id}` : undefined}` and, when `preview === p.item.id`, render `<CardPreview id={`card-preview-${p.item.id}`} appointment={p.item} memberName={col.master.name} placement={previewPlacement(i, cols.length, p.top, height)} top={p.top} bottom={p.top + p.height} />` inside the column, after the cards.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass; `npx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: a hover preview on calendar cards" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Find (Ctrl K)

**Files:**
- Create: `frontend/src/appointments/find/findResults.ts` (+ `find/findResults.test.ts`), `frontend/src/appointments/find/FindDialog.tsx` (+ `find/findDialog.test.tsx`)
- Modify: `frontend/src/appointments/AppointmentsShell.tsx` (+ its test), i18n ×5

**Interfaces:**
- Consumes: `appointmentsApi.searchClients(q)`, the calendar queries' cache (`['appointments', 'calendar', …]` → `CalendarPayload`), `useLook()` setters (from the shell), `useBoot()`.
- Produces: `fold(text: string): string`; `type FindItem = { id: string; kind: 'action' | 'appointment' | 'client' | 'search'; label: string; sub?: string; go: FindTarget }`; `type FindTarget = { to: string } | { run: 'theme' | 'rail' | 'shortcuts' }`; `buildResults(input: { query: string; actions: FindItem[]; appointments: AppointmentSummary[]; clients: ClientSummary[]; now: { date: DateKey; minutes: number }; labels: FindLabels }): { title: string; items: FindItem[] }[]`; `<FindDialog open onClose onRun />`; shell state `findOpen`.

- [ ] **Step 1: Words**

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| find.open | Find a client, appointment or action | Kunde, Termin oder Aktion finden | Buscar cliente, cita o acción | Trouver un client, un rendez-vous ou une action | Найти клиента, запись или действие |
| find.title | Find | Suchen | Buscar | Rechercher | Поиск |
| find.actions | Actions | Aktionen | Acciones | Actions | Действия |
| find.go_to | Go to | Gehe zu | Ir a | Aller à | Перейти |
| find.coming_up | Coming up today | Heute als Nächstes | Próximas de hoy | À venir aujourd'hui | Ближайшие сегодня |
| find.appointments | Appointments | Termine | Citas | Rendez-vous | Записи |
| find.search_all | Search all clients for “{{q}}” | Alle Kunden nach „{{q}}“ durchsuchen | Buscar «{{q}}» en todos los clientes | Chercher « {{q}} » dans tous les clients | Искать «{{q}}» среди всех клиентов |
| find.none | Nothing matches “{{q}}”. | Nichts passt zu „{{q}}“. | Nada coincide con «{{q}}». | Aucun résultat pour « {{q}} ». | Ничего не найдено по запросу «{{q}}». |
| find.count | Results: {{count}} | Treffer: {{count}} | Resultados: {{count}} | Résultats : {{count}} | Найдено: {{count}} |
| find.time_off | Time off | Abwesenheit | Ausencias | Absences | Отгулы |
| find.theme_dark | Switch to dark | Zu dunkel wechseln | Cambiar a oscuro | Passer au sombre | Включить тёмную тему |
| find.theme_light | Switch to light | Zu hell wechseln | Cambiar a claro | Passer au clair | Включить светлую тему |
| find.shortcuts | Keyboard shortcuts | Tastenkürzel | Atajos de teclado | Raccourcis clavier | Горячие клавиши |
| find.hint_move | move | wählen | mover | naviguer | выбор |
| find.hint_open | open | öffnen | abrir | ouvrir | открыть |
| find.hint_close | close | schließen | cerrar | fermer | закрыть |
| find.searching | Searching clients… | Kunden werden gesucht… | Buscando clientes… | Recherche des clients… | Ищем клиентов… |

- [ ] **Step 2: Write the failing tests**

`find/findResults.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildResults, fold, type FindItem } from './findResults'
import type { AppointmentSummary, ClientSummary } from '../lib/types'

const appt = (id: number, start: string, client: string, service: string, master: string, status: AppointmentSummary['status'] = 'confirmed'): AppointmentSummary => ({
  id, reference: `R${id}`, start, end: start, duration_minutes: 60, service: { id: 1, name: service }, master: { id: 1, name: master },
  client: { id: id, name: client, is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const labels = { actions: 'Actions', goTo: 'Go to', comingUp: 'Coming up today', appointments: 'Appointments', clients: 'Clients', searchAll: (q: string) => `Search all clients for “${q}”` }
const actions: FindItem[] = [
  { id: 'new', kind: 'action', label: 'New appointment', go: { to: '/appointments?new=1' } },
  { id: 'clients', kind: 'action', label: 'Clients', sub: 'Go to', go: { to: '/appointments/clients' } },
]
const now = { date: '2026-10-12', minutes: 13 * 60 }
const day = [
  appt(1, '2026-10-12T10:00', 'Émilie Durand', 'Gloss', 'Marie'),
  appt(2, '2026-10-12T14:00', 'Mia Chen', 'Cut', 'Anouk'),
  appt(3, '2026-10-12T15:00', 'Noah Taylor', 'Beard', 'Marie', 'cancelled'),
  appt(4, '2026-10-13T09:00', 'Zoe Scott', 'Nails', 'Ilze'),
]

describe('find', () => {
  it('folds case and accents', () => {
    expect(fold('Émilie')).toBe('emilie')
    expect(fold('MIA')).toBe('mia')
  })

  it('with nothing typed shows the actions and the rest of today, cancelled left out', () => {
    const groups = buildResults({ query: '', actions, appointments: day, clients: [], now, labels })
    expect(groups.map(g => g.title)).toEqual(['Actions', 'Coming up today'])
    expect(groups[1].items.map(i => i.id)).toEqual(['appt-2'])
  })

  it('matches appointments by client, service or person, accent- and case-blind', () => {
    const ids = (q: string) => buildResults({ query: q, actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items.map(i => i.id))
    expect(ids('emilie')).toContain('appt-1')
    expect(ids('MIA')).toContain('appt-2')
    expect(ids('marie')).toEqual(expect.arrayContaining(['appt-1']))
    expect(ids('beard')).not.toContain('appt-3') // cancelled
  })

  it('lists clients from the server search and offers to search them all from two letters', () => {
    const clients: ClientSummary[] = [{ id: 9, name: 'Mia Chen', phone: null, email: 'mia@example.test', member: null }]
    const groups = buildResults({ query: 'mi', actions, appointments: day, clients, now, labels })
    const all = groups.flatMap(g => g.items)
    expect(all.find(i => i.id === 'client-9')?.go).toEqual({ to: '/appointments/clients/9' })
    expect(all.at(-1)).toMatchObject({ kind: 'search', label: 'Search all clients for “mi”', go: { to: '/appointments/clients?search=mi' } })
    expect(buildResults({ query: 'm', actions, appointments: day, clients, now, labels }).flatMap(g => g.items).some(i => i.kind === 'search')).toBe(false)
  })

  it('opens an appointment on its own day', () => {
    const item = buildResults({ query: 'zoe', actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items).find(i => i.id === 'appt-4')
    expect(item?.go).toEqual({ to: '/appointments?open=4&date=2026-10-13' })
  })
})
```

`find/findDialog.test.tsx` (static render with `open`): a `role="dialog"` with `aria-modal="true"` named "Find"; an input with `role="combobox"`, `aria-expanded="true"`, `aria-controls` pointing at a `role="listbox"`; options are `role="option"` with ids and the first is `aria-selected="true"`; a polite live region reads "Results: N"; nothing renders when `open` is false.

`AppointmentsShell.test.tsx`: the top bar shows a button "Find a client, appointment or action" with a `kbd` reading "Ctrl K" (or "⌘ K" when the stubbed `navigator.platform` is a Mac); the old search form is gone.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/find src/appointments/AppointmentsShell.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement `findResults.ts`**

```ts
import type { AppointmentSummary, ClientSummary, DateKey } from '../lib/types'
import { dateOf, timeOf, wallMinutes } from '../lib/wallClock'

export type FindTarget = { to: string } | { run: 'theme' | 'rail' | 'shortcuts' }
export interface FindItem { id: string; kind: 'action' | 'appointment' | 'client' | 'search'; label: string; sub?: string; go: FindTarget }
export interface FindLabels { actions: string; goTo: string; comingUp: string; appointments: string; clients: string; searchAll: (q: string) => string }

/** Lower case without accents, so "emilie" finds "Émilie". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const LIMIT = 6

function apptItem(a: AppointmentSummary): FindItem {
  return {
    id: `appt-${a.id}`, kind: 'appointment',
    label: `${timeOf(a.start)} · ${a.client.name}`,
    sub: [a.service?.name, a.master?.name, dateOf(a.start)].filter(Boolean).join(' · '),
    go: { to: `/appointments?open=${a.id}&date=${dateOf(a.start)}` },
  }
}

export function buildResults({ query, actions, appointments, clients, now, labels }: {
  query: string; actions: FindItem[]; appointments: AppointmentSummary[]; clients: ClientSummary[]
  now: { date: DateKey; minutes: number }; labels: FindLabels
}): { title: string; items: FindItem[] }[] {
  const q = fold(query.trim())
  const live = appointments.filter(a => a.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  const seen = new Set<number>()
  const unique = live.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))

  if (q === '') {
    const comingUp = unique.filter(a => dateOf(a.start) === now.date && wallMinutes(a.start) >= now.minutes).slice(0, 3)
    return [
      { title: labels.actions, items: actions.slice(0, LIMIT) },
      ...(comingUp.length ? [{ title: labels.comingUp, items: comingUp.map(apptItem) }] : []),
    ]
  }

  const hit = (...texts: (string | null | undefined)[]) => texts.some(t => t && fold(t).includes(q))
  const groups = [
    { title: labels.actions, items: actions.filter(a => hit(a.label, a.sub)).slice(0, LIMIT) },
    { title: labels.appointments, items: unique.filter(a => hit(a.client.name, a.service?.name, a.master?.name)).slice(0, LIMIT).map(apptItem) },
    { title: labels.clients, items: clients.slice(0, LIMIT).map((c): FindItem => ({
      id: `client-${c.id}`, kind: 'client', label: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · ') || undefined,
      go: { to: `/appointments/clients/${c.id}` },
    })) },
  ].filter(g => g.items.length > 0)

  if (q.length >= 2) {
    const raw = query.trim()
    groups.push({ title: labels.clients, items: [{ id: 'search-all', kind: 'search', label: labels.searchAll(raw), go: { to: `/appointments/clients?search=${encodeURIComponent(raw)}` } }] })
  }
  return groups
}
```

(Two groups may share the "Clients" title: merge the search item into the clients group if one exists, keeping it last. Adjust the test if you merge.)

- [ ] **Step 5: Implement `FindDialog.tsx` and wire the shell**

`FindDialog` props: `{ open: boolean; onClose: () => void; onRun: (target: FindTarget) => void; actions: FindItem[] }`. When `open`:
- a scrim `<button aria-label={t('appointments.common.close', 'Close')} className="fixed inset-0 z-50 bg-a-scrim/40 animate-a-fade" onClick={onClose} />` and a panel `<div role="dialog" aria-modal="true" aria-label={t('appointments.find.title', 'Find')} className="fixed left-1/2 top-24 z-50 w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-lg animate-a-pop">`;
- an input (`role="combobox"`, `aria-expanded="true"`, `aria-controls="find-list"`, `aria-activedescendant` = the active option id, `aria-autocomplete="list"`, placeholder `find.open`, autofocus via a ref callback) with a 200 ms debounce for the client search (`useQuery({ queryKey: ['appointments', 'find-clients', debounced], queryFn: () => appointmentsApi.searchClients(debounced).then(r => r.clients), enabled: debounced.trim().length >= 2, staleTime: 30_000 })`); the debounce sets state from a `setTimeout` callback (never synchronously in an effect body);
- appointments from `useQueryClient().getQueriesData<CalendarPayload>({ queryKey: ['appointments', 'calendar'] })`, flattened;
- `<ul id="find-list" role="listbox">` with a `role="group"` (`aria-label` = group title) per group and `role="option"` items (`id="find-opt-<item id>"`, `aria-selected` for the active one), each a row with an icon by kind (lucide `Plus`/`ArrowRight` for actions, `CalendarDays` for appointments, `User` for clients, `Search` for search-all), label and sub;
- keys on the input: ArrowDown/ArrowUp move the active item (wrapping), Enter runs it (`onRun(item.go); onClose()`), Escape closes; clicking an option runs it;
- `<p role="status" aria-live="polite" className="sr-only">` with `find.count` (or `find.none` when the query has no results); while clients load, a muted `find.searching` line;
- a footer with `kbd` hints: ↑ ↓ `find.hint_move` · Enter `find.hint_open` · Esc `find.hint_close`;
- on close, focus returns to the element that was focused before opening (keep it in a ref on open).

`AppointmentsShell.tsx`:
- replace the `<form role="search">` with `<button type="button" onClick={() => setFindOpen(true)} className="flex min-w-0 flex-1 max-w-md lg:ml-4 items-center gap-2 rounded-xl border border-a-border bg-a-surface px-3 py-2 text-left text-sm text-a-text-2 shadow-a-sm hover:border-a-text-2/40">` with a `Search` icon, the `find.open` text (`truncate`, `hidden sm:inline`), and `<kbd className="ml-auto hidden sm:inline rounded-md border border-a-border px-1.5 font-a-mono text-xs">{modKey} K</kbd>` where `modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'` (guard `typeof navigator`); on phones it shows only the icon with an `aria-label` = `find.open`;
- the actions list for Find: New appointment (`/appointments?new=1`), Go to Calendar / Clients / (Takings, Insights when `can_manage`) / Setup (`sub` = `find.go_to`), Time off (`/appointments/setup?tab=team` for managers, `/appointments/setup` for others), Switch to dark/light (`{ run: 'theme' }`, label by `look.resolved`), Collapse/Expand menu (`{ run: 'rail' }`, only ≥ 1024 px — omit on narrow), Keyboard shortcuts (`{ run: 'shortcuts' }` — wired in Task 7; until then it is not in the list);
- `onRun`: `{ to }` → `navigate(to)`; `theme` → `look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')`; `rail` → `look.setRail(look.rail === 'slim' ? 'full' : 'slim')`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass (update only shell assertions about the old search form; list them); `npx tsc -b`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Find — clients, appointments and actions in one box" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Keyboard shortcuts and the "?" sheet

**Files:**
- Create: `frontend/src/appointments/lib/shortcuts.ts` (+ `lib/shortcuts.test.ts`), `frontend/src/appointments/ui/ShortcutsSheet.tsx` (+ `ui/shortcutsSheet.test.tsx`)
- Modify: `frontend/src/appointments/AppointmentsShell.tsx`, `frontend/src/appointments/calendar/CalendarPage.tsx`, `frontend/src/appointments/find/FindDialog.tsx` (the shortcuts action + footer), i18n ×5

**Interfaces:**
- Consumes: Task 6 `FindDialog`, `findOpen`; calendar state setters.
- Produces: `type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'day' | 'week' | 'list'`; `shortcutFor(e: KeyLike, env: { modal: boolean }): Shortcut | null`; `isTyping(target)`, `inDialog(target)`, `modalOpen(doc)`; `<ShortcutsSheet open onClose modKey />`.

- [ ] **Step 1: Words**

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| shortcuts.title | Keyboard shortcuts | Tastenkürzel | Atajos de teclado | Raccourcis clavier | Горячие клавиши |
| shortcuts.find | Find | Suchen | Buscar | Rechercher | Поиск |
| shortcuts.days | Previous or next day (week in the week view) | Vorheriger oder nächster Tag (Woche in der Wochenansicht) | Día anterior o siguiente (semana en la vista semanal) | Jour précédent ou suivant (semaine en vue semaine) | Предыдущий или следующий день (неделя в режиме недели) |
| shortcuts.views | Day, week, list | Tag, Woche, Liste | Día, semana, lista | Jour, semaine, liste | День, неделя, список |
| shortcuts.close | Close the panel | Bereich schließen | Cerrar el panel | Fermer le panneau | Закрыть панель |
| shortcuts.card | Move a selected appointment | Ausgewählten Termin verschieben | Mover la cita seleccionada | Déplacer le rendez-vous sélectionné | Переместить выбранную запись |
| shortcuts.help | This list | Diese Liste | Esta lista | Cette liste | Этот список |
| shortcuts.or | or | oder | o | ou | или |

("New appointment" and "Today" reuse `shell.new_appointment` and `calendar.today`.)

- [ ] **Step 2: Write the failing tests**

`lib/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shortcutFor, type KeyLike } from './shortcuts'

const el = (tag: string, opts: { type?: string; editable?: boolean; role?: string; inDialog?: boolean; stop?: boolean } = {}) => ({
  tagName: tag.toUpperCase(), isContentEditable: !!opts.editable,
  getAttribute: (n: string) => (n === 'type' ? opts.type ?? null : n === 'role' ? opts.role ?? null : null),
  closest: (sel: string) => ((sel.includes('dialog') && opts.inDialog) || (sel.includes('data-stop') && opts.stop) ? {} : null),
}) as unknown as EventTarget
const key = (k: string, target = el('body'), mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target, ...mods })
const free = { modal: false }

describe('shortcuts', () => {
  it('maps the keys on the page', () => {
    expect(shortcutFor(key('n'), free)).toBe('new')
    expect(shortcutFor(key('T'), free)).toBe('today')
    expect(shortcutFor(key('ArrowLeft'), free)).toBe('prev')
    expect(shortcutFor(key('ArrowRight'), free)).toBe('next')
    expect(shortcutFor(key('d'), free)).toBe('day')
    expect(shortcutFor(key('w'), free)).toBe('week')
    expect(shortcutFor(key('l'), free)).toBe('list')
    expect(shortcutFor(key('/'), free)).toBe('find')
    expect(shortcutFor(key('?'), free)).toBe('help')
    expect(shortcutFor(key('k', el('body'), { ctrlKey: true }), free)).toBe('find')
    expect(shortcutFor(key('k', el('body'), { metaKey: true }), free)).toBe('find')
  })

  it('lets people type: only Ctrl/⌘ K works in a field', () => {
    for (const target of [el('input', { type: 'text' }), el('textarea'), el('select'), el('div', { editable: true }), el('div', { role: 'combobox' })]) {
      for (const k of ['n', 't', 'd', 'w', 'l', '/', '?', 'ArrowLeft']) expect(shortcutFor(key(k, target), free)).toBeNull()
      expect(shortcutFor(key('k', target, { ctrlKey: true }), free)).toBe('find')
    }
    expect(shortcutFor(key('n', el('input', { type: 'checkbox' })), free)).toBe('new')
  })

  it('stays out of dialogs, modals, modified keys and the grid\'s own arrows', () => {
    expect(shortcutFor(key('n', el('button', { inDialog: true })), free)).toBeNull()
    expect(shortcutFor(key('n'), { modal: true })).toBeNull()
    expect(shortcutFor(key('k', el('body'), { ctrlKey: true }), { modal: true })).toBeNull()
    expect(shortcutFor(key('n', el('body'), { ctrlKey: true }), free)).toBeNull()
    expect(shortcutFor(key('n', el('body'), { altKey: true }), free)).toBeNull()
    expect(shortcutFor(key('ArrowLeft', el('button', { stop: true })), free)).toBeNull()
    expect(shortcutFor(key('t', el('button', { stop: true })), free)).toBe('today')
    expect(shortcutFor({ ...key('n'), defaultPrevented: true }, free)).toBeNull()
  })
})
```

`ui/shortcutsSheet.test.tsx`: when open, a modal dialog named "Keyboard shortcuts" lists every row (Find with "Ctrl K" or "/", New appointment N, Today T, ← →, D W L, Esc, arrow keys on a selected appointment, ?), each key in a `kbd`; closed renders nothing.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/lib/shortcuts.test.ts src/appointments/ui`
Expected: FAIL.

- [ ] **Step 4: Implement `lib/shortcuts.ts`**

```ts
/**
 * Keyboard shortcuts (spec §5.2). Only Ctrl/⌘ K works while typing; every
 * other key waits until focus is out of fields and dialogs and no modal is
 * open; ← → on a focused grid stop belong to the grid's own moves.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'day' | 'week' | 'list'
export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null; defaultPrevented?: boolean }

interface ElementLike { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null; closest?: (s: string) => unknown }

const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']

export function isTyping(target: EventTarget | null): boolean {
  const el = target as ElementLike | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NOT_TEXT.includes((el.getAttribute?.('type') ?? 'text').toLowerCase())
  if (el.isContentEditable) return true
  const role = el.getAttribute?.('role')
  return role === 'textbox' || role === 'combobox' || role === 'searchbox'
}

export function inDialog(target: EventTarget | null): boolean {
  return Boolean((target as ElementLike | null)?.closest?.('[role="dialog"], [role="alertdialog"]'))
}

export function modalOpen(doc: { querySelector: (s: string) => unknown } | undefined): boolean {
  return Boolean(doc?.querySelector('[aria-modal="true"]'))
}

const PLAIN: Record<string, Shortcut> = { n: 'new', t: 'today', d: 'day', w: 'week', l: 'list', '/': 'find', '?': 'help', ArrowLeft: 'prev', ArrowRight: 'next' }

export function shortcutFor(e: KeyLike, env: { modal: boolean }): Shortcut | null {
  if (e.defaultPrevented || env.modal) return null
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') return 'find'
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (isTyping(e.target) || inDialog(e.target)) return null
  const name = e.key.length === 1 ? (e.key === '?' || e.key === '/' ? e.key : e.key.toLowerCase()) : e.key
  const hit = PLAIN[name]
  if (!hit) return null
  if ((hit === 'prev' || hit === 'next') && (e.target as ElementLike | null)?.closest?.('[data-stop]')) return null
  return hit
}
```

(Note the test fixtures' `closest` matches any selector containing "dialog" or "data-stop"; keep the real selectors as written.)

- [ ] **Step 5: Implement the sheet and wire the listeners**

`ui/ShortcutsSheet.tsx`: when `open`, a scrim button + `role="dialog" aria-modal="true" aria-label={t('appointments.shortcuts.title', 'Keyboard shortcuts')}` panel (`animate-a-pop`, `rounded-2xl`, `shadow-a-lg`), a `dl` of rows, each key in `<kbd className="rounded-md border border-a-border px-1.5 font-a-mono text-xs">`, a Close button that takes focus on open and returns focus on close; Escape closes.

`AppointmentsShell.tsx`: state `helpOpen`; a window `keydown` listener (in `useEffect`, cleaned up) → `const hit = shortcutFor(e, { modal: modalOpen(document) })`; `find` → `e.preventDefault(); setFindOpen(true)`; `help` → `e.preventDefault(); setHelpOpen(true)`; `new` → `e.preventDefault(); navigate('/appointments?new=1')`. Render `<ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} />`. Add the Find action "Keyboard shortcuts" (`{ run: 'shortcuts' }` → `setHelpOpen(true)`), and the Find footer shows "? `shortcuts.help`".

`CalendarPage.tsx`: a window `keydown` listener → `today` → `setDate(now.date)`; `prev`/`next` → `setDate(shift(view, date, ∓1))`; `day`/`week`/`list` → `setPrefs({ ...prefs, view })` unless `narrow` (the list is the only view there); each with `e.preventDefault()`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/appointments` — all pass; `npx tsc -b`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: keyboard shortcuts and a list of them behind ?" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Look at it — browser pass and fixes

**Files:** whatever the pass finds.

- [ ] **Step 1: Full checks** — `cd frontend && npx tsc -b && npx vitest run` (3 plannerMeta only); `artisan test tests/Feature/Appointments/`, `tests/Unit/Appointments/` (read the `Tests:` lines).
- [ ] **Step 2: Local servers and data** — the local database is 7 migrations behind main (Parts D/E…): run this branch's NEW migration and any pending ones the panel needs with `artisan migrate --path=<file>` one by one, record each and roll back exactly those at the end (`migrate:rollback --step=1` after checking the batch holds only them). Servers: `artisan serve --no-reload --port=8012` (with `CORS_ALLOWED_ORIGINS=http://localhost:5173` in the shell env) and `cd frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173`. Sign in to org 16 as manager 13233 with a temporary Sanctum token put into the `loyalty-auth` store (as in release 1's browser pass); delete it at the end. Never write tokens or credentials anywhere.
- [ ] **Step 3: Look** (1440 and 390, light and dark, Русский once): team colours on columns, cards and chips (and the Setup picker: choose, save, back to automatic — restore the row after); team chips hide/show and survive a reload; the Today strip as a manager and as a staff member (staff user 13239 `setup-staff@example.test` with its own temporary token); hover preview (rest, keyboard focus, Escape, near the right edge and the bottom, while dragging none); Find (Ctrl K and "/", typing a client, an appointment, an action, theme switch, collapse, search-all, Escape returns focus); shortcuts (N, T, ← →, D W L, ?) and that none fire while typing in a field or inside the panel; keyboard-only; reduced motion; axe in both themes.
- [ ] **Step 4: Fix and record** — fix defects test-first; judgement calls that would change the approved design go to the controller; write the record (screens, issues, fixes, DB changes and undo, token deleted, servers stopped) to the plan's workspace.
- [ ] **Step 5: Commit** each fix with a clear subject.

---

### Task 9: Deploy release 2 (controller)

- [ ] Worktree from `origin/main` on `deploy/appointments-atelier-r2`; copy `.env` + `frontend/.env`; robocopy `vendor`; junction `frontend/node_modules`.
- [ ] File list = `git diff --name-only origin/main...feature/appointments-atelier`; parity check (each file on main equals the merge-base version — main must still be `dd5b9ddfe` or later with no change to these files); `git checkout feature/appointments-atelier -- <files>`; confirm exactly ONE migration file is new (`2026_10_12_100000_add_color_to_service_masters_table.php`); commit the source.
- [ ] On the artifact: `artisan test tests/Feature/Appointments/`, `tests/Unit/Appointments/`, `tests/Feature/Settings/`; `npx tsc -b && npx vitest run`.
- [ ] `npm run build`; compare CSS with live (only workspace rules and new utilities); commit the build.
- [ ] `git push origin deploy/appointments-atelier-r2:main` (owner: "lets proceed and deploy", 2026-10-12, both releases). Cloud runs `migrate --force` (additive, nullable column).
- [ ] Verify by content: the AppointmentsApp chunk has the Find strings and `card-preview-`; `GET /api/v1/admin/appointments/calendar` and `/setup` answer 401 unauthenticated (alive); the full admin index loads. The column itself is proven when the owner opens the calendar (a missing column would 500 the calendar) — tell the owner to open it once right after the deploy.
- [ ] `cmd /c rmdir` the junction, `git worktree remove`, ledger + memory.
