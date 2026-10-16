# HexaTech Content — Release 4a, Plan 1: the Server for Key Dates, Ideas and Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server half of release 4a "plan and create" (spec §3–§5, §9): built-in holidays and special days for nine countries, the brand's events and notes, key dates on the Plan and in the AI's context, the Ideas board's endpoint, and templates with AI suggestions and "write with AI from a template".

**Architecture:**
- **Built-in days** are pure PHP in `app/Services/Content/Days/`: `DayMath` (Easter and weekday arithmetic), `PublicHolidays` (each country's rule table with substitute and observed days), `SpecialDays` (marketing days by country, industry days), `DayNames` (the English names the AI reads), `BuiltInDays` (one range, merged and sorted), `HolidayCountry` (the brand's choice, else a guess from the organisation's country or the venue's time zone). No library, no data files.
- **The brand's own data** gets two tables beside the snippets (`content_planner_key_dates`, `content_planner_templates`) and two profile columns (`holiday_country`, `marketing_days`) — three additive migrations. New endpoints sit in the existing Content route group behind its gate and brand pin.
- Every new AI call lives in a small non-final service so tests can mock it. Plan 4A-2 builds the portal on these endpoints, runs the release checks and deploys. Nothing is deployed by this plan.

**Tech Stack:** Laravel 13 on PHP 8.4.20 (tests on SQLite in memory, production PostgreSQL), PHPUnit through `artisan test`, Mockery.

**Spec:** `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (approved 2026-10-16). Earlier specs, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`, `docs/superpowers/specs/2026-10-15-content-release-3-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `8a0e9e61a` (the release-4 spec). Production is release 3: prod main `7b4b96191` = the source of feature tip `d11056743` + a build.

## Global Constraints

- **Branch:** never push the feature branch; never commit built `frontend/dist`, `public/spa` or `resources/spa-shell`. This plan pushes nothing and changes no frontend file.
- **Ledger and tools:** `.superpowers/sdd/2026-10-16-content-release-4a-1/`, called `$R4` below. Set it up in Task 1, Step 1.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by path, in the foreground, through `$R4/php.sh <paths…>` (prints `<path> | <Tests: line> | exit <code>` per path and exits 1 when any failed). Never a bare `php artisan test`.
- **Migrations:** additive and SQLite-safe (plain `Schema::table` / `Schema::create`; no `->change()`, no PostgreSQL-only SQL), guarded with `Schema::hasColumn` / `Schema::hasTable` like `database/migrations/2026_10_15_100100_create_content_planner_snippets_table.php`. Tests build the planner tables by requiring the real migrations in `tests/Concerns/SetsUpContentSchema.php` (lines 82–90): every new migration gets its own guarded `require … ->up()` line there.
- **Tenancy:** the two new tables carry `organization_id`, `brand_id` and `planner_profile_id` and their models use `BelongsToOrganization, BelongsToBrand`, exactly as `content_planner_snippets` / `ContentPlannerSnippet` do (spec §9.1 names only the profile; the snippet pattern is the codebase's rule for tenant data — recorded in the ledger as a ruling in Task 4).
- **AI:** every new AI call lives in a small non-final service (`AiClient` is `final`; its SDK path cannot be faked by `Http::fake`); tests bind a Mockery mock with `$this->app->instance(...)`. Every AI action calls `ContentAiGate::allow($org)` first; `AiClient` counts it as feature `content`.
- **No facade mocks** (`Cache::shouldReceive`, `Queue::shouldReceive` …): they have broken full runs before.
- **Refusals:** `ContentRefused($code, $sentence, $status)` with our own sentence; validation errors through Laravel's validator (422 with `errors`). Codes added by this plan: `too_many_key_dates`, `too_many_templates`; `not_found` and `manager_only` / `no_profile` / `ai_failed` / `ai_budget_used_up` as today.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes (PHP namespaces!) with the Write or Edit tool, never through a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A Plan range across New Year:** the month view of January 2028 starts on 27 December 2027 — the United States' New Year's Day observed on Friday 31 December 2027 and the United Kingdom's substitute on Monday 3 January 2028 both show; no day shows twice.
   - Pinned by Task 5's `test_a_range_across_new_year_brings_the_observed_and_substitute_days`.
2. **"None" against "never chosen":** a brand set to *None* sees no public holiday even when the venue's time zone would guess one; a brand that never chose gets the guess; the marketing switch off hides marketing and industry days but keeps public holidays.
   - Pinned by Task 5's `test_none_means_no_holidays_never_chosen_means_the_guess_and_the_switch_hides_special_days`.
3. **An event across the range's edges:** an event from 28 September to 8 October shows in the week of 5–11 October; a note on 12 October does not; another brand's event never does.
   - Pinned by Task 5's `test_events_that_overlap_the_range_and_notes_on_its_days_show`.
4. **Other brands on every new endpoint:** another brand's key date or template on PUT/DELETE answers 404; another brand's template cannot steer "write with AI" (404, no AI call).
   - Pinned by Tasks 4, 8 and 10.
5. **Notes stay out of the AI:** Generate, Fill with AI and Write the text are told holidays, special days and events (with details), never a note.
   - Pinned by Task 6's tests.

---

## File map

- **Task 1 (public holidays):** `app/Services/Content/Days/{DayMath,PublicHolidays,DayNames,BuiltInDays}.php`; tests `tests/Unit/Content/PublicHolidaysTest.php`.
- **Task 2 (special days):** `app/Services/Content/Days/SpecialDays.php`, `BuiltInDays.php`, `DayNames.php`; tests `tests/Unit/Content/SpecialDaysTest.php`.
- **Task 3 (holiday country):** migration `database/migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php`, `app/Services/Content/Days/HolidayCountry.php`, `app/Models/ContentPlannerProfile.php`, `app/Services/Content/ContentRules.php`, `app/Services/Content/ContentBrandEditor.php`, `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php`, `tests/Concerns/SetsUpContentSchema.php`; tests `tests/Feature/Content/HolidayCountryTest.php`.
- **Task 4 (events and notes):** migration `database/migrations/2026_10_16_100100_create_content_planner_key_dates_table.php`, `app/Models/ContentPlannerKeyDate.php`, `app/Models/ContentPlannerProfile.php`, `ContentRules.php`, `app/Services/Content/ContentKeyDates.php`, `app/Http/Controllers/Api/V1/Admin/Content/KeyDateController.php`, `routes/api.php`, `SetsUpContentSchema.php`; tests `tests/Feature/Content/KeyDatesTest.php`.
- **Task 5 (the Plan's key dates):** `ContentKeyDates.php`, `PlanController.php`; tests `tests/Feature/Content/PlanKeyDatesTest.php`.
- **Task 6 (key dates for the AI):** `ContentKeyDates.php`, `app/Services/ContentCalendarGenerationService.php`, `app/Services/ContentPostGenerationService.php`; tests `tests/Feature/Content/KeyDatesAiTest.php`.
- **Task 7 (ideas):** `app/Services/Content/ContentIdeas.php`, `app/Http/Controllers/Api/V1/Admin/Content/IdeasController.php`, `routes/api.php`; tests `tests/Feature/Content/IdeasTest.php`.
- **Task 8 (templates):** migration `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php`, `app/Models/ContentPlannerTemplate.php`, `ContentPlannerProfile.php`, `ContentRules.php`, `app/Services/Content/ContentTemplates.php`, `app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php`, `BrandController.php`, `routes/api.php`, `SetsUpContentSchema.php`; tests `tests/Feature/Content/TemplatesTest.php`, `tests/Feature/Content/ContentGateTest.php`.
- **Task 9 (template suggestions):** `app/Services/Content/ContentTemplateSuggester.php`, `TemplateController.php`, `routes/api.php`; tests `TemplatesTest.php`, `tests/Unit/Content/TemplateSuggesterCleanTest.php`, `ContentGateTest.php`.
- **Task 10 (write with a template):** `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php`, `ContentPostGenerationService.php`; tests `tests/Feature/Content/PostAiTest.php`, `tests/Feature/Content/TemplatePromptTest.php`.
- **Task 11 (runbook and regression):** `docs/content-workspace.md`.

---

### Task 1: Public holidays for nine countries (spec §3.2, Appendix A)

**Files:**
- Create: `app/Services/Content/Days/DayMath.php`, `app/Services/Content/Days/PublicHolidays.php`, `app/Services/Content/Days/DayNames.php`, `app/Services/Content/Days/BuiltInDays.php`
- Test: `tests/Unit/Content/PublicHolidaysTest.php`

**Interfaces:**
- Produces:
  - `DayMath::easter(int $year): string` (`Y-m-d`), `DayMath::add(string $day, int $n): string`, `DayMath::weekday(string $day): int` (1 = Monday … 7 = Sunday), `DayMath::isWeekend(string $day): bool`, `DayMath::nth(int $year, int $month, int $weekday, int $n): string`, `DayMath::last(int $year, int $month, int $weekday): string`, `DayMath::on(array $rule, int $year): string` (rules: `['fixed', m, d]`, `['easter', offset]`, `['nth', m, weekday, n]`, `['last', m, weekday]`, `['brigid']`, `['fr_mothers']`, `['black_friday']`).
  - `PublicHolidays::COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'LV', 'LT', 'EE', 'US']`; `PublicHolidays::for(string $country, int $year): list<array{id: string, date: string, substitute: bool}>`; `PublicHolidays::ids(): list<string>`.
  - `DayNames::EN` (id → English name), `DayNames::en(string $id): string`.
  - `BuiltInDays::between(?string $country, bool $marketing, ?string $industry, string $from, string $to): list<array{id: string, kind: string, date: string, substitute: bool, name_en: string}>` — `kind` is `holiday`, `marketing` or `industry`. Task 1 builds it for holidays; Task 2 adds the special days.

- [ ] **Step 1: Set up the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R4=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-16-content-release-4a-1.md)
cp .superpowers/sdd/archive/2026-10-15-content-release-3b/php.sh "$R4/php.sh" && chmod +x "$R4/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-16-content-release-4a-1.md" > "$R4/progress.md"
echo "$R4"; head -4 "$R4/php.sh"
```

Expected: `$R4` ends in `.superpowers/sdd/2026-10-16-content-release-4a-1`; `php.sh`'s fourth line is `cd /c/wamp64/www/Hexa-Tech-content || exit 1`.

- [ ] **Step 2: Write the failing test**

Write `tests/Unit/Content/PublicHolidaysTest.php` with the Write tool. Each year's list is the official one (GOV.UK, citizensinformation.ie, the national calendars, OPM for the United States) in the plan's notation: `date id`, a trailing `*` for a substitute or observed day.

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\DayMath;
use App\Services\Content\Days\DayNames;
use App\Services\Content\Days\PublicHolidays;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Public holidays of the nine countries (spec 2026-10-16 Appendix A), against the official lists for 2026–2028. */
class PublicHolidaysTest extends TestCase
{
    public function test_easter_follows_the_gregorian_computus(): void
    {
        $this->assertSame(
            ['2023-04-09', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2030-04-21'],
            array_map(fn (int $y) => DayMath::easter($y), [2023, 2024, 2025, 2026, 2027, 2028, 2030]),
        );
    }

    #[DataProvider('officialLists')]
    public function test_each_country_matches_its_official_list(string $country, int $year, array $expected): void
    {
        $days = BuiltInDays::between($country, false, null, "{$year}-01-01", "{$year}-12-31");

        $this->assertSame($expected, array_map(fn (array $d) => $d['date'] . ' ' . $d['id'] . ($d['substitute'] ? '*' : ''), $days));
        $this->assertSame(['holiday'], array_values(array_unique(array_column($days, 'kind'))));
    }

    public function test_st_brigids_day_is_the_first_of_february_when_that_is_a_friday(): void
    {
        $brigid = array_values(array_filter(PublicHolidays::for('IE', 2030), fn (array $d) => $d['id'] === 'ie.st_brigid'));

        $this->assertSame('2030-02-01', $brigid[0]['date']);
    }

    public function test_every_holiday_has_an_english_name(): void
    {
        foreach (PublicHolidays::ids() as $id) {
            $this->assertArrayHasKey($id, DayNames::EN, "{$id} has no English name");
        }
        $this->assertSame('Christmas Day', DayNames::en('christmas'));
    }

    public function test_an_unknown_country_has_no_holidays(): void
    {
        $this->assertSame([], PublicHolidays::for('RU', 2026));
        $this->assertSame([], BuiltInDays::between(null, false, null, '2026-01-01', '2026-12-31'));
    }

    /** @return array<string, array{0: string, 1: int, 2: list<string>}> */
    public static function officialLists(): array
    {
        return [
            'GB 2026' => ['GB', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-06 easter_monday', '2026-05-04 gb.early_may', '2026-05-25 gb.spring', '2026-08-31 gb.summer', '2026-12-25 christmas', '2026-12-26 gb.boxing_day', '2026-12-28 gb.boxing_day*']],
            'GB 2027' => ['GB', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-29 easter_monday', '2027-05-03 gb.early_may', '2027-05-31 gb.spring', '2027-08-30 gb.summer', '2027-12-25 christmas', '2027-12-26 gb.boxing_day', '2027-12-27 christmas*', '2027-12-28 gb.boxing_day*']],
            'GB 2028' => ['GB', 2028, ['2028-01-01 new_year', '2028-01-03 new_year*', '2028-04-14 good_friday', '2028-04-17 easter_monday', '2028-05-01 gb.early_may', '2028-05-29 gb.spring', '2028-08-28 gb.summer', '2028-12-25 christmas', '2028-12-26 gb.boxing_day']],
            'IE 2026' => ['IE', 2026, ['2026-01-01 new_year', '2026-02-02 ie.st_brigid', '2026-03-17 ie.st_patrick', '2026-04-06 easter_monday', '2026-05-04 ie.may', '2026-06-01 ie.june', '2026-08-03 ie.august', '2026-10-26 ie.october', '2026-12-25 christmas', '2026-12-26 ie.st_stephen']],
            'IE 2027' => ['IE', 2027, ['2027-01-01 new_year', '2027-02-01 ie.st_brigid', '2027-03-17 ie.st_patrick', '2027-03-29 easter_monday', '2027-05-03 ie.may', '2027-06-07 ie.june', '2027-08-02 ie.august', '2027-10-25 ie.october', '2027-12-25 christmas', '2027-12-26 ie.st_stephen']],
            'IE 2028' => ['IE', 2028, ['2028-01-01 new_year', '2028-02-07 ie.st_brigid', '2028-03-17 ie.st_patrick', '2028-04-17 easter_monday', '2028-05-01 ie.may', '2028-06-05 ie.june', '2028-08-07 ie.august', '2028-10-30 ie.october', '2028-12-25 christmas', '2028-12-26 ie.st_stephen']],
            'DE 2026' => ['DE', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-14 ascension', '2026-05-25 whit_monday', '2026-10-03 de.unity', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'DE 2027' => ['DE', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-06 ascension', '2027-05-17 whit_monday', '2027-10-03 de.unity', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'DE 2028' => ['DE', 2028, ['2028-01-01 new_year', '2028-04-14 good_friday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-25 ascension', '2028-06-05 whit_monday', '2028-10-03 de.unity', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'FR 2026' => ['FR', 2026, ['2026-01-01 new_year', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-08 fr.victory', '2026-05-14 ascension', '2026-05-25 whit_monday', '2026-07-14 fr.bastille', '2026-08-15 assumption', '2026-11-01 all_saints', '2026-11-11 fr.armistice', '2026-12-25 christmas']],
            'FR 2027' => ['FR', 2027, ['2027-01-01 new_year', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-06 ascension', '2027-05-08 fr.victory', '2027-05-17 whit_monday', '2027-07-14 fr.bastille', '2027-08-15 assumption', '2027-11-01 all_saints', '2027-11-11 fr.armistice', '2027-12-25 christmas']],
            'FR 2028' => ['FR', 2028, ['2028-01-01 new_year', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-08 fr.victory', '2028-05-25 ascension', '2028-06-05 whit_monday', '2028-07-14 fr.bastille', '2028-08-15 assumption', '2028-11-01 all_saints', '2028-11-11 fr.armistice', '2028-12-25 christmas']],
            'ES 2026' => ['ES', 2026, ['2026-01-01 new_year', '2026-01-06 es.epiphany', '2026-04-03 good_friday', '2026-05-01 labour_day', '2026-08-15 assumption', '2026-10-12 es.national', '2026-11-01 all_saints', '2026-12-06 es.constitution', '2026-12-08 es.immaculate', '2026-12-25 christmas']],
            'ES 2027' => ['ES', 2027, ['2027-01-01 new_year', '2027-01-06 es.epiphany', '2027-03-26 good_friday', '2027-05-01 labour_day', '2027-08-15 assumption', '2027-10-12 es.national', '2027-11-01 all_saints', '2027-12-06 es.constitution', '2027-12-08 es.immaculate', '2027-12-25 christmas']],
            'ES 2028' => ['ES', 2028, ['2028-01-01 new_year', '2028-01-06 es.epiphany', '2028-04-14 good_friday', '2028-05-01 labour_day', '2028-08-15 assumption', '2028-10-12 es.national', '2028-11-01 all_saints', '2028-12-06 es.constitution', '2028-12-08 es.immaculate', '2028-12-25 christmas']],
            'LV 2026' => ['LV', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-05 easter_sunday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-04 lv.independence', '2026-05-24 pentecost', '2026-06-23 lv.ligo', '2026-06-24 midsummer', '2026-11-18 lv.proclamation', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second', '2026-12-31 new_years_eve']],
            'LV 2027' => ['LV', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-28 easter_sunday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-04 lv.independence', '2027-05-16 pentecost', '2027-06-23 lv.ligo', '2027-06-24 midsummer', '2027-11-18 lv.proclamation', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second', '2027-12-31 new_years_eve']],
            'LV 2028' => ['LV', 2028, ['2028-01-01 new_year', '2028-04-14 good_friday', '2028-04-16 easter_sunday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-04 lv.independence', '2028-06-04 pentecost', '2028-06-23 lv.ligo', '2028-06-24 midsummer', '2028-11-18 lv.proclamation', '2028-11-20 lv.proclamation*', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second', '2028-12-31 new_years_eve']],
            'LT 2026' => ['LT', 2026, ['2026-01-01 new_year', '2026-02-16 lt.state', '2026-03-11 lt.independence', '2026-04-05 easter_sunday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-03 mothers_day', '2026-06-07 fathers_day', '2026-06-24 lt.st_johns', '2026-07-06 lt.statehood', '2026-08-15 assumption', '2026-11-01 all_saints', '2026-11-02 all_souls', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'LT 2027' => ['LT', 2027, ['2027-01-01 new_year', '2027-02-16 lt.state', '2027-03-11 lt.independence', '2027-03-28 easter_sunday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-02 mothers_day', '2027-06-06 fathers_day', '2027-06-24 lt.st_johns', '2027-07-06 lt.statehood', '2027-08-15 assumption', '2027-11-01 all_saints', '2027-11-02 all_souls', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'LT 2028' => ['LT', 2028, ['2028-01-01 new_year', '2028-02-16 lt.state', '2028-03-11 lt.independence', '2028-04-16 easter_sunday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-07 mothers_day', '2028-06-04 fathers_day', '2028-06-24 lt.st_johns', '2028-07-06 lt.statehood', '2028-08-15 assumption', '2028-11-01 all_saints', '2028-11-02 all_souls', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'EE 2026' => ['EE', 2026, ['2026-01-01 new_year', '2026-02-24 ee.independence', '2026-04-03 good_friday', '2026-04-05 easter_sunday', '2026-05-01 ee.spring_day', '2026-05-24 pentecost', '2026-06-23 ee.victory', '2026-06-24 midsummer', '2026-08-20 ee.restoration', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'EE 2027' => ['EE', 2027, ['2027-01-01 new_year', '2027-02-24 ee.independence', '2027-03-26 good_friday', '2027-03-28 easter_sunday', '2027-05-01 ee.spring_day', '2027-05-16 pentecost', '2027-06-23 ee.victory', '2027-06-24 midsummer', '2027-08-20 ee.restoration', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'EE 2028' => ['EE', 2028, ['2028-01-01 new_year', '2028-02-24 ee.independence', '2028-04-14 good_friday', '2028-04-16 easter_sunday', '2028-05-01 ee.spring_day', '2028-06-04 pentecost', '2028-06-23 ee.victory', '2028-06-24 midsummer', '2028-08-20 ee.restoration', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'US 2026' => ['US', 2026, ['2026-01-01 new_year', '2026-01-19 us.mlk', '2026-02-16 us.washington', '2026-05-25 us.memorial', '2026-06-19 us.juneteenth', '2026-07-03 us.independence*', '2026-07-04 us.independence', '2026-09-07 us.labor', '2026-10-12 us.columbus', '2026-11-11 us.veterans', '2026-11-26 us.thanksgiving', '2026-12-25 christmas']],
            'US 2027' => ['US', 2027, ['2027-01-01 new_year', '2027-01-18 us.mlk', '2027-02-15 us.washington', '2027-05-31 us.memorial', '2027-06-18 us.juneteenth*', '2027-06-19 us.juneteenth', '2027-07-04 us.independence', '2027-07-05 us.independence*', '2027-09-06 us.labor', '2027-10-11 us.columbus', '2027-11-11 us.veterans', '2027-11-25 us.thanksgiving', '2027-12-24 christmas*', '2027-12-25 christmas', '2027-12-31 new_year*']],
            'US 2028' => ['US', 2028, ['2028-01-01 new_year', '2028-01-17 us.mlk', '2028-02-21 us.washington', '2028-05-29 us.memorial', '2028-06-19 us.juneteenth', '2028-07-04 us.independence', '2028-09-04 us.labor', '2028-10-09 us.columbus', '2028-11-10 us.veterans*', '2028-11-11 us.veterans', '2028-11-23 us.thanksgiving', '2028-12-25 christmas']],
        ];
    }
}
```

- [ ] **Step 3: Run it to see it fail**

```bash
"$R4/php.sh" tests/Unit/Content/PublicHolidaysTest.php
```

Expected: `exit 1`, `Class "App\Services\Content\Days\DayMath" not found` (or the same for `BuiltInDays`).

- [ ] **Step 4: Write `DayMath`**

Write `app/Services/Content/Days/DayMath.php` with the Write tool:

```php
<?php

namespace App\Services\Content\Days;

use Carbon\CarbonImmutable;

/**
 * Date arithmetic for the built-in days (spec 2026-10-16 Appendix A) on plain `Y-m-d` strings: Easter, the nth or last
 * weekday of a month, and the rules the tables use. Weekdays are ISO: 1 = Monday … 7 = Sunday.
 */
final class DayMath
{
    /** Easter Sunday of a Gregorian year (the anonymous Gregorian computus); no calendar extension needed. */
    public static function easter(int $year): string
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /** The day `$n` days after (before, when negative) `$day`. */
    public static function add(string $day, int $n): string
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $day, 'UTC')->addDays($n)->format('Y-m-d');
    }

    public static function weekday(string $day): int
    {
        return (int) CarbonImmutable::createFromFormat('!Y-m-d', $day, 'UTC')->format('N');
    }

    public static function isWeekend(string $day): bool
    {
        return self::weekday($day) >= 6;
    }

    /** The `$n`th `$weekday` of a month (`$n` = 1 for the first). */
    public static function nth(int $year, int $month, int $weekday, int $n): string
    {
        $first = sprintf('%04d-%02d-01', $year, $month);

        return self::add($first, (($weekday - self::weekday($first) + 7) % 7) + 7 * ($n - 1));
    }

    /** The last `$weekday` of a month. */
    public static function last(int $year, int $month, int $weekday): string
    {
        $end = CarbonImmutable::create($year, $month, 1, 0, 0, 0, 'UTC')->endOfMonth()->format('Y-m-d');

        return self::add($end, -((self::weekday($end) - $weekday + 7) % 7));
    }

    /** A rule of the tables, for a year. */
    public static function on(array $rule, int $year): string
    {
        return match ($rule[0]) {
            'fixed'  => sprintf('%04d-%02d-%02d', $year, $rule[1], $rule[2]),
            'easter' => self::add(self::easter($year), $rule[1]),
            'nth'    => self::nth($year, $rule[1], $rule[2], $rule[3]),
            'last'   => self::last($year, $rule[1], $rule[2]),
            // Ireland's St Brigid's Day: 1 February when that is a Friday, else the first Monday of February.
            'brigid' => self::weekday(sprintf('%04d-02-01', $year)) === 5 ? sprintf('%04d-02-01', $year) : self::nth($year, 2, 1, 1),
            // France's Mother's Day: the last Sunday of May, or the first Sunday of June when Pentecost falls on it.
            'fr_mothers' => self::last($year, 5, 7) === self::add(self::easter($year), 49) ? self::nth($year, 6, 7, 1) : self::last($year, 5, 7),
            // Black Friday: the day after the fourth Thursday of November.
            'black_friday' => self::add(self::nth($year, 11, 4, 4), 1),
        };
    }
}
```

- [ ] **Step 5: Write `PublicHolidays`**

Write `app/Services/Content/Days/PublicHolidays.php` with the Write tool:

```php
<?php

namespace App\Services\Content\Days;

/**
 * The public holidays of the nine countries (spec 2026-10-16 §3.2, Appendix A) as a rule table, with the substitute
 * days the law sets: in the United Kingdom and Latvia a marked day on a weekend gives the next weekday that is not
 * already a holiday; in the United States a marked day on a Saturday is observed the Friday before, on a Sunday the
 * Monday after (so New Year's Day of one year can be observed on 31 December of the year before).
 */
final class PublicHolidays
{
    public const COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'LV', 'LT', 'EE', 'US'];

    /** How a country moves a marked day that falls on a weekend. */
    private const SUBSTITUTE = ['GB' => 'next_weekday', 'LV' => 'next_weekday', 'US' => 'observed'];

    /** country => list of [id, rule (DayMath::on), moves when on a weekend]. Weekdays: 1 Monday … 7 Sunday. */
    private const RULES = [
        'GB' => [
            ['new_year', ['fixed', 1, 1], true],
            ['good_friday', ['easter', -2], false],
            ['easter_monday', ['easter', 1], false],
            ['gb.early_may', ['nth', 5, 1, 1], false],
            ['gb.spring', ['last', 5, 1], false],
            ['gb.summer', ['last', 8, 1], false],
            ['christmas', ['fixed', 12, 25], true],
            ['gb.boxing_day', ['fixed', 12, 26], true],
        ],
        'IE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['ie.st_brigid', ['brigid'], false],
            ['ie.st_patrick', ['fixed', 3, 17], false],
            ['easter_monday', ['easter', 1], false],
            ['ie.may', ['nth', 5, 1, 1], false],
            ['ie.june', ['nth', 6, 1, 1], false],
            ['ie.august', ['nth', 8, 1, 1], false],
            ['ie.october', ['last', 10, 1], false],
            ['christmas', ['fixed', 12, 25], false],
            ['ie.st_stephen', ['fixed', 12, 26], false],
        ],
        'DE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['good_friday', ['easter', -2], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['ascension', ['easter', 39], false],
            ['whit_monday', ['easter', 50], false],
            ['de.unity', ['fixed', 10, 3], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'FR' => [
            ['new_year', ['fixed', 1, 1], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['fr.victory', ['fixed', 5, 8], false],
            ['ascension', ['easter', 39], false],
            ['whit_monday', ['easter', 50], false],
            ['fr.bastille', ['fixed', 7, 14], false],
            ['assumption', ['fixed', 8, 15], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['fr.armistice', ['fixed', 11, 11], false],
            ['christmas', ['fixed', 12, 25], false],
        ],
        'ES' => [
            ['new_year', ['fixed', 1, 1], false],
            ['es.epiphany', ['fixed', 1, 6], false],
            ['good_friday', ['easter', -2], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['assumption', ['fixed', 8, 15], false],
            ['es.national', ['fixed', 10, 12], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['es.constitution', ['fixed', 12, 6], false],
            ['es.immaculate', ['fixed', 12, 8], false],
            ['christmas', ['fixed', 12, 25], false],
        ],
        'LV' => [
            ['new_year', ['fixed', 1, 1], false],
            ['good_friday', ['easter', -2], false],
            ['easter_sunday', ['easter', 0], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['lv.independence', ['fixed', 5, 4], true],
            ['pentecost', ['easter', 49], false],
            ['lv.ligo', ['fixed', 6, 23], false],
            ['midsummer', ['fixed', 6, 24], false],
            ['lv.proclamation', ['fixed', 11, 18], true],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
            ['new_years_eve', ['fixed', 12, 31], false],
        ],
        'LT' => [
            ['new_year', ['fixed', 1, 1], false],
            ['lt.state', ['fixed', 2, 16], false],
            ['lt.independence', ['fixed', 3, 11], false],
            ['easter_sunday', ['easter', 0], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['mothers_day', ['nth', 5, 7, 1], false],
            ['fathers_day', ['nth', 6, 7, 1], false],
            ['lt.st_johns', ['fixed', 6, 24], false],
            ['lt.statehood', ['fixed', 7, 6], false],
            ['assumption', ['fixed', 8, 15], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['all_souls', ['fixed', 11, 2], false],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'EE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['ee.independence', ['fixed', 2, 24], false],
            ['good_friday', ['easter', -2], false],
            ['easter_sunday', ['easter', 0], false],
            ['ee.spring_day', ['fixed', 5, 1], false],
            ['pentecost', ['easter', 49], false],
            ['ee.victory', ['fixed', 6, 23], false],
            ['midsummer', ['fixed', 6, 24], false],
            ['ee.restoration', ['fixed', 8, 20], false],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'US' => [
            ['new_year', ['fixed', 1, 1], true],
            ['us.mlk', ['nth', 1, 1, 3], false],
            ['us.washington', ['nth', 2, 1, 3], false],
            ['us.memorial', ['last', 5, 1], false],
            ['us.juneteenth', ['fixed', 6, 19], true],
            ['us.independence', ['fixed', 7, 4], true],
            ['us.labor', ['nth', 9, 1, 1], false],
            ['us.columbus', ['nth', 10, 1, 2], false],
            ['us.veterans', ['fixed', 11, 11], true],
            ['us.thanksgiving', ['nth', 11, 4, 4], false],
            ['christmas', ['fixed', 12, 25], true],
        ],
    ];

    /**
     * A country's public holidays by its rules for `$year`, with the substitute or observed days they cause, by date
     * (a day before its substitute). An observed day can fall in the year before (BuiltInDays filters by range).
     *
     * @return list<array{id: string, date: string, substitute: bool}>
     */
    public static function for(string $country, int $year): array
    {
        $days = [];
        foreach (self::RULES[$country] ?? [] as [$id, $rule, $moves]) {
            $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year), 'substitute' => false, 'moves' => $moves];
        }
        usort($days, fn (array $a, array $b) => strcmp($a['date'], $b['date']));

        $style = self::SUBSTITUTE[$country] ?? null;
        // A weekday that is already a holiday is never a substitute day.
        $taken = [];
        foreach ($days as $day) {
            if (!DayMath::isWeekend($day['date'])) {
                $taken[$day['date']] = true;
            }
        }
        $out = array_map(fn (array $d) => ['id' => $d['id'], 'date' => $d['date'], 'substitute' => false], $days);
        foreach ($days as $day) {
            if ($style === null || !$day['moves'] || !DayMath::isWeekend($day['date'])) {
                continue;
            }
            if ($style === 'observed') {
                $date = DayMath::add($day['date'], DayMath::weekday($day['date']) === 6 ? -1 : 1);
            } else {
                $date = DayMath::add($day['date'], 1);
                while (DayMath::isWeekend($date) || isset($taken[$date])) {
                    $date = DayMath::add($date, 1);
                }
                $taken[$date] = true;
            }
            $out[] = ['id' => $day['id'], 'date' => $date, 'substitute' => true];
        }
        usort($out, fn (array $a, array $b) => [$a['date'], $a['substitute']] <=> [$b['date'], $b['substitute']]);

        return $out;
    }

    /** Every id the table uses (DayNames must name each). @return list<string> */
    public static function ids(): array
    {
        $ids = [];
        foreach (self::RULES as $rules) {
            foreach ($rules as [$id]) {
                $ids[$id] = true;
            }
        }

        return array_keys($ids);
    }
}
```

- [ ] **Step 6: Write `DayNames` (every name, the special days' too) and `BuiltInDays` (holidays first)**

Write `app/Services/Content/Days/DayNames.php` with the Write tool. It names every built-in day at once, so Task 2 only adds rules:

```php
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
```

Write `app/Services/Content/Days/BuiltInDays.php` with the Write tool:

```php
<?php

namespace App\Services\Content\Days;

/**
 * The built-in days of a range (spec 2026-10-16 §3.2): the holiday country's public holidays (with substitute and
 * observed days), and — while the brand's switch is on — the marketing days and the organisation's industry days.
 */
final class BuiltInDays
{
    private const KIND_ORDER = ['holiday' => 0, 'marketing' => 1, 'industry' => 2];

    /** @return list<array{id: string, kind: string, date: string, substitute: bool, name_en: string}> */
    public static function between(?string $country, bool $marketing, ?string $industry, string $from, string $to): array
    {
        $days = [];
        // A day observed on 31 December comes from the next year's rules.
        for ($year = (int) substr($from, 0, 4); $year <= (int) substr($to, 0, 4) + 1; $year++) {
            if ($country !== null) {
                foreach (PublicHolidays::for($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'holiday'];
                }
            }
        }
        $days = array_values(array_filter($days, fn (array $d) => $d['date'] >= $from && $d['date'] <= $to));
        usort($days, fn (array $a, array $b) => [$a['date'], self::KIND_ORDER[$a['kind']], $a['substitute'], $a['id']]
            <=> [$b['date'], self::KIND_ORDER[$b['kind']], $b['substitute'], $b['id']]);

        return array_map(fn (array $d) => [
            'id' => $d['id'], 'kind' => $d['kind'], 'date' => $d['date'], 'substitute' => $d['substitute'], 'name_en' => DayNames::en($d['id']),
        ], $days);
    }
}
```

- [ ] **Step 7: Run the test to see it pass**

```bash
"$R4/php.sh" tests/Unit/Content/PublicHolidaysTest.php
```

Expected: `Tests:    31 passed` (27 country-years + 4) and `exit 0`. A country-year that fails prints its two lists: find the rule in `PublicHolidays::RULES` or `DayMath::on`, never edit the expected list (it is the official one).

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/Days tests/Unit/Content/PublicHolidaysTest.php && git commit -q -m "Content days: public holidays of nine countries from our own rule table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Marketing and industry days (spec §3.2, Appendix B)

**Files:**
- Create: `app/Services/Content/Days/SpecialDays.php`
- Modify: `app/Services/Content/Days/BuiltInDays.php`
- Test: `tests/Unit/Content/SpecialDaysTest.php`

**Interfaces:**
- Consumes: `DayMath::on`, `PublicHolidays::ids`, `DayNames::EN`, `BuiltInDays::between` (Task 1).
- Produces: `SpecialDays::marketing(?string $country, int $year): list<array{id: string, date: string}>`; `SpecialDays::industry(?string $industry, int $year): list<array{id: string, date: string}>`; `SpecialDays::ids(): list<string>`; `BuiltInDays::between` now adds the special days while `$marketing` is true (kinds `marketing`, `industry`).

- [ ] **Step 1: Write the failing test**

Write `tests/Unit/Content/SpecialDaysTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\DayNames;
use App\Services\Content\Days\PublicHolidays;
use App\Services\Content\Days\SpecialDays;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Marketing days by country and international days by industry (spec 2026-10-16 Appendix B). */
class SpecialDaysTest extends TestCase
{
    #[DataProvider('marketing2026')]
    public function test_marketing_days_follow_the_country(?string $country, array $expected): void
    {
        $this->assertSame($expected, self::lines(SpecialDays::marketing($country, 2026)));
    }

    public function test_mothers_and_fathers_day_in_other_years(): void
    {
        $day = fn (?string $country, int $year, string $id) => array_values(array_filter(SpecialDays::marketing($country, $year), fn (array $d) => $d['id'] === $id))[0]['date'] ?? null;

        // France: Pentecost fell on the last Sunday of May 2023, so Mother's Day moved to the first Sunday of June.
        $this->assertSame('2023-06-04', $day('FR', 2023, 'mothers_day'));
        $this->assertSame('2027-05-30', $day('FR', 2027, 'mothers_day'));
        $this->assertSame('2027-03-07', $day('GB', 2027, 'mothers_day'));
        $this->assertSame('2028-03-26', $day('IE', 2028, 'mothers_day'));
        $this->assertSame('2028-05-14', $day('US', 2028, 'mothers_day'));
        $this->assertSame('2028-05-07', $day('ES', 2028, 'mothers_day'));
        $this->assertSame('2028-09-10', $day('LV', 2028, 'fathers_day'));
        $this->assertSame('2027-11-14', $day('EE', 2027, 'fathers_day'));
        $this->assertSame('2027-11-26', $day('DE', 2027, 'black_friday'));
        $this->assertSame('2028-11-24', $day(null, 2028, 'black_friday'));
        $this->assertNull($day('DE', 2026, 'fathers_day'));
        $this->assertNull($day('LT', 2026, 'mothers_day'));
    }

    #[DataProvider('industries2026')]
    public function test_industry_days_follow_the_industry(?string $industry, array $expected): void
    {
        $this->assertSame($expected, self::lines(SpecialDays::industry($industry, 2026)));
    }

    public function test_weekday_rules_in_later_years(): void
    {
        $this->assertSame(['2027-06-02 global_running', '2027-06-12 global_wellness'], array_values(array_filter(self::lines(SpecialDays::industry('fitness', 2027)), fn (string $l) => str_contains($l, 'global'))));
        $this->assertSame(['2028-10-02 world_habitat'], self::lines(SpecialDays::industry('real_estate', 2028)));
    }

    public function test_the_range_adds_special_days_only_while_the_switch_is_on(): void
    {
        $on = BuiltInDays::between('GB', true, 'beauty', '2026-12-20', '2026-12-31');
        $this->assertSame(
            ['2026-12-24 christmas_eve marketing', '2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday', '2026-12-28 gb.boxing_day holiday', '2026-12-31 new_years_eve marketing'],
            array_map(fn (array $d) => "{$d['date']} {$d['id']} {$d['kind']}", $on),
        );
        $this->assertSame("New Year's Eve", $on[4]['name_en']);

        $off = BuiltInDays::between('GB', false, 'beauty', '2026-12-20', '2026-12-31');
        $this->assertSame(['holiday'], array_values(array_unique(array_column($off, 'kind'))));
        $this->assertSame(['2026-06-13 global_wellness industry', '2026-06-21 yoga industry'], array_map(fn (array $d) => "{$d['date']} {$d['id']} {$d['kind']}", BuiltInDays::between(null, true, 'beauty', '2026-06-08', '2026-06-21')));
    }

    public function test_every_id_has_an_english_name_and_no_name_is_spare(): void
    {
        $ids = array_values(array_unique(array_merge(PublicHolidays::ids(), SpecialDays::ids())));
        sort($ids);
        $named = array_keys(DayNames::EN);
        sort($named);

        $this->assertSame($named, $ids);
    }

    /** @param list<array{id: string, date: string}> $days @return list<string> */
    private static function lines(array $days): array
    {
        return array_map(fn (array $d) => "{$d['date']} {$d['id']}", $days);
    }

    /** @return array<string, array{0: ?string, 1: list<string>}> */
    public static function marketing2026(): array
    {
        $everywhere = ['2026-02-14 valentines', '2026-03-08 womens_day'];

        return [
            'GB' => ['GB', [...$everywhere, '2026-03-15 mothers_day', '2026-04-05 easter_sunday', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'IE' => ['IE', [...$everywhere, '2026-03-15 mothers_day', '2026-04-05 easter_sunday', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'US' => ['US', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-10 mothers_day', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'DE' => ['DE', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-10 mothers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'FR' => ['FR', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-31 mothers_day', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'ES' => ['ES', [...$everywhere, '2026-03-19 fathers_day', '2026-04-05 easter_sunday', '2026-05-03 mothers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'LV' => ['LV', [...$everywhere, '2026-05-10 mothers_day', '2026-09-13 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday']],
            'LT' => ['LT', [...$everywhere, '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-31 new_years_eve']],
            'EE' => ['EE', [...$everywhere, '2026-05-10 mothers_day', '2026-10-31 halloween', '2026-11-08 fathers_day', '2026-11-27 black_friday', '2026-12-31 new_years_eve']],
            'no country' => [null, [...$everywhere, '2026-04-05 easter_sunday', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
        ];
    }

    /** @return array<string, array{0: ?string, 1: list<string>}> */
    public static function industries2026(): array
    {
        return [
            'medical' => ['medical', ['2026-04-07 world_health', '2026-09-29 world_heart', '2026-10-10 world_mental_health']],
            'fitness' => ['fitness', ['2026-04-07 world_health', '2026-06-03 global_running', '2026-06-13 global_wellness', '2026-06-21 yoga', '2026-09-29 world_heart']],
            'beauty' => ['beauty', ['2026-06-13 global_wellness', '2026-06-21 yoga']],
            'hotel' => ['hotel', ['2026-06-13 global_wellness', '2026-09-27 world_tourism']],
            'restaurant' => ['restaurant', ['2026-09-27 world_tourism', '2026-10-16 world_food']],
            'education' => ['education', ['2026-04-23 world_book', '2026-09-08 literacy', '2026-10-05 teachers']],
            'legal' => ['legal', ['2026-04-26 world_ip', '2026-06-27 msme', '2026-12-10 human_rights']],
            'real_estate' => ['real_estate', ['2026-10-05 world_habitat']],
            'services' => ['services', ['2026-06-27 msme']],
            'other' => ['other', ['2026-06-27 msme']],
            'unknown' => [null, []],
        ];
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Unit/Content/SpecialDaysTest.php
```

Expected: `exit 1`, `Class "App\Services\Content\Days\SpecialDays" not found`.

- [ ] **Step 3: Write `SpecialDays`**

Write `app/Services/Content/Days/SpecialDays.php` with the Write tool:

```php
<?php

namespace App\Services\Content\Days;

/**
 * Marketing days (by the holiday country; spec 2026-10-16 Appendix B.1) and real international days (by the
 * organisation's industry; B.2). A marketing day that is a public holiday in the country is left out here: the
 * holiday table shows it (Lithuania's Mother's and Father's Day, Latvia's Christmas Eve, Germany's Father's Day =
 * Ascension). A brand with no holiday country gets the days that need no country.
 */
final class SpecialDays
{
    /** [id, rule] on the same day everywhere. */
    private const EVERYWHERE = [
        ['valentines', ['fixed', 2, 14]],
        ['womens_day', ['fixed', 3, 8]],
        ['halloween', ['fixed', 10, 31]],
        ['black_friday', ['black_friday']],
    ];

    /** id => [country (or 'none' for no country) => rule]; a country left out has none of that day here. */
    private const BY_COUNTRY = [
        'mothers_day' => [
            'GB' => ['easter', -21], 'IE' => ['easter', -21],
            'US' => ['nth', 5, 7, 2], 'DE' => ['nth', 5, 7, 2], 'LV' => ['nth', 5, 7, 2], 'EE' => ['nth', 5, 7, 2],
            'ES' => ['nth', 5, 7, 1], 'FR' => ['fr_mothers'],
        ],
        'fathers_day' => [
            'GB' => ['nth', 6, 7, 3], 'IE' => ['nth', 6, 7, 3], 'US' => ['nth', 6, 7, 3], 'FR' => ['nth', 6, 7, 3],
            'ES' => ['fixed', 3, 19], 'LV' => ['nth', 9, 7, 2], 'EE' => ['nth', 11, 7, 2],
        ],
        'easter_sunday' => [
            'GB' => ['easter', 0], 'IE' => ['easter', 0], 'US' => ['easter', 0], 'DE' => ['easter', 0], 'FR' => ['easter', 0],
            'ES' => ['easter', 0], 'none' => ['easter', 0],
        ],
        'christmas_eve' => [
            'GB' => ['fixed', 12, 24], 'IE' => ['fixed', 12, 24], 'US' => ['fixed', 12, 24], 'DE' => ['fixed', 12, 24],
            'FR' => ['fixed', 12, 24], 'ES' => ['fixed', 12, 24], 'none' => ['fixed', 12, 24],
        ],
        'new_years_eve' => [
            'GB' => ['fixed', 12, 31], 'IE' => ['fixed', 12, 31], 'US' => ['fixed', 12, 31], 'DE' => ['fixed', 12, 31],
            'FR' => ['fixed', 12, 31], 'ES' => ['fixed', 12, 31], 'LT' => ['fixed', 12, 31], 'EE' => ['fixed', 12, 31],
            'none' => ['fixed', 12, 31],
        ],
    ];

    /** [id, rule, industries (Organization::INDUSTRIES)]. */
    private const INDUSTRY = [
        ['world_health', ['fixed', 4, 7], ['medical', 'fitness']],
        ['world_heart', ['fixed', 9, 29], ['medical', 'fitness']],
        ['world_mental_health', ['fixed', 10, 10], ['medical']],
        ['yoga', ['fixed', 6, 21], ['fitness', 'beauty']],
        ['global_wellness', ['nth', 6, 6, 2], ['beauty', 'fitness', 'hotel']],
        ['global_running', ['nth', 6, 3, 1], ['fitness']],
        ['world_tourism', ['fixed', 9, 27], ['hotel', 'restaurant']],
        ['world_food', ['fixed', 10, 16], ['restaurant']],
        ['world_book', ['fixed', 4, 23], ['education']],
        ['literacy', ['fixed', 9, 8], ['education']],
        ['teachers', ['fixed', 10, 5], ['education']],
        ['world_ip', ['fixed', 4, 26], ['legal']],
        ['human_rights', ['fixed', 12, 10], ['legal']],
        ['world_habitat', ['nth', 10, 1, 1], ['real_estate']],
        ['msme', ['fixed', 6, 27], ['services', 'legal', 'other']],
    ];

    /** @return list<array{id: string, date: string}> by date */
    public static function marketing(?string $country, int $year): array
    {
        $key = $country ?? 'none';
        $days = [];
        foreach (self::EVERYWHERE as [$id, $rule]) {
            $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year)];
        }
        foreach (self::BY_COUNTRY as $id => $rules) {
            if (isset($rules[$key])) {
                $days[] = ['id' => $id, 'date' => DayMath::on($rules[$key], $year)];
            }
        }

        return self::byDate($days);
    }

    /** @return list<array{id: string, date: string}> by date */
    public static function industry(?string $industry, int $year): array
    {
        $days = [];
        foreach (self::INDUSTRY as [$id, $rule, $industries]) {
            if ($industry !== null && in_array($industry, $industries, true)) {
                $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year)];
            }
        }

        return self::byDate($days);
    }

    /** Every id this class uses (DayNames must name each). @return list<string> */
    public static function ids(): array
    {
        return array_values(array_unique(array_merge(
            array_column(self::EVERYWHERE, 0),
            array_keys(self::BY_COUNTRY),
            array_column(self::INDUSTRY, 0),
        )));
    }

    /** @param list<array{id: string, date: string}> $days @return list<array{id: string, date: string}> */
    private static function byDate(array $days): array
    {
        usort($days, fn (array $a, array $b) => [$a['date'], $a['id']] <=> [$b['date'], $b['id']]);

        return $days;
    }
}
```

- [ ] **Step 4: Add the special days to the range**

In `app/Services/Content/Days/BuiltInDays.php`, replace the year loop:

```php
        for ($year = (int) substr($from, 0, 4); $year <= (int) substr($to, 0, 4) + 1; $year++) {
            if ($country !== null) {
                foreach (PublicHolidays::for($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'holiday'];
                }
            }
        }
```

with:

```php
        for ($year = (int) substr($from, 0, 4); $year <= (int) substr($to, 0, 4) + 1; $year++) {
            if ($country !== null) {
                foreach (PublicHolidays::for($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'holiday'];
                }
            }
            if ($marketing) {
                foreach (SpecialDays::marketing($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'marketing', 'substitute' => false];
                }
                foreach (SpecialDays::industry($industry, $year) as $day) {
                    $days[] = $day + ['kind' => 'industry', 'substitute' => false];
                }
            }
        }
```

- [ ] **Step 5: Run both tests to see them pass**

```bash
"$R4/php.sh" tests/Unit/Content/SpecialDaysTest.php tests/Unit/Content/PublicHolidaysTest.php
```

Expected: `SpecialDaysTest | Tests:    25 passed` (10 + 1 + 11 + 3), `PublicHolidaysTest | Tests:    31 passed`, both `exit 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/Days tests/Unit/Content/SpecialDaysTest.php && git commit -q -m "Content days: marketing days by country and international days by industry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: The brand's holiday country and marketing switch (spec §3.3)

**Files:**
- Create: `database/migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php`, `app/Services/Content/Days/HolidayCountry.php`
- Modify: `app/Models/ContentPlannerProfile.php`, `app/Services/Content/ContentRules.php` (`profileFields`), `app/Services/Content/ContentBrandEditor.php` (`PROFILE_FIELDS`), `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`payload`), `tests/Concerns/SetsUpContentSchema.php`
- Test: `tests/Feature/Content/HolidayCountryTest.php`

**Interfaces:**
- Consumes: `PublicHolidays::COUNTRIES` (Task 1); `VenueClock::zone(int $orgId): string` (existing).
- Produces: profile columns `holiday_country` (varchar(4) null: null = never chosen, one of the nine, or `none`) and `marketing_days` (boolean, default true); `HolidayCountry::guess(Organization $org): ?string`; `HolidayCountry::for(Organization $org, ?ContentPlannerProfile $profile): ?string`; the brand payload's `profile.holiday_country`, `profile.marketing_days` and top-level `holiday_country_guess`; `PUT brand/profile` accepts `holiday_country` and `marketing_days`.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/HolidayCountryTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Services\Content\Days\HolidayCountry;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The brand's holiday country (spec 2026-10-16 §3.3): its choice, else a guess from the organisation's country or the venue's zone. */
class HolidayCountryTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function venue(?string $country, ?string $zone): void
    {
        $this->org->forceFill(['country' => $country, 'timezone' => $zone])->save();
        // VenueClock memoises the zone per request.
        app()->forgetScopedInstances();
    }

    public function test_the_guess_takes_the_organisations_country_then_the_venues_zone(): void
    {
        $this->venue('ie', 'Europe/Riga');
        $this->assertSame('IE', HolidayCountry::guess($this->org->fresh()));
        $this->venue('UK', null);
        $this->assertSame('GB', HolidayCountry::guess($this->org->fresh()));
        $this->venue('RU', 'Europe/Riga');
        $this->assertSame('LV', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'America/Indiana/Indianapolis');
        $this->assertSame('US', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'Pacific/Honolulu');
        $this->assertSame('US', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'UTC');
        $this->assertNull(HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'Asia/Tokyo');
        $this->assertNull(HolidayCountry::guess($this->org->fresh()));
    }

    public function test_the_brands_choice_wins_and_none_means_no_holidays(): void
    {
        $this->venue(null, 'Europe/London');
        $this->assertSame('GB', HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->profile->forceFill(['holiday_country' => 'FR'])->save();
        $this->assertSame('FR', HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->profile->forceFill(['holiday_country' => 'none'])->save();
        $this->assertNull(HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->assertSame('GB', HolidayCountry::for($this->org->fresh(), null));
    }

    public function test_a_manager_chooses_the_country_and_the_switch_and_everyone_reads_them(): void
    {
        $this->venue(null, 'Europe/Berlin');
        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonPath('profile.holiday_country', null)
            ->assertJsonPath('profile.marketing_days', true)
            ->assertJsonPath('holiday_country_guess', 'DE');

        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'ES', 'marketing_days' => false])->assertOk()
            ->assertJsonPath('profile.holiday_country', 'ES')
            ->assertJsonPath('profile.marketing_days', false);
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'none'])->assertOk()->assertJsonPath('profile.holiday_country', 'none');
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => null])->assertOk()->assertJsonPath('profile.holiday_country', null);
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'RU'])->assertStatus(422)->assertJsonValidationErrors('holiday_country');
        $this->asManager()->putJson($this->api('brand/profile'), ['marketing_days' => 'often'])->assertStatus(422)->assertJsonValidationErrors('marketing_days');
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['holiday_country' => 'GB'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_brand_without_a_profile_still_carries_the_guess(): void
    {
        $this->venue('EE', null);
        [$second] = $this->secondBrand(false);

        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()
            ->assertJsonPath('profile', null)
            ->assertJsonPath('holiday_country_guess', 'EE');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Feature/Content/HolidayCountryTest.php
```

Expected: `exit 1` — `Class "App\Services\Content\Days\HolidayCountry" not found` (and, once the class exists, a missing `country` column on the test's organisations table, which Step 3 adds).

- [ ] **Step 3: The migration and the test schema**

Write `database/migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A brand's holiday country and its marketing-days switch (spec 2026-10-16 §3.3): `holiday_country` null = never
 * chosen (guessed), one of the nine codes, or `none`; marketing and industry days show while `marketing_days` is on.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_profiles', 'holiday_country')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->string('holiday_country', 4)->nullable();
            });
        }
        if (!Schema::hasColumn('content_planner_profiles', 'marketing_days')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->boolean('marketing_days')->default(true);
            });
        }
    }

    public function down(): void
    {
        foreach (['holiday_country', 'marketing_days'] as $column) {
            if (Schema::hasColumn('content_planner_profiles', $column)) {
                Schema::table('content_planner_profiles', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
```

In `tests/Concerns/SetsUpContentSchema.php`, add the organisation's `country` to the columns list — replace:

```php
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
        ];
```

with:

```php
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
            'country'           => fn (Blueprint $t) => $t->string('country', 2)->nullable(),
        ];
```

and after the `series_id` block:

```php
        if (!Schema::hasColumn('content_planner_posts', 'series_id')) {
            (require database_path('migrations/2026_10_15_100200_add_series_id_to_content_planner_posts.php'))->up();
        }
```

add:

```php
        if (!Schema::hasColumn('content_planner_profiles', 'holiday_country')) {
            (require database_path('migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php'))->up();
        }
```

- [ ] **Step 4: Write `HolidayCountry`**

Write `app/Services/Content/Days/HolidayCountry.php` with the Write tool:

```php
<?php

namespace App\Services\Content\Days;

use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;

/**
 * Which country's public holidays a brand sees (spec 2026-10-16 §3.3): its own choice (`none` = no holidays), else a
 * guess — the organisation's country when it is one of the nine, else the venue's time zone; anything else, UTC
 * included, guesses nothing.
 */
final class HolidayCountry
{
    private const ZONES = [
        'Europe/London' => 'GB', 'Europe/Dublin' => 'IE', 'Europe/Berlin' => 'DE', 'Europe/Paris' => 'FR',
        'Europe/Madrid' => 'ES', 'Europe/Riga' => 'LV', 'Europe/Vilnius' => 'LT', 'Europe/Tallinn' => 'EE',
    ];

    private const US_ZONES = [
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
        'America/Anchorage', 'America/Detroit', 'Pacific/Honolulu',
    ];

    private const US_ZONE_PREFIXES = ['America/Indiana/', 'America/Kentucky/'];

    public static function guess(Organization $org): ?string
    {
        $country = strtoupper(trim((string) $org->country));
        // People type "UK"; the ISO code is GB.
        $country = $country === 'UK' ? 'GB' : $country;
        if (in_array($country, PublicHolidays::COUNTRIES, true)) {
            return $country;
        }

        $zone = VenueClock::zone((int) $org->id);
        if (isset(self::ZONES[$zone])) {
            return self::ZONES[$zone];
        }
        if (in_array($zone, self::US_ZONES, true)) {
            return 'US';
        }
        foreach (self::US_ZONE_PREFIXES as $prefix) {
            if (str_starts_with($zone, $prefix)) {
                return 'US';
            }
        }

        return null;
    }

    public static function for(Organization $org, ?ContentPlannerProfile $profile): ?string
    {
        $chosen = $profile?->holiday_country;
        if ($chosen === 'none') {
            return null;
        }
        if (in_array($chosen, PublicHolidays::COUNTRIES, true)) {
            return $chosen;
        }

        return self::guess($org);
    }
}
```

- [ ] **Step 5: The model, the rules, the editor and the payload**

In `app/Models/ContentPlannerProfile.php`, replace in `$fillable`:

```php
        'knowledge_score',
        'setup_step',
    ];
```

with:

```php
        'knowledge_score',
        'setup_step',
        'holiday_country',
        'marketing_days',
    ];
```

and in `$casts` replace:

```php
        'knowledge_score' => 'integer',
        'setup_step' => 'integer',
    ];
```

with:

```php
        'knowledge_score' => 'integer',
        'setup_step' => 'integer',
        'marketing_days' => 'boolean',
    ];
```

In `app/Services/Content/ContentRules.php` (`profileFields`), replace:

```php
            'trend_mode' => ['sometimes', 'string', 'max:50'], 'setup_step' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ];
```

with:

```php
            'trend_mode' => ['sometimes', 'string', 'max:50'], 'setup_step' => ['sometimes', 'integer', 'min:0', 'max:20'],
            // Spec 2026-10-16 §3.3: null = never chosen (guessed), one of the nine, or none.
            'holiday_country' => ['sometimes', 'nullable', Rule::in([...PublicHolidays::COUNTRIES, 'none'])],
            'marketing_days' => ['sometimes', 'boolean'],
        ];
```

and add `use App\Services\Content\Days\PublicHolidays;` to the file's `use` block (with the Edit tool).

In `app/Services/Content/ContentBrandEditor.php`, replace:

```php
'engagement_goals', 'visual_style', 'trend_mode', 'setup_step'];
    private const AUDIENCE_FIELDS
```

with:

```php
'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'holiday_country', 'marketing_days'];
    private const AUDIENCE_FIELDS
```

In `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`payload`), replace:

```php
        if (!$profile) {
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'snippets' => [], 'voice' => null, 'readiness' => null];
        }
        $voice = $profile->brandVoices()->where('active', true)->first();
```

with:

```php
        // The country the venue suggests, for the Key dates section's "guessed" line (spec 2026-10-16 §3.3).
        $guess = ($org = Organization::find(ContentContext::orgId())) ? HolidayCountry::guess($org) : null;
        if (!$profile) {
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'snippets' => [], 'voice' => null, 'readiness' => null, 'holiday_country_guess' => $guess];
        }
        $voice = $profile->brandVoices()->where('active', true)->first();
```

replace:

```php
                'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'knowledge_score',
            ]) + [
                'setup_completed_at'     => $profile->setup_completed_at?->toISOString(),
                'last_knowledge_sync_at' => $profile->last_knowledge_sync_at?->toISOString(),
            ],
```

with:

```php
                'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'knowledge_score',
            ]) + [
                'setup_completed_at'     => $profile->setup_completed_at?->toISOString(),
                'last_knowledge_sync_at' => $profile->last_knowledge_sync_at?->toISOString(),
                'holiday_country'        => $profile->holiday_country,
                'marketing_days'         => (bool) ($profile->marketing_days ?? true),
            ],
```

and replace:

```php
            'readiness' => $this->knowledge->readinessOf($profile),
        ];
```

with:

```php
            'readiness' => $this->knowledge->readinessOf($profile),
            'holiday_country_guess' => $guess,
        ];
```

and add `use App\Models\Organization;` and `use App\Services\Content\Days\HolidayCountry;` to the controller's `use` block (Edit tool).

- [ ] **Step 6: Run the test, then the Brand and Content folders**

```bash
"$R4/php.sh" tests/Feature/Content/HolidayCountryTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `HolidayCountryTest | Tests:    4 passed`, then the two folders `exit 0` (Feature Content was 125 tests at release 3; now +4; Unit Content 11 + 56 from Tasks 1–2).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_16_100000_add_holiday_settings_to_content_planner_profiles.php app/Services/Content/Days/HolidayCountry.php app/Models/ContentPlannerProfile.php app/Services/Content/ContentRules.php app/Services/Content/ContentBrandEditor.php app/Http/Controllers/Api/V1/Admin/Content/BrandController.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/HolidayCountryTest.php && git commit -q -m "Content: a brand's holiday country (chosen or guessed) and its marketing-days switch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: The brand's events and notes (spec §3.1)

**Files:**
- Create: `database/migrations/2026_10_16_100100_create_content_planner_key_dates_table.php`, `app/Models/ContentPlannerKeyDate.php`, `app/Services/Content/ContentKeyDates.php`, `app/Http/Controllers/Api/V1/Admin/Content/KeyDateController.php`
- Modify: `app/Models/ContentPlannerProfile.php` (relation), `app/Services/Content/ContentRules.php` (`keyDateFields`), `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: `tests/Feature/Content/KeyDatesTest.php`

**Interfaces:**
- Produces:
  - table `content_planner_key_dates` (`organization_id`, `brand_id`, `planner_profile_id`, `kind`, `title`, `details`, `start_date`, `end_date`, `created_by`, timestamps); model `ContentPlannerKeyDate` with `KINDS = ['note', 'event']`, `MAX = 1000`, `MAX_EVENT_DAYS = 31`; `ContentPlannerProfile::keyDates(): HasMany`.
  - `ContentKeyDates::day(mixed $value): ?string` (a stored date as `Y-m-d`); `ContentKeyDates::own(ContentPlannerKeyDate $keyDate): array{id: int, kind: string, title: string, details: ?string, start: string, end: ?string}` (`end` null for one day).
  - `POST key-dates` (201 `{key_date}`), `PUT key-dates/{id}` (`{key_date}`), `DELETE key-dates/{id}` (`{deleted: true}`) — anyone on the team; 409 `no_profile` without a profile; 404 `not_found` for another brand's; 422 `too_many_key_dates` past 1,000.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/KeyDatesTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The brand's own events and notes (spec 2026-10-16 §3.1): anyone on the team keeps them; past days allowed. */
class KeyDatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_anyone_on_the_team_keeps_events_and_notes(): void
    {
        $event = $this->asStaffMember()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Spring sale', 'details' => 'Ten per cent off colour', 'start_date' => '2026-03-01', 'end_date' => '2026-03-14'])
            ->assertCreated()
            ->assertJsonPath('key_date.kind', 'event')
            ->assertJsonPath('key_date.start', '2026-03-01')
            ->assertJsonPath('key_date.end', '2026-03-14')
            ->assertJsonPath('key_date.details', 'Ten per cent off colour')
            ->json('key_date.id');
        $this->asStaffMember()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Photographer comes at 10', 'start_date' => '2026-10-07'])
            ->assertCreated()->assertJsonPath('key_date.end', null)->assertJsonPath('key_date.details', null);

        $this->asManager()->putJson($this->api("key-dates/{$event}"), ['title' => 'Big spring sale'])->assertOk()
            ->assertJsonPath('key_date.title', 'Big spring sale')->assertJsonPath('key_date.end', '2026-03-14');
        $this->asStaffMember()->deleteJson($this->api("key-dates/{$event}"))->assertOk()->assertJsonPath('deleted', true);

        $this->assertSame(1, ContentPlannerKeyDate::count());
        $this->assertSame((int) $this->staffMember->id, (int) ContentPlannerKeyDate::first()->created_by);
    }

    public function test_an_event_lasts_at_most_31_days_and_a_note_one_day(): void
    {
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'All March', 'start_date' => '2026-03-01', 'end_date' => '2026-03-31'])->assertCreated();
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Too long', 'start_date' => '2026-03-01', 'end_date' => '2026-04-01'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Backwards', 'start_date' => '2026-03-10', 'end_date' => '2026-03-09'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Two days', 'start_date' => '2026-03-10', 'end_date' => '2026-03-11'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Same day', 'start_date' => '2026-03-10', 'end_date' => '2026-03-10'])
            ->assertCreated()->assertJsonPath('key_date.end', null);

        // A day already gone is fine (an event already running); today is Monday 5 October 2026.
        $id = $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Open day', 'start_date' => '2026-09-01'])->assertCreated()->json('key_date.id');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['start_date' => '2026-09-10', 'end_date' => '2026-09-05'])->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['kind' => 'note'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['end_date' => '2026-09-03'])->assertOk()->assertJsonPath('key_date.end', '2026-09-03');
    }

    public function test_kinds_titles_details_days_and_the_thousand_are_checked(): void
    {
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'holiday', 'title' => 'x', 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => str_repeat('t', 121), 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('title');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'x', 'details' => str_repeat('d', 1001), 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('details');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'x', 'start_date' => '1 March'])->assertStatus(422)->assertJsonValidationErrors('start_date');

        $rows = [];
        for ($i = 0; $i < 1000; $i++) {
            $rows[] = ['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'kind' => 'note', 'title' => "Note {$i}", 'start_date' => '2026-03-01', 'created_at' => now(), 'updated_at' => now()];
        }
        foreach (array_chunk($rows, 50) as $chunk) {
            DB::table('content_planner_key_dates')->insert($chunk);
        }
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'One more', 'start_date' => '2026-03-01'])
            ->assertStatus(422)->assertJsonPath('error', 'too_many_key_dates');
    }

    public function test_another_brands_key_date_does_not_exist_here_and_a_brand_without_a_profile_keeps_none(): void
    {
        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("key-dates?brand_id={$second}"), ['kind' => 'note', 'title' => 'Theirs', 'start_date' => '2026-03-01'])->assertCreated()->json('key_date.id');
        $this->asManager()->putJson($this->api("key-dates/{$theirs}"), ['title' => 'Mine now'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("key-dates/{$theirs}"))->assertNotFound();

        [$third] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("key-dates?brand_id={$third}"), ['kind' => 'note', 'title' => 'x', 'start_date' => '2026-03-01'])
            ->assertStatus(409)->assertJsonPath('error', 'no_profile');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Feature/Content/KeyDatesTest.php
```

Expected: `exit 1` — `Class "App\Models\ContentPlannerKeyDate" not found`, or 404s on `key-dates` (no route yet).

- [ ] **Step 3: The migration, the model and the relation**

Write `database/migrations/2026_10_16_100100_create_content_planner_key_dates_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's own key dates (spec 2026-10-16 §3.1): events (up to 31 days) and notes (one day). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_key_dates')) {
            return;
        }
        Schema::create('content_planner_key_dates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('kind', 10);
            $table->string('title', 120);
            $table->text('details')->nullable();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['planner_profile_id', 'start_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_key_dates');
    }
};
```

Write `app/Models/ContentPlannerKeyDate.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * A brand's event or note on the Plan (spec 2026-10-16 §3.1). The dates stay plain `Y-m-d` strings (no date cast:
 * SQLite would add a time); `end_date` is null for a one-day event and for every note.
 */
class ContentPlannerKeyDate extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['note', 'event'];

    /** A brand keeps at most this many events and notes together. */
    public const MAX = 1000;

    /** An event lasts at most this many days, its first and last included. */
    public const MAX_EVENT_DAYS = 31;

    protected $fillable = ['planner_profile_id', 'brand_id', 'kind', 'title', 'details', 'start_date', 'end_date', 'created_by'];
}
```

In `app/Models/ContentPlannerProfile.php`, after the `snippets()` relation:

```php
    public function snippets(): HasMany
    {
        return $this->hasMany(ContentPlannerSnippet::class, 'planner_profile_id');
    }
```

add:

```php

    public function keyDates(): HasMany
    {
        return $this->hasMany(ContentPlannerKeyDate::class, 'planner_profile_id');
    }
```

In `tests/Concerns/SetsUpContentSchema.php`, after the `holiday_country` block from Task 3, add:

```php
        if (!Schema::hasTable('content_planner_key_dates')) {
            (require database_path('migrations/2026_10_16_100100_create_content_planner_key_dates_table.php'))->up();
        }
```

- [ ] **Step 4: The rules, the presenter and the controller**

In `app/Services/Content/ContentRules.php`, after `snippetFields`:

```php
    public static function snippetFields(bool $creating): array
    {
        return [
            'kind' => $creating ? ['required', Rule::in(ContentPlannerSnippet::KINDS)] : ['prohibited'],
            'name' => $creating ? ['required', 'string', 'max:60'] : ['sometimes', 'string', 'max:60'],
            'body' => $creating ? ['required', 'string', 'max:2000'] : ['sometimes', 'string', 'max:2000'],
        ];
    }
```

add:

```php

    /** An event or note (spec 2026-10-16 §3.1); the controller checks its days against each other. @return array<string, mixed> */
    public static function keyDateFields(bool $creating): array
    {
        return [
            'kind'       => $creating ? ['required', Rule::in(ContentPlannerKeyDate::KINDS)] : ['prohibited'],
            'title'      => $creating ? ['required', 'string', 'max:120'] : ['sometimes', 'string', 'max:120'],
            'details'    => ['sometimes', 'nullable', 'string', 'max:1000'],
            'start_date' => $creating ? ['required', 'date_format:Y-m-d'] : ['sometimes', 'date_format:Y-m-d'],
            'end_date'   => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }
```

and add `use App\Models\ContentPlannerKeyDate;` to its `use` block (Edit tool).

Write `app/Services/Content/ContentKeyDates.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerKeyDate;

/** Key dates for the Plan and the AI (spec 2026-10-16 §3): the built-in days and the brand's own events and notes. */
final class ContentKeyDates
{
    /** A stored date as `Y-m-d` (SQLite keeps a time after it). */
    public static function day(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return substr($value instanceof \DateTimeInterface ? $value->format('Y-m-d') : (string) $value, 0, 10);
    }

    /** @return array{id: int, kind: string, title: string, details: ?string, start: string, end: ?string} */
    public static function own(ContentPlannerKeyDate $keyDate): array
    {
        return [
            'id'      => (int) $keyDate->id,
            'kind'    => (string) $keyDate->kind,
            'title'   => (string) $keyDate->title,
            'details' => $keyDate->details,
            'start'   => (string) self::day($keyDate->start_date),
            'end'     => self::day($keyDate->end_date),
        ];
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/KeyDateController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerKeyDate;
use App\Models\ContentPlannerProfile;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentKeyDates;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The brand's own key dates (spec 2026-10-16 §3.1): events of up to 31 days and one-day notes. Anyone on the team
 * adds, edits and deletes them, past days included.
 */
class KeyDateController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::keyDateFields(true));
        $data['end_date'] = self::lastDay($data['kind'], $data['start_date'], $data['end_date'] ?? null);
        if ($profile->keyDates()->count() >= ContentPlannerKeyDate::MAX) {
            throw new ContentRefused('too_many_key_dates', 'A brand keeps at most 1,000 events and notes.', 422);
        }
        $keyDate = $profile->keyDates()->create($data + ['brand_id' => $profile->brand_id, 'created_by' => $request->user()->id]);

        return response()->json(['key_date' => ContentKeyDates::own($keyDate)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $keyDate = self::find($profile, $id);
        $data = $request->validate(ContentRules::keyDateFields(false));
        $start = $data['start_date'] ?? (string) ContentKeyDates::day($keyDate->start_date);
        $end = array_key_exists('end_date', $data) ? $data['end_date'] : ContentKeyDates::day($keyDate->end_date);
        $data['end_date'] = self::lastDay((string) $keyDate->kind, $start, $end);
        $keyDate->fill($data)->save();

        return response()->json(['key_date' => ContentKeyDates::own($keyDate->fresh())]);
    }

    public function destroy(int $id): JsonResponse
    {
        self::find(ContentContext::requireProfile(), $id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** The last day as stored: null for one day (every note); an event's never before its first, at most 31 days on. */
    private static function lastDay(string $kind, string $start, ?string $end): ?string
    {
        if ($end === null || $end === $start) {
            return null;
        }
        if ($kind === 'note') {
            throw ValidationException::withMessages(['end_date' => 'A note is on one day.']);
        }
        if ($end < $start) {
            throw ValidationException::withMessages(['end_date' => 'The last day cannot be before the first.']);
        }
        if (ContentRules::days($start, $end) > ContentPlannerKeyDate::MAX_EVENT_DAYS) {
            throw ValidationException::withMessages(['end_date' => 'An event lasts at most 31 days.']);
        }

        return $end;
    }

    private static function find(ContentPlannerProfile $profile, int $id): ContentPlannerKeyDate
    {
        return $profile->keyDates()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This key date no longer exists.', 404);
    }
}
```

- [ ] **Step 5: The routes**

In `routes/api.php`, with the Edit tool (the line holds backslashes), replace:

```php
                Route::get('goals', [\App\Http\Controllers\Api\V1\Admin\Content\GoalsController::class, 'show']);
```

with:

```php
                Route::get('goals', [\App\Http\Controllers\Api\V1\Admin\Content\GoalsController::class, 'show']);
                Route::post('key-dates', [\App\Http\Controllers\Api\V1\Admin\Content\KeyDateController::class, 'store']);
                Route::put('key-dates/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\KeyDateController::class, 'update'])->whereNumber('id');
                Route::delete('key-dates/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\KeyDateController::class, 'destroy'])->whereNumber('id');
```

- [ ] **Step 6: Run the test, then the gate test**

```bash
"$R4/php.sh" tests/Feature/Content/KeyDatesTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: `KeyDatesTest | Tests:    4 passed`, `ContentGateTest` `exit 0` (its route sweep now includes `key-dates`, which carries the gate and the brand).

- [ ] **Step 7: Ledger the tenancy ruling and commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && echo "Task 4: Ruling: content_planner_key_dates (and Task 8's templates) carry organization_id and brand_id beside planner_profile_id, with BelongsToOrganization/BelongsToBrand — spec §9.1 names only the profile, but every tenant table here (snippets) carries both so the global scopes keep organisations and brands apart — cost if wrong: two unused columns." >> "$R4/progress.md" && git add database/migrations/2026_10_16_100100_create_content_planner_key_dates_table.php app/Models/ContentPlannerKeyDate.php app/Models/ContentPlannerProfile.php app/Services/Content/ContentRules.php app/Services/Content/ContentKeyDates.php app/Http/Controllers/Api/V1/Admin/Content/KeyDateController.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/KeyDatesTest.php && git commit -q -m "Content: the brand's own events and notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Key dates on the Plan (spec §3.4, §9.2)

**Files:**
- Modify: `app/Services/Content/ContentKeyDates.php`, `app/Http/Controllers/Api/V1/Admin/Content/PlanController.php`
- Test: `tests/Feature/Content/PlanKeyDatesTest.php`

**Interfaces:**
- Consumes: `BuiltInDays::between` (Tasks 1–2), `HolidayCountry::for` (Task 3), `ContentKeyDates::own`, `ContentPlannerProfile::keyDates` (Task 4).
- Produces: `ContentKeyDates::forRange(Organization $org, ?ContentPlannerProfile $profile, string $from, string $to): list<array<string, mixed>>` (built-in days first — `id`, `kind`, `date`, `substitute`, `name_en` — then the brand's events and notes that overlap the range — `id`, `kind`, `title`, `details`, `start`, `end`); `ContentKeyDates::ownBetween(ContentPlannerProfile $profile, string $from, string $to): list<array>`; `GET plan` answers `key_dates` (also for a brand without a profile: the guessed holidays and the special days).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/PlanKeyDatesTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The Plan's key dates (spec 2026-10-16 §3.4, §9.2). The organisation is in the beauty industry. */
class PlanKeyDatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** The range's key dates as lines: "date id kind" (a trailing * for a substitute day) or "start..end title kind". @return list<string> */
    private function keyDates(string $from, string $to, ?int $brand = null): array
    {
        $days = $this->asStaffMember()->getJson($this->api("plan?from={$from}&to={$to}" . ($brand ? "&brand_id={$brand}" : '')))->assertOk()->json('key_dates');

        return array_map(fn (array $d) => isset($d['date'])
            ? "{$d['date']} {$d['id']} {$d['kind']}" . ($d['substitute'] ? '*' : '')
            : "{$d['start']}.." . ($d['end'] ?? '') . " {$d['title']} {$d['kind']}", $days);
    }

    private function choose(array $settings): void
    {
        $this->profile->forceFill($settings)->save();
    }

    public function test_the_plan_carries_the_brands_holidays_and_special_days(): void
    {
        $this->choose(['holiday_country' => 'GB']);

        $this->assertSame(
            ['2026-12-24 christmas_eve marketing', '2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday', '2026-12-28 gb.boxing_day holiday*', '2026-12-31 new_years_eve marketing'],
            $this->keyDates('2026-12-21', '2026-12-31'),
        );
        $this->asStaffMember()->getJson($this->api('plan?from=2026-12-21&to=2026-12-31'))->assertJsonPath('key_dates.1.name_en', 'Christmas Day');
    }

    public function test_a_range_across_new_year_brings_the_observed_and_substitute_days(): void
    {
        $this->choose(['holiday_country' => 'US', 'marketing_days' => false]);
        $this->assertSame(
            ['2027-12-24 christmas holiday*', '2027-12-25 christmas holiday', '2027-12-31 new_year holiday*', '2028-01-01 new_year holiday'],
            $this->keyDates('2027-12-20', '2028-01-09'),
        );

        $this->choose(['holiday_country' => 'GB']);
        $this->assertSame(
            ['2027-12-25 christmas holiday', '2027-12-26 gb.boxing_day holiday', '2027-12-27 christmas holiday*', '2027-12-28 gb.boxing_day holiday*', '2028-01-01 new_year holiday', '2028-01-03 new_year holiday*'],
            $this->keyDates('2027-12-20', '2028-01-09'),
        );
    }

    public function test_none_means_no_holidays_never_chosen_means_the_guess_and_the_switch_hides_special_days(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->assertSame(['2026-06-23 lv.ligo holiday', '2026-06-24 midsummer holiday'], $this->keyDates('2026-06-22', '2026-06-26'));

        $this->choose(['holiday_country' => 'none']);
        $this->assertSame([], $this->keyDates('2026-06-22', '2026-06-26'));

        $this->choose(['holiday_country' => 'GB']);
        $this->assertContains('2026-12-24 christmas_eve marketing', $this->keyDates('2026-12-21', '2026-12-27'));
        $this->choose(['marketing_days' => false]);
        $this->assertSame(['2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday'], $this->keyDates('2026-12-21', '2026-12-27'));
    }

    public function test_events_that_overlap_the_range_and_notes_on_its_days_show(): void
    {
        $this->choose(['holiday_country' => 'none', 'marketing_days' => false]);
        $own = fn (array $a) => ContentPlannerKeyDate::create($a + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId]);
        $own(['kind' => 'event', 'title' => 'Autumn offer', 'start_date' => '2026-09-28', 'end_date' => '2026-10-08']);
        $own(['kind' => 'note', 'title' => 'Photographer', 'start_date' => '2026-10-07']);
        $own(['kind' => 'note', 'title' => 'Next week', 'start_date' => '2026-10-12']);
        $own(['kind' => 'event', 'title' => 'Over', 'start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        [$second] = $this->secondBrand();
        $this->asManager()->postJson($this->api("key-dates?brand_id={$second}"), ['kind' => 'event', 'title' => 'Theirs', 'start_date' => '2026-10-06'])->assertCreated();

        $this->assertSame(['2026-09-28..2026-10-08 Autumn offer event', '2026-10-07.. Photographer note'], $this->keyDates('2026-10-05', '2026-10-11'));
    }

    public function test_the_industry_days_follow_the_organisation(): void
    {
        $this->choose(['holiday_country' => 'none']);

        $this->assertSame(['2026-06-13 global_wellness industry'], $this->keyDates('2026-06-08', '2026-06-14'));
    }

    public function test_a_brand_without_a_profile_still_sees_the_guessed_holidays(): void
    {
        $this->org->forceFill(['country' => 'FR'])->save();
        [$second] = $this->secondBrand(false);

        $this->assertContains('2026-07-14 fr.bastille holiday', $this->keyDates('2026-07-13', '2026-07-19', $second));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Feature/Content/PlanKeyDatesTest.php
```

Expected: `exit 1` — every test fails on a null `key_dates` (array_map on null).

- [ ] **Step 3: `forRange` and `ownBetween`**

In `app/Services/Content/ContentKeyDates.php`, replace:

```php
use App\Models\ContentPlannerKeyDate;
```

with:

```php
use App\Models\ContentPlannerKeyDate;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\HolidayCountry;
```

and before `public static function day`, add:

```php
    /**
     * The key dates of a range (spec 2026-10-16 §9.2): the built-in days — the brand's holiday country (chosen or
     * guessed), and the marketing and industry days while its switch is on — then its events and notes that overlap
     * the range. A brand without a profile gets the guessed holidays and the special days.
     *
     * @return list<array<string, mixed>>
     */
    public static function forRange(Organization $org, ?ContentPlannerProfile $profile, string $from, string $to): array
    {
        $days = BuiltInDays::between(
            HolidayCountry::for($org, $profile),
            $profile === null || (bool) ($profile->marketing_days ?? true),
            $org->resolved_industry,
            $from,
            $to,
        );

        return $profile === null ? $days : array_merge($days, self::ownBetween($profile, $from, $to));
    }

    /** The brand's events and notes that touch the range, by first day. @return list<array{id: int, kind: string, title: string, details: ?string, start: string, end: ?string}> */
    public static function ownBetween(ContentPlannerProfile $profile, string $from, string $to): array
    {
        return $profile->keyDates()
            ->whereDate('start_date', '<=', $to)
            ->where(fn ($q) => $q->whereDate('end_date', '>=', $from)
                ->orWhere(fn ($q) => $q->whereNull('end_date')->whereDate('start_date', '>=', $from)))
            ->orderBy('start_date')->orderBy('id')
            ->get()
            ->map(fn (ContentPlannerKeyDate $keyDate) => self::own($keyDate))->values()->all();
    }

```

- [ ] **Step 4: The Plan answers them**

In `app/Http/Controllers/Api/V1/Admin/Content/PlanController.php`, replace:

```php
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['posts' => [], 'unscheduled' => [], 'unscheduled_total' => 0, 'slots' => [], 'figures' => ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0]]);
        }

        return response()->json(ContentPlan::for($profile, $data['from'], $data['to'], VenueClock::today(ContentContext::orgId())));
```

with:

```php
        $org = $request->attributes->get('workspace_org');
        $profile = ContentContext::profile();
        // Spec 2026-10-16 §3.4: the range's holidays, special days, events and notes.
        $keyDates = ContentKeyDates::forRange($org, $profile, $data['from'], $data['to']);
        if (!$profile) {
            return response()->json(['posts' => [], 'unscheduled' => [], 'unscheduled_total' => 0, 'slots' => [], 'figures' => ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0], 'key_dates' => $keyDates]);
        }

        return response()->json(ContentPlan::for($profile, $data['from'], $data['to'], VenueClock::today(ContentContext::orgId())) + ['key_dates' => $keyDates]);
```

and add `use App\Services\Content\ContentKeyDates;` to its `use` block (Edit tool).

- [ ] **Step 5: Run the test and the Plan's existing tests**

```bash
"$R4/php.sh" tests/Feature/Content/PlanKeyDatesTest.php tests/Feature/Content/PlanTest.php
```

Expected: `PlanKeyDatesTest | Tests:    6 passed`, `PlanTest` `exit 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentKeyDates.php app/Http/Controllers/Api/V1/Admin/Content/PlanController.php tests/Feature/Content/PlanKeyDatesTest.php && git commit -q -m "Content: the Plan answers the range's holidays, special days, events and notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Key dates in the AI's context (spec §3.6)

**Files:**
- Modify: `app/Services/Content/ContentKeyDates.php`, `app/Services/ContentCalendarGenerationService.php`, `app/Services/ContentPostGenerationService.php`
- Test: `tests/Feature/Content/KeyDatesAiTest.php`

**Interfaces:**
- Consumes: `ContentKeyDates::forRange` (Task 5).
- Produces: `ContentKeyDates::forAi(Organization $org, ContentPlannerProfile $profile, string $from, string $to): string` — one line per day, by day, e.g. `- 2026-12-25: Christmas Day (public holiday)`, `- 2026-12-28: Boxing Day (public holiday, substitute day off)`, `- 2026-12-24: Christmas Eve (marketing day)`, `- 2026-06-13: Global Wellness Day (international day)`, `- 2026-03-01 to 2026-03-14: Spring sale (the brand's own event) — <details, cut to 300>`; never a note; `''` when none. The calendar prompt (Generate and Fill with AI) gains `## KEY DATES IN THIS WINDOW`; the single-post prompt gains `# KEY DATES ON THIS POST'S DAY`.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/KeyDatesAiTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use App\Services\Content\ContentKeyDates;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPostGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Key dates in the AI's context (spec 2026-10-16 §3.6): holidays, special days and the brand's events; never notes. */
class KeyDatesAiTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['holiday_country' => 'GB'])->save();
        $this->profile = $this->profile->fresh();
        ContentPlannerKeyDate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'event', 'title' => 'Winter open day', 'details' => 'Free mini facials', 'start_date' => '2026-12-22']);
        ContentPlannerKeyDate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'note', 'title' => 'Photographer at ten', 'start_date' => '2026-12-23']);
    }

    public function test_the_ai_is_told_holidays_special_days_and_events_by_day_never_notes(): void
    {
        $this->assertSame(
            "- 2026-12-22: Winter open day (the brand's own event) — Free mini facials\n"
            . "- 2026-12-24: Christmas Eve (marketing day)\n"
            . "- 2026-12-25: Christmas Day (public holiday)\n"
            . '- 2026-12-26: Boxing Day (public holiday)',
            ContentKeyDates::forAi($this->org, $this->profile, '2026-12-21', '2026-12-27'),
        );
        $this->assertSame('- 2026-12-28: Boxing Day (public holiday, substitute day off)', ContentKeyDates::forAi($this->org, $this->profile, '2026-12-28', '2026-12-28'));
        $this->assertSame('', ContentKeyDates::forAi($this->org, $this->profile, '2026-12-23', '2026-12-23'));

        $this->profile->forceFill(['marketing_days' => false])->save();
        $this->assertStringNotContainsString('Christmas Eve', ContentKeyDates::forAi($this->org, $this->profile->fresh(), '2026-12-21', '2026-12-27'));
    }

    public function test_generate_and_fill_tell_the_ai_the_windows_key_dates(): void
    {
        config(['services.anthropic.api_key' => 'key-dates-test-key']);
        Http::preventStrayRequests();
        $prompts = [];
        Http::fake(function ($request) use (&$prompts) {
            $prompts[] = $request->body();
            $items = [['date' => '2026-12-23', 'platform' => 'instagram', 'topic' => 'Winter glow', 'draft_copy' => 'A useful draft.', 'visual_idea' => 'A candle-lit room.']];

            return Http::response(['id' => 'msg_key_dates', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
                'content' => [['type' => 'text', 'text' => json_encode(['items' => $items])]],
                'stop_reason' => 'end_turn', 'stop_sequence' => null, 'usage' => ['input_tokens' => 20, 'output_tokens' => 30]]);
        });
        $this->actingAs($this->manager);

        app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-12-21', '2026-12-27', ['platforms' => ['instagram']]);

        $this->assertCount(1, $prompts);
        $this->assertStringContainsString('KEY DATES IN THIS WINDOW', $prompts[0]);
        $this->assertStringContainsString('Christmas Day (public holiday)', $prompts[0]);
        $this->assertStringContainsString('Winter open day', $prompts[0]);
        $this->assertStringNotContainsString('Photographer', $prompts[0]);
    }

    public function test_write_tells_the_ai_the_key_dates_of_the_posts_day_only(): void
    {
        $service = app(ContentPostGenerationService::class);
        $prompt = fn ($post) => (new \ReflectionMethod($service, 'buildPostPrompt'))->invoke($service, $post, $this->profile, null);

        $christmas = $prompt($this->makePost(['scheduled_date' => '2026-12-25']));
        $this->assertStringContainsString("# KEY DATES ON THIS POST'S DAY", $christmas);
        $this->assertStringContainsString('Christmas Day (public holiday)', $christmas);
        $this->assertStringNotContainsString('Christmas Eve', $christmas);
        $this->assertStringNotContainsString('KEY DATES', $prompt($this->makePost(['scheduled_date' => null])));
        $this->assertStringNotContainsString('Photographer', $prompt($this->makePost(['scheduled_date' => '2026-12-23'])));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Feature/Content/KeyDatesAiTest.php
```

Expected: `exit 1` — `Call to undefined method App\Services\Content\ContentKeyDates::forAi()`, and the prompt tests miss `KEY DATES`.

- [ ] **Step 3: `forAi`**

In `app/Services/Content/ContentKeyDates.php`, before `public static function day`, add:

```php
    /**
     * The key dates the AI is told for a range (spec 2026-10-16 §3.6): holidays, special days (while shown) and the
     * brand's events with their details — never a note — one line each, by day; '' when there are none.
     */
    public static function forAi(Organization $org, ContentPlannerProfile $profile, string $from, string $to): string
    {
        $labels = ['holiday' => 'public holiday', 'marketing' => 'marketing day', 'industry' => 'international day'];
        $lines = [];
        foreach (self::forRange($org, $profile, $from, $to) as $day) {
            if ($day['kind'] === 'note') {
                continue;
            }
            if ($day['kind'] === 'event') {
                $details = trim((string) $day['details']);
                $when = $day['end'] !== null ? "{$day['start']} to {$day['end']}" : $day['start'];
                $lines[] = [$day['start'], "- {$when}: {$day['title']} (the brand's own event)" . ($details !== '' ? ' — ' . mb_substr($details, 0, 300) : '')];
                continue;
            }
            $label = $labels[$day['kind']] . ($day['substitute'] ? ', substitute day off' : '');
            $lines[] = [$day['date'], "- {$day['date']}: {$day['name_en']} ({$label})"];
        }
        // By day; usort is stable, so the built-in order stays within a day.
        usort($lines, fn (array $a, array $b) => strcmp($a[0], $b[0]));

        return implode("\n", array_column($lines, 1));
    }

```

- [ ] **Step 4: The calendar prompt (Generate and Fill with AI)**

In `app/Services/ContentCalendarGenerationService.php`:

1. Add `use App\Services\Content\ContentKeyDates;` to the `use` block (Edit tool).
2. Replace:

```php
        $industry = Organization::find($profile->organization_id)?->resolved_industry;
```

with:

```php
        $org = Organization::find($profile->organization_id);
        $industry = $org?->resolved_industry;
```

3. Replace (the one call of `buildChunkPrompt`):

```php
                $instructions,
                $activePlatforms
            );
```

with:

```php
                $instructions,
                $activePlatforms,
                // Spec 2026-10-16 §3.6: the window's holidays, special days and the brand's events (never notes).
                $org ? ContentKeyDates::forAi($org, $profile, $cursor->toDateString(), $chunkEnd->toDateString()) : ''
            );
```

4. Replace the end of `buildChunkPrompt`'s signature:

```php
        string $instructions,
        array $activePlatforms
    ): string {
```

with:

```php
        string $instructions,
        array $activePlatforms,
        string $keyDates = ''
    ): string {
```

5. Replace:

```php
        $instructionsBlock = $instructions !== ''
            ? "## EXTRA INSTRUCTIONS FROM THE USER\n" . $instructions
            : '';
```

with:

```php
        $instructionsBlock = $instructions !== ''
            ? "## EXTRA INSTRUCTIONS FROM THE USER\n" . $instructions
            : '';
        $keyDatesBlock = $keyDates !== ''
            ? "## KEY DATES IN THIS WINDOW (plan around them where they fit the brand; never invent other dates)\n" . $keyDates
            : '';
```

6. In the prompt's heredoc, replace:

```
Plan posts ONLY for dates from {$windowStartStr} to {$windowEndStr} (inclusive). Dates outside this window will be rejected.

## ACTIVE CHANNELS & POSTING FREQUENCY
```

with:

```
Plan posts ONLY for dates from {$windowStartStr} to {$windowEndStr} (inclusive). Dates outside this window will be rejected.

{$keyDatesBlock}

## ACTIVE CHANNELS & POSTING FREQUENCY
```

(The rest of that heading line, `(only these platforms are allowed; …)`, stays as it is.)

- [ ] **Step 5: The single-post prompt (Write the text)**

In `app/Services/ContentPostGenerationService.php`, add `use App\Models\Organization;` and `use App\Services\Content\ContentKeyDates;` to the `use` block (Edit tool), then replace:

```php
        if ($engagementGuidance !== '') {
            $prompt .= "\n\n# ENGAGEMENT GOAL MECHANICS\nDesign the engagement mechanic around the brand's priority goals:\n" . $engagementGuidance;
```

with:

```php
        // Spec 2026-10-16 §3.6: the key dates of the post's day (holidays, special days, the brand's events; never notes).
        $day = $post->scheduled_date?->format('Y-m-d');
        $org = $day !== null ? Organization::find($profile->organization_id) : null;
        $keyDates = $org !== null ? ContentKeyDates::forAi($org, $profile, $day, $day) : '';
        if ($keyDates !== '') {
            $prompt .= "\n\n# KEY DATES ON THIS POST'S DAY\nConnect the post to them only where it fits naturally:\n" . $keyDates;
        }

        if ($engagementGuidance !== '') {
            $prompt .= "\n\n# ENGAGEMENT GOAL MECHANICS\nDesign the engagement mechanic around the brand's priority goals:\n" . $engagementGuidance;
```

- [ ] **Step 6: Run the test and the AI tests that touch these services**

```bash
"$R4/php.sh" tests/Feature/Content/KeyDatesAiTest.php tests/Feature/ContentCalendar/ tests/Feature/Content/PostAiTest.php tests/Feature/Content/BestTimesTest.php
```

Expected: `KeyDatesAiTest | Tests:    3 passed`; the other three `exit 0` (CalendarGenerationTest builds a profile without a holiday country in an organisation with no zone: its prompts gain an empty block and nothing else).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentKeyDates.php app/Services/ContentCalendarGenerationService.php app/Services/ContentPostGenerationService.php tests/Feature/Content/KeyDatesAiTest.php && git commit -q -m "Content AI: Generate, Fill and Write are told the key dates (never notes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: The Ideas board's endpoint (spec §4)

**Files:**
- Create: `app/Services/Content/ContentIdeas.php`, `app/Http/Controllers/Api/V1/Admin/Content/IdeasController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Content/IdeasTest.php`

**Interfaces:**
- Consumes: `ContentPostPresenter::card` (existing).
- Produces: `ContentIdeas::COLUMNS = ['idea' => ['idea'], 'draft' => ['draft'], 'review' => ['needs_review', 'needs_visual'], 'ready' => ['approved', 'ready_to_publish']]`, `ContentIdeas::PER_COLUMN = 50`, `ContentIdeas::for(ContentPlannerProfile $profile, ?string $platform, ?int $pillarId): array{columns: array<string, array{posts: list<array>, total: int}>}`, `ContentIdeas::empty()`; `GET ideas?platform&pillar_id` (everyone). Quick capture uses the existing `POST posts` with `status: idea` and no day (it already takes any status and clears the time of a post without a day — a test pins it here; no change to `store`).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/IdeasTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPillar;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The Ideas board (spec 2026-10-16 §4): the posts without a day, in four columns by status. */
class IdeasTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return array<string, array{posts: list<array<string, mixed>>, total: int}> */
    private function ideas(string $query = ''): array
    {
        return $this->asStaffMember()->getJson($this->api('ideas' . $query))->assertOk()->json('columns');
    }

    public function test_the_board_holds_the_posts_without_a_day_in_four_columns(): void
    {
        foreach (['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'] as $status) {
            $this->makePost(['status' => $status, 'scheduled_date' => null, 'topic' => "No day {$status}"]);
        }
        $this->makePost(['status' => 'idea', 'topic' => 'Has a day']);

        $columns = $this->ideas();
        $this->assertSame(['idea', 'draft', 'review', 'ready'], array_keys($columns));
        $this->assertSame([1, 1, 2, 2], array_map(fn (array $c) => $c['total'], array_values($columns)));
        $this->assertSame('No day idea', $columns['idea']['posts'][0]['topic']);
        $this->assertEqualsCanonicalizing(['needs_review', 'needs_visual'], array_column($columns['review']['posts'], 'status'));
        $this->assertEqualsCanonicalizing(['approved', 'ready_to_publish'], array_column($columns['ready']['posts'], 'status'));
    }

    public function test_each_column_shows_its_fifty_latest_and_its_total(): void
    {
        for ($i = 0; $i < 55; $i++) {
            $post = $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'topic' => "Idea {$i}"]);
            DB::table('content_planner_posts')->where('id', $post->id)->update(['updated_at' => CarbonImmutable::parse('2026-10-01 08:00:00')->addMinutes($i)]);
        }

        $idea = $this->ideas()['idea'];
        $this->assertSame(55, $idea['total']);
        $this->assertCount(50, $idea['posts']);
        $this->assertSame('Idea 54', $idea['posts'][0]['topic']);
        $this->assertSame('Idea 5', $idea['posts'][49]['topic']);
    }

    public function test_the_board_filters_by_platform_and_pillar(): void
    {
        $pillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Education', 'active' => true]);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'platform' => 'linkedin', 'topic' => 'On LinkedIn']);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'pillar_id' => $pillar->id, 'topic' => 'Teaching']);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'topic' => 'Plain']);

        $this->assertSame(['On LinkedIn'], array_column($this->ideas('?platform=linkedin')['idea']['posts'], 'topic'));
        $this->assertSame(['Teaching'], array_column($this->ideas("?pillar_id={$pillar->id}")['idea']['posts'], 'topic'));
        $this->asStaffMember()->getJson($this->api('ideas?platform=myspace'))->assertStatus(422)->assertJsonValidationErrors('platform');
    }

    public function test_another_brands_ideas_are_not_here_and_a_brand_without_a_profile_has_an_empty_board(): void
    {
        [$second] = $this->secondBrand();
        $this->asManager()->postJson($this->api("posts?brand_id={$second}"), ['platform' => 'instagram', 'status' => 'idea', 'topic' => 'Theirs'])->assertCreated();
        $this->assertSame(0, $this->ideas()['idea']['total']);

        [$third] = $this->secondBrand(false);
        $this->assertSame(['idea' => 0, 'draft' => 0, 'review' => 0, 'ready' => 0], array_map(fn (array $c) => $c['total'], $this->ideas("?brand_id={$third}")));
    }

    public function test_quick_capture_makes_an_idea_without_a_day(): void
    {
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'idea', 'topic' => 'Behind the scenes of a facial', 'scheduled_time' => '10:00'])
            ->assertCreated()
            ->assertJsonPath('post.status', 'idea')
            ->assertJsonPath('post.scheduled_date', null)
            ->assertJsonPath('post.scheduled_time', null);

        $this->assertSame('Behind the scenes of a facial', $this->ideas()['idea']['posts'][0]['topic']);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
"$R4/php.sh" tests/Feature/Content/IdeasTest.php
```

Expected: `exit 1` — `GET ideas` answers 404 (no route); `test_quick_capture_makes_an_idea_without_a_day` fails only on its last line.

- [ ] **Step 3: `ContentIdeas` and the controller**

Write `app/Services/Content/ContentIdeas.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;

/**
 * The Ideas board (spec 2026-10-16 §4.1): the brand's posts without a day, in four columns by status, each its 50
 * most recently changed and its total. Published, skipped and archived posts stay on the Posts page.
 */
final class ContentIdeas
{
    public const COLUMNS = [
        'idea'   => ['idea'],
        'draft'  => ['draft'],
        'review' => ['needs_review', 'needs_visual'],
        'ready'  => ['approved', 'ready_to_publish'],
    ];

    public const PER_COLUMN = 50;

    /** @return array{columns: array<string, array{posts: list<array<string, mixed>>, total: int}>} */
    public static function for(ContentPlannerProfile $profile, ?string $platform, ?int $pillarId): array
    {
        $columns = [];
        foreach (self::COLUMNS as $column => $statuses) {
            $query = fn () => ContentPlannerPost::query()
                ->where('planner_profile_id', $profile->id)
                ->whereNull('scheduled_date')
                ->whereIn('status', $statuses)
                ->when($platform !== null, fn ($q) => $q->where('platform', $platform))
                ->when($pillarId !== null, fn ($q) => $q->where('pillar_id', $pillarId));
            $columns[$column] = [
                'posts' => $query()->with('visualBrief')->orderByDesc('updated_at')->orderByDesc('id')->limit(self::PER_COLUMN)->get()
                    ->map(fn (ContentPlannerPost $post) => ContentPostPresenter::card($post))->values()->all(),
                'total' => $query()->count(),
            ];
        }

        return ['columns' => $columns];
    }

    /** @return array{columns: array<string, array{posts: list<array<string, mixed>>, total: int}>} */
    public static function empty(): array
    {
        return ['columns' => array_map(fn () => ['posts' => [], 'total' => 0], self::COLUMNS)];
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/IdeasController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentIdeas;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The Ideas board for the pinned brand (spec 2026-10-16 §4): everyone reads it. */
class IdeasController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'  => ['nullable', Rule::in(ContentRules::PLATFORMS)],
            'pillar_id' => 'nullable|integer',
        ]);
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(ContentIdeas::empty());
        }

        return response()->json(ContentIdeas::for($profile, $data['platform'] ?? null, isset($data['pillar_id']) ? (int) $data['pillar_id'] : null));
    }
}
```

In `routes/api.php`, with the Edit tool, replace:

```php
                Route::get('goals', [\App\Http\Controllers\Api\V1\Admin\Content\GoalsController::class, 'show']);
```

with:

```php
                Route::get('goals', [\App\Http\Controllers\Api\V1\Admin\Content\GoalsController::class, 'show']);
                Route::get('ideas', [\App\Http\Controllers\Api\V1\Admin\Content\IdeasController::class, 'show']);
```

- [ ] **Step 4: Run the test and the posts tests**

```bash
"$R4/php.sh" tests/Feature/Content/IdeasTest.php tests/Feature/Content/PostsTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: `IdeasTest | Tests:    5 passed`; `PostsTest` and `ContentGateTest` `exit 0`.

- [ ] **Step 5: Ledger the quick-capture ruling and commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && echo "Task 7: Ruling: POST posts already takes any status and clears the time of a post without a day, so quick capture (status idea, no day) needed no server change — spec §9.2 assumed a new post was always a draft; IdeasTest pins the behaviour; 4b will limit which statuses staff may create while approvals are on — cost if wrong: none." >> "$R4/progress.md" && git add app/Services/Content/ContentIdeas.php app/Http/Controllers/Api/V1/Admin/Content/IdeasController.php routes/api.php tests/Feature/Content/IdeasTest.php && git commit -q -m "Content: the Ideas board's endpoint (posts without a day in four columns)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: Templates (spec §5.1–§5.2)

**Files:**
- Create: `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php`, `app/Models/ContentPlannerTemplate.php`, `app/Services/Content/ContentTemplates.php`, `app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php`
- Modify: `app/Models/ContentPlannerProfile.php` (relation), `app/Services/Content/ContentRules.php` (`templateFields`), `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`payload`), `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`, `tests/Feature/Content/ContentGateTest.php`
- Test: `tests/Feature/Content/TemplatesTest.php`

**Interfaces:**
- Produces:
  - table `content_planner_templates` (`organization_id`, `brand_id`, `planner_profile_id`, `name`, `platform`, `pillar_name`, `topic`, `hook`, `main_copy`, `cta`, `hashtags`, `created_by`, timestamps); model `ContentPlannerTemplate` (`MAX = 100`, `hashtags` cast to array); `ContentPlannerProfile::templates(): HasMany`.
  - `ContentTemplates::list(ContentPlannerProfile $profile): list<array>`, `ContentTemplates::one(ContentPlannerTemplate $template): array{id: int, name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}`, `ContentTemplates::find(ContentPlannerProfile $profile, int $id): ContentPlannerTemplate` (404 `not_found`).
  - `POST brand/templates` (201 `{template, templates}`), `PUT brand/templates/{id}` (`{template, templates}`), `DELETE brand/templates/{id}` (`{templates}`) — managers; 422 `too_many_templates` past 100; the brand payload's `templates` (everyone reads).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/TemplatesTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerTemplate;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Templates (spec 2026-10-16 §5): everyone reads a brand's templates, managers keep them, at most 100. */
class TemplatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    private const TEMPLATE = [
        'name' => 'Book before the date', 'platform' => 'instagram', 'pillar_name' => 'Education', 'topic' => 'A seasonal offer',
        'hook' => 'Book your [treatment] before [date]', 'main_copy' => "Our [treatment] is back.\nBook by [date].", 'cta' => 'Book now', 'hashtags' => ['#autumn'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_keeps_templates_and_everyone_reads_them(): void
    {
        $this->asManager()->postJson($this->api('brand/templates'), self::TEMPLATE)->assertCreated()
            ->assertJsonPath('template.name', 'Book before the date')
            ->assertJsonPath('template.hook', 'Book your [treatment] before [date]')
            ->assertJsonPath('templates.0.hashtags', ['#autumn']);
        $this->asManager()->postJson($this->api('brand/templates'), ['name' => 'Just a name'])->assertCreated()
            ->assertJsonPath('template.platform', null)
            ->assertJsonPath('template.hashtags', []);

        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonCount(2, 'templates')
            ->assertJsonPath('templates.0.main_copy', "Our [treatment] is back.\nBook by [date].")
            ->assertJsonPath('templates.1.name', 'Just a name');
    }

    public function test_staff_may_not_change_them(): void
    {
        $this->asStaffMember()->postJson($this->api('brand/templates'), ['name' => 'x'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_fields_and_the_hundred_are_checked(): void
    {
        $bad = fn (array $fields, string $error) => $this->asManager()->postJson($this->api('brand/templates'), $fields + ['name' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors($error);
        $bad(['name' => str_repeat('n', 81)], 'name');
        $bad(['platform' => 'myspace'], 'platform');
        $bad(['hook' => str_repeat('h', 501)], 'hook');
        $bad(['main_copy' => str_repeat('m', 5001)], 'main_copy');
        $bad(['cta' => str_repeat('c', 256)], 'cta');
        $bad(['hashtags' => array_fill(0, 31, '#a')], 'hashtags');
        $this->asManager()->postJson($this->api('brand/templates'), ['hook' => 'No name'])->assertStatus(422)->assertJsonValidationErrors('name');

        for ($i = 0; $i < 100; $i++) {
            ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => "Template {$i}"]);
        }
        $this->asManager()->postJson($this->api('brand/templates'), ['name' => 'One more'])->assertStatus(422)->assertJsonPath('error', 'too_many_templates');
    }

    public function test_a_template_is_edited_and_removed_and_another_brands_does_not_exist_here(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/templates'), self::TEMPLATE)->json('template.id');
        $this->asManager()->putJson($this->api("brand/templates/{$id}"), ['cta' => 'Call us', 'platform' => null])->assertOk()
            ->assertJsonPath('template.cta', 'Call us')
            ->assertJsonPath('template.platform', null)
            ->assertJsonPath('template.name', 'Book before the date');

        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("brand/templates?brand_id={$second}"), ['name' => 'Theirs'])->assertCreated()->json('template.id');
        $this->asManager()->putJson($this->api("brand/templates/{$theirs}"), ['name' => 'Mine now'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("brand/templates/{$theirs}"))->assertNotFound();

        $this->asManager()->deleteJson($this->api("brand/templates/{$id}"))->assertOk()->assertJsonCount(0, 'templates');
    }

    public function test_a_brand_without_a_profile_keeps_no_templates(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("brand/templates?brand_id={$second}"), ['name' => 'x'])->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()->assertJsonPath('templates', []);
    }
}
```

In `tests/Feature/Content/ContentGateTest.php` (`test_staff_are_refused_every_manager_action`), replace:

```php
            ['POST', 'brand/snippets'], ['PUT', 'brand/snippets/1'], ['DELETE', 'brand/snippets/1'], ['POST', 'brand/snippets/suggest'],
        ];
```

with:

```php
            ['POST', 'brand/snippets'], ['PUT', 'brand/snippets/1'], ['DELETE', 'brand/snippets/1'], ['POST', 'brand/snippets/suggest'],
            ['POST', 'brand/templates'], ['PUT', 'brand/templates/1'], ['DELETE', 'brand/templates/1'],
        ];
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4/php.sh" tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: both `exit 1` — `TemplatesTest` on the missing class or 404 routes; `ContentGateTest` because `brand/templates` answers 404, not 403.

- [ ] **Step 3: The migration, the model and the relation**

Write `database/migrations/2026_10_16_100200_create_content_planner_templates_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's post templates with [blanks] (spec 2026-10-16 §5): the pillar is kept by name, strategies come and go. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_templates')) {
            return;
        }
        Schema::create('content_planner_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('platform', 20)->nullable();
            $table->string('pillar_name', 255)->nullable();
            $table->string('topic', 255)->nullable();
            $table->string('hook', 500)->nullable();
            $table->text('main_copy')->nullable();
            $table->string('cta', 255)->nullable();
            $table->text('hashtags')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('planner_profile_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_templates');
    }
};
```

Write `app/Models/ContentPlannerTemplate.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** A post template of a brand's Content profile (spec 2026-10-16 §5): its fields with [blanks]; the pillar by name. */
class ContentPlannerTemplate extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /** A brand keeps at most this many templates. */
    public const MAX = 100;

    protected $fillable = ['planner_profile_id', 'brand_id', 'name', 'platform', 'pillar_name', 'topic', 'hook', 'main_copy', 'cta', 'hashtags', 'created_by'];

    protected $casts = ['hashtags' => 'array'];
}
```

In `app/Models/ContentPlannerProfile.php`, after the `keyDates()` relation from Task 4, add:

```php

    public function templates(): HasMany
    {
        return $this->hasMany(ContentPlannerTemplate::class, 'planner_profile_id');
    }
```

In `tests/Concerns/SetsUpContentSchema.php`, after the `content_planner_key_dates` block from Task 4, add:

```php
        if (!Schema::hasTable('content_planner_templates')) {
            (require database_path('migrations/2026_10_16_100200_create_content_planner_templates_table.php'))->up();
        }
```

- [ ] **Step 4: The rules, the presenter and the controller**

In `app/Services/Content/ContentRules.php`, after `keyDateFields` (Task 4), add:

```php

    /** A template (spec 2026-10-16 §5.1): a name, an optional platform and pillar, the post's fields with [blanks]. @return array<string, mixed> */
    public static function templateFields(bool $creating): array
    {
        $text = fn (int $max) => ['sometimes', 'nullable', 'string', "max:{$max}"];

        return [
            'name'        => $creating ? ['required', 'string', 'max:80'] : ['sometimes', 'string', 'max:80'],
            'platform'    => ['sometimes', 'nullable', Rule::in(self::PLATFORMS)],
            'pillar_name' => $text(255),
            'topic'       => $text(255),
            'hook'        => $text(500),
            'main_copy'   => $text(5000),
            'cta'         => $text(255),
            'hashtags'    => ['sometimes', 'nullable', 'array', 'max:30'],
            'hashtags.*'  => ['string', 'max:100'],
        ];
    }
```

Write `app/Services/Content/ContentTemplates.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerTemplate;

/** A brand's templates as the portal reads them (spec 2026-10-16 §5), in the order they were made. */
final class ContentTemplates
{
    /** @return list<array<string, mixed>> */
    public static function list(ContentPlannerProfile $profile): array
    {
        return $profile->templates()->orderBy('id')->get()
            ->map(fn (ContentPlannerTemplate $template) => self::one($template))->values()->all();
    }

    /** @return array{id: int, name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>} */
    public static function one(ContentPlannerTemplate $template): array
    {
        return [
            'id'          => (int) $template->id,
            'name'        => (string) $template->name,
            'platform'    => $template->platform,
            'pillar_name' => $template->pillar_name,
            'topic'       => $template->topic,
            'hook'        => $template->hook,
            'main_copy'   => $template->main_copy,
            'cta'         => $template->cta,
            'hashtags'    => array_values(array_map('strval', (array) ($template->hashtags ?? []))),
        ];
    }

    /** One of this brand's templates; another brand's does not exist here. */
    public static function find(ContentPlannerProfile $profile, int $id): ContentPlannerTemplate
    {
        return $profile->templates()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This template no longer exists.', 404);
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerTemplate;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A brand's templates (spec 2026-10-16 §5.2): managers keep them, at most 100; everyone reads them in the brand payload. */
class TemplateController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::templateFields(true));
        if ($profile->templates()->count() >= ContentPlannerTemplate::MAX) {
            throw new ContentRefused('too_many_templates', 'A brand keeps at most ' . ContentPlannerTemplate::MAX . ' templates.', 422);
        }
        $template = $profile->templates()->create($data + ['brand_id' => $profile->brand_id, 'created_by' => $request->user()->id]);

        return response()->json(['template' => ContentTemplates::one($template), 'templates' => ContentTemplates::list($profile)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $template = ContentTemplates::find($profile, $id);
        $template->fill($request->validate(ContentRules::templateFields(false)))->save();

        return response()->json(['template' => ContentTemplates::one($template->fresh()), 'templates' => ContentTemplates::list($profile)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        ContentTemplates::find($profile, $id)->delete();

        return response()->json(['templates' => ContentTemplates::list($profile)]);
    }
}
```

- [ ] **Step 5: The brand payload and the routes**

In `app/Http/Controllers/Api/V1/Admin/Content/BrandController.php` (`payload`, as Task 3 left it), replace:

```php
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'snippets' => [], 'voice' => null, 'readiness' => null, 'holiday_country_guess' => $guess];
```

with:

```php
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'snippets' => [], 'templates' => [], 'voice' => null, 'readiness' => null, 'holiday_country_guess' => $guess];
```

and replace:

```php
            'snippets'  => $profile->snippets()->orderBy('kind')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ContentPlannerSnippet $s) => $this->snippet($s))->values()->all(),
```

with:

```php
            'snippets'  => $profile->snippets()->orderBy('kind')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ContentPlannerSnippet $s) => $this->snippet($s))->values()->all(),
            'templates' => ContentTemplates::list($profile),
```

and add `use App\Services\Content\ContentTemplates;` to its `use` block (Edit tool).

In `routes/api.php`, with the Edit tool, replace:

```php
                Route::delete('brand/snippets/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'destroySnippet'])->whereNumber('id');
```

with:

```php
                Route::delete('brand/snippets/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\BrandController::class, 'destroySnippet'])->whereNumber('id');
                Route::post('brand/templates', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'store']);
                Route::put('brand/templates/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'update'])->whereNumber('id');
                Route::delete('brand/templates/{id}', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'destroy'])->whereNumber('id');
```

- [ ] **Step 6: Run the tests and the Brand tests**

```bash
"$R4/php.sh" tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php tests/Feature/Content/SnippetsTest.php tests/Feature/Content/BrandTest.php
```

Expected: `TemplatesTest | Tests:    5 passed`; the other three `exit 0`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_16_100200_create_content_planner_templates_table.php app/Models/ContentPlannerTemplate.php app/Models/ContentPlannerProfile.php app/Services/Content/ContentRules.php app/Services/Content/ContentTemplates.php app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php app/Http/Controllers/Api/V1/Admin/Content/BrandController.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php && git commit -q -m "Content: a brand's post templates with blanks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 9: Template suggestions from the AI (spec §5.2)

**Files:**
- Create: `app/Services/Content/ContentTemplateSuggester.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php` (`suggest`), `routes/api.php`, `tests/Feature/Content/ContentGateTest.php`
- Test: `tests/Unit/Content/TemplateSuggesterCleanTest.php`, `tests/Feature/Content/TemplatesTest.php`

**Interfaces:**
- Consumes: `ContentTemplates` (Task 8), `ContentAiGate::allow` (existing), `AiClient::generateJson` (existing).
- Produces: `ContentTemplateSuggester::suggest(ContentPlannerProfile $profile): list<array{name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}>` (non-final, mocked in tests); `ContentTemplateSuggester::clean(array $data, array $pillars): list<…>` (at most 5; a name and a hook or a text required; lengths cut; unknown platform → null; pillar kept only when it names an active pillar, ignoring case, written as the pillar is; hashtags one word with `#`, no repeats ignoring case, at most 30); `POST brand/templates/suggest` → `{suggestions}` (managers; nothing saved; `ai_failed` 502 in our words; `ai_budget_used_up` at the cap).

- [ ] **Step 1: Write the failing tests**

Write `tests/Unit/Content/TemplateSuggesterCleanTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentTemplateSuggester;
use PHPUnit\Framework\TestCase;

/** The AI's template suggestions, cleaned (spec 2026-10-16 §5.2). */
class TemplateSuggesterCleanTest extends TestCase
{
    public function test_the_answer_keeps_five_named_templates_with_text_and_cleans_each_field(): void
    {
        $data = ['templates' => [
            ['name' => '  Seasonal offer  ', 'platform' => 'Instagram', 'pillar_name' => 'education', 'topic' => 'Offer', 'hook' => 'Book your [treatment] before [date]', 'main_copy' => str_repeat('m', 5100), 'cta' => 'Book now', 'hashtags' => ['autumn', '#Autumn', '#copper hair', '']],
            ['name' => '', 'hook' => 'No name'],
            ['name' => 'No text', 'cta' => 'Only a call to action'],
            ['name' => 'Unknown platform', 'platform' => 'myspace', 'pillar_name' => 'Gossip', 'main_copy' => 'Text'],
            'not a template',
            ['name' => 'Four', 'hook' => 'h'], ['name' => 'Five', 'hook' => 'h'], ['name' => 'Six', 'hook' => 'h'], ['name' => 'Seven', 'hook' => 'h'],
        ]];

        $clean = ContentTemplateSuggester::clean($data, ['Education', 'Behind the scenes']);

        $this->assertSame(['Seasonal offer', 'Unknown platform', 'Four', 'Five', 'Six'], array_column($clean, 'name'));
        $this->assertSame('instagram', $clean[0]['platform']);
        $this->assertSame('Education', $clean[0]['pillar_name']);
        $this->assertSame(5000, mb_strlen($clean[0]['main_copy']));
        $this->assertSame(['#autumn', '#copperhair'], $clean[0]['hashtags']);
        $this->assertNull($clean[1]['platform']);
        $this->assertNull($clean[1]['pillar_name']);
        $this->assertNull($clean[1]['hook']);
        $this->assertSame([], $clean[2]['hashtags']);
        $this->assertSame([], ContentTemplateSuggester::clean(['nothing' => true], []));
    }
}
```

In `tests/Feature/Content/TemplatesTest.php`, add `use App\Services\Content\ContentTemplateSuggester;` and `use Mockery;` to the `use` block (Edit tool), and before the class's last closing brace add:

```php

    public function test_a_manager_gets_template_suggestions_and_nothing_is_saved(): void
    {
        $suggester = Mockery::mock(ContentTemplateSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andReturn([[
            'name' => 'Seasonal offer', 'platform' => 'instagram', 'pillar_name' => null, 'topic' => null,
            'hook' => 'Book your [treatment] before [date]', 'main_copy' => null, 'cta' => null, 'hashtags' => [],
        ]]);
        $this->app->instance(ContentTemplateSuggester::class, $suggester);

        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertOk()
            ->assertJsonPath('suggestions.0.name', 'Seasonal offer')
            ->assertJsonPath('suggestions.0.hook', 'Book your [treatment] before [date]');
        $this->assertSame(0, ContentPlannerTemplate::count());
    }

    public function test_suggestions_are_for_managers_fail_in_our_words_and_wait_at_the_budget_cap(): void
    {
        $suggester = Mockery::mock(ContentTemplateSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ContentTemplateSuggester::class, $suggester);

        $this->asStaffMember()->postJson($this->api('brand/templates/suggest'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');
        $this->setAiCap(100, 120);
        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }
```

In `tests/Feature/Content/ContentGateTest.php`, replace:

```php
            ['POST', 'brand/templates'], ['PUT', 'brand/templates/1'], ['DELETE', 'brand/templates/1'],
```

with:

```php
            ['POST', 'brand/templates'], ['PUT', 'brand/templates/1'], ['DELETE', 'brand/templates/1'], ['POST', 'brand/templates/suggest'],
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4/php.sh" tests/Unit/Content/TemplateSuggesterCleanTest.php tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: all three `exit 1` — the class is missing and `brand/templates/suggest` has no route.

- [ ] **Step 3: Write the suggester**

Write `app/Services/Content/ContentTemplateSuggester.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\ContentPlanner\AiClient;

/**
 * Proposes post templates for a brand from its industry, pillars and audiences (spec 2026-10-16 §5.2): one AI call,
 * in the brand's language, details left as [blanks]; nothing saved. Not final, so tests mock it.
 */
class ContentTemplateSuggester
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return list<array{name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}> */
    public function suggest(ContentPlannerProfile $profile): array
    {
        $pillars = ContentPlannerPillar::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->map(fn ($n) => (string) $n)->all();

        return self::clean($this->ai->generateJson($profile, 'template_suggest', $this->prompt($profile, $pillars), 4000), $pillars);
    }

    /**
     * The AI's answer as at most 5 templates: a name (80) and a hook (500) or a text (5,000) are required; a topic and
     * a call to action are cut to 255; an unknown platform becomes none; a pillar is kept only when it names one of
     * the active pillars (ignoring case), written as the pillar is; hashtags are one word with "#", no repeats
     * (ignoring case), at most 30. Anything else is dropped.
     *
     * @param list<string> $pillars
     * @return list<array{name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}>
     */
    public static function clean(array $data, array $pillars): array
    {
        $templates = [];
        foreach ((array) ($data['templates'] ?? []) as $template) {
            if (!is_array($template)) {
                continue;
            }
            $name = self::text($template, 'name', 80);
            $hook = self::text($template, 'hook', 500);
            $text = self::text($template, 'main_copy', 5000);
            if ($name === null || ($hook === null && $text === null)) {
                continue;
            }
            $platform = mb_strtolower(trim((string) ($template['platform'] ?? '')));
            $pillar = mb_strtolower(trim((string) ($template['pillar_name'] ?? '')));
            $matched = null;
            foreach ($pillars as $candidate) {
                if ($pillar !== '' && mb_strtolower($candidate) === $pillar) {
                    $matched = $candidate;
                    break;
                }
            }
            $tags = [];
            foreach ((array) ($template['hashtags'] ?? []) as $tag) {
                $tag = '#' . ltrim((string) preg_replace('/\s+/u', '', (string) $tag), '#');
                if ($tag !== '#' && !in_array(mb_strtolower($tag), array_map('mb_strtolower', $tags), true)) {
                    $tags[] = mb_substr($tag, 0, 100);
                }
            }
            $templates[] = [
                'name'        => $name,
                'platform'    => in_array($platform, ContentRules::PLATFORMS, true) ? $platform : null,
                'pillar_name' => $matched,
                'topic'       => self::text($template, 'topic', 255),
                'hook'        => $hook,
                'main_copy'   => $text,
                'cta'         => self::text($template, 'cta', 255),
                'hashtags'    => array_slice($tags, 0, 30),
            ];
        }

        return array_slice($templates, 0, 5);
    }

    private static function text(array $template, string $key, int $max): ?string
    {
        $value = trim((string) ($template[$key] ?? ''));

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    /** @param list<string> $pillars */
    private function prompt(ContentPlannerProfile $profile, array $pillars): string
    {
        $audiences = ContentPlannerAudience::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $industry = Organization::find($profile->organization_id)?->resolved_industry ?? 'other';
        $language = $profile->default_language ?: 'en';
        $platforms = implode(', ', ContentRules::PLATFORMS);

        return "You write reusable post templates for the social media of a {$industry} business.\n"
            . "Brand: {$profile->name}. Content pillars: " . ($pillars !== [] ? implode(', ', $pillars) : 'none yet') . '. Audiences: ' . ($audiences ?: 'none yet') . ".\n"
            . "Write 3 to 5 templates in the language '{$language}'. A template is a post shape the team reuses: a short name, an optional platform (one of: {$platforms}), "
            . "the pillar it serves (one of the pillars above, written exactly, or empty), a topic, a hook, the main text and a call to action, and up to 10 relevant hashtags.\n"
            . "Put every detail that changes from post to post in square brackets as a blank, at most 40 characters inside, e.g. [treatment], [date], [price]. Never invent prices, dates or facts.\n"
            . 'Return ONLY JSON: {"templates": [{"name": "...", "platform": "instagram", "pillar_name": "...", "topic": "...", "hook": "...", "main_copy": "...", "cta": "...", "hashtags": ["#..."]}]}';
    }
}
```

- [ ] **Step 4: The endpoint and its route**

In `app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php`, add `use App\Services\Content\ContentAiGate;` and `use App\Services\Content\ContentTemplateSuggester;` to the `use` block (Edit tool), and after `destroy` add:

```php

    /** Templates the AI proposes for this brand (spec 2026-10-16 §5.2): suggestions only, nothing is saved. */
    public function suggest(Request $request, ContentAiGate $gate, ContentTemplateSuggester $suggester): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        set_time_limit(120);
        try {
            $suggestions = $suggester->suggest($profile);
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }

        return response()->json(['suggestions' => $suggestions]);
    }
```

In `routes/api.php`, with the Edit tool, replace:

```php
                Route::post('brand/templates', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'store']);
```

with:

```php
                Route::post('brand/templates/suggest', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'suggest']);
                Route::post('brand/templates', [\App\Http\Controllers\Api\V1\Admin\Content\TemplateController::class, 'store']);
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
"$R4/php.sh" tests/Unit/Content/TemplateSuggesterCleanTest.php tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php
```

Expected: `TemplateSuggesterCleanTest | Tests:    1 passed`, `TemplatesTest | Tests:    7 passed`, `ContentGateTest` `exit 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentTemplateSuggester.php app/Http/Controllers/Api/V1/Admin/Content/TemplateController.php routes/api.php tests/Unit/Content/TemplateSuggesterCleanTest.php tests/Feature/Content/TemplatesTest.php tests/Feature/Content/ContentGateTest.php && git commit -q -m "Content AI: template suggestions with blanks, nothing saved" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 10: Write with AI from a template (spec §5.3)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php` (`write`), `app/Services/ContentPostGenerationService.php` (`generate`, `buildPostPrompt`)
- Test: `tests/Feature/Content/PostAiTest.php`, `tests/Feature/Content/TemplatePromptTest.php`

**Interfaces:**
- Consumes: `ContentTemplates::find` (Task 8).
- Produces: `POST posts/{id}/write` accepts `template_id` (integer; another brand's → 404 `not_found` before any AI call); `ContentPostGenerationService::generate(ContentPlannerPost $post, ?string $instructions = null, ?ContentPlannerTemplate $template = null): array`; `buildPostPrompt(…, ?ContentPlannerTemplate $template = null)` adds `# TEMPLATE TO FOLLOW` (the template's hook, text, call to action and hashtags; replace every [blank] from the brand context, never invent) when the template holds any of them. The post's status ends as Write the text leaves it today (`needs_review`).

- [ ] **Step 1: Write the failing tests**

In `tests/Feature/Content/PostAiTest.php`, add `use App\Models\ContentPlannerTemplate;` to the `use` block (Edit tool), and before the class's last closing brace add:

```php

    // Spec 2026-10-16 §5.3: "Write with AI" from a template of this brand.
    public function test_write_follows_a_template_of_this_brand(): void
    {
        $post = $this->makePost();
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Seasonal offer', 'hook' => 'Book your [treatment] before [date]']);
        $this->mockPosts()->shouldReceive('generate')->once()->andReturnUsing(function (ContentPlannerPost $p, ?string $instructions, ?ContentPlannerTemplate $used) use ($template) {
            $this->assertNull($instructions);
            $this->assertSame((int) $template->id, (int) $used?->id);
            $p->update(['hook' => 'Book your colour refresh before Friday', 'status' => 'needs_review']);

            return ['post' => $p->fresh(['visualBrief']), 'ai_response' => []];
        });

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"), ['template_id' => $template->id])
            ->assertOk()
            ->assertJsonPath('post.hook', 'Book your colour refresh before Friday');
    }

    public function test_another_brands_template_cannot_steer_the_ai(): void
    {
        $post = $this->makePost();
        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("brand/templates?brand_id={$second}"), ['name' => 'Theirs', 'hook' => 'Theirs'])->json('template.id');
        $this->mockPosts()->shouldNotReceive('generate');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"), ['template_id' => $theirs])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"), ['template_id' => 'first'])->assertStatus(422)->assertJsonValidationErrors('template_id');
    }
```

Write `tests/Feature/Content/TemplatePromptTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerTemplate;
use App\Services\ContentPostGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What the AI is told when it writes from a template (spec 2026-10-16 §5.3). */
class TemplatePromptTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function prompt(?ContentPlannerTemplate $template): string
    {
        $service = app(ContentPostGenerationService::class);

        return (new \ReflectionMethod($service, 'buildPostPrompt'))->invoke($service, $this->makePost(), $this->profile, null, $template);
    }

    public function test_write_from_a_template_tells_the_ai_its_shape_and_to_fill_its_blanks(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Seasonal offer',
            'hook' => 'Book your [treatment] before [date]', 'main_copy' => 'Our [treatment] is back.', 'cta' => 'Book now', 'hashtags' => ['#autumn', '#glow']]);

        $with = $this->prompt($template);
        $this->assertStringContainsString('# TEMPLATE TO FOLLOW', $with);
        $this->assertStringContainsString('Hook: Book your [treatment] before [date]', $with);
        $this->assertStringContainsString('Main text: Our [treatment] is back.', $with);
        $this->assertStringContainsString('Call to action: Book now', $with);
        $this->assertStringContainsString('Hashtags: #autumn #glow', $with);
        $this->assertStringContainsString('replace every [blank]', $with);
        $this->assertStringNotContainsString('TEMPLATE TO FOLLOW', $this->prompt(null));
    }

    public function test_a_template_with_only_a_name_adds_nothing(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Empty']);

        $this->assertStringNotContainsString('TEMPLATE TO FOLLOW', $this->prompt($template));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```bash
"$R4/php.sh" tests/Feature/Content/PostAiTest.php tests/Feature/Content/TemplatePromptTest.php
```

Expected: `PostAiTest` `exit 1` (the template reaches `generate` as nothing; `template_id: 'first'` is not refused); `TemplatePromptTest` `exit 1` (no `TEMPLATE TO FOLLOW`).

- [ ] **Step 3: The endpoint takes the template**

In `app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php`, replace:

```php
    public function write(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000']);
        $post = $this->prepare($request, $id);
        $this->run(fn () => $posts->generate($post, $data['instructions'] ?? null));

        return $this->post($post);
    }
```

with:

```php
    public function write(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000', 'template_id' => 'nullable|integer']);
        $post = $this->prepare($request, $id);
        // Spec 2026-10-16 §5.3: "Write with AI" from one of this brand's templates; another brand's does not exist here.
        $template = isset($data['template_id']) ? ContentTemplates::find(ContentContext::requireProfile(), (int) $data['template_id']) : null;
        $this->run(fn () => $posts->generate($post, $data['instructions'] ?? null, $template));

        return $this->post($post);
    }
```

and add `use App\Services\Content\ContentTemplates;` to its `use` block (Edit tool; `ContentContext` is imported already).

- [ ] **Step 4: The prompt follows the template**

In `app/Services/ContentPostGenerationService.php`, add `use App\Models\ContentPlannerTemplate;` to the `use` block (Edit tool), then replace:

```php
    public function generate(ContentPlannerPost $post, ?string $instructions = null): array
    {
        $profile = $post->profile;

        $prompt = $this->buildPostPrompt($post, $profile, $instructions);
```

with:

```php
    public function generate(ContentPlannerPost $post, ?string $instructions = null, ?ContentPlannerTemplate $template = null): array
    {
        $profile = $post->profile;

        $prompt = $this->buildPostPrompt($post, $profile, $instructions, $template);
```

replace:

```php
    protected function buildPostPrompt(ContentPlannerPost $post, ContentPlannerProfile $profile, ?string $instructions = null): string
```

with:

```php
    protected function buildPostPrompt(ContentPlannerPost $post, ContentPlannerProfile $profile, ?string $instructions = null, ?ContentPlannerTemplate $template = null): string
```

and replace (the line Task 6 left just before the engagement block):

```php
        if ($engagementGuidance !== '') {
            $prompt .= "\n\n# ENGAGEMENT GOAL MECHANICS\nDesign the engagement mechanic around the brand's priority goals:\n" . $engagementGuidance;
```

with:

```php
        // Spec 2026-10-16 §5.3: write in the shape of the brand's template, its [blanks] filled from the brand context.
        $shape = $template === null ? [] : array_filter([
            'Hook' => $template->hook,
            'Main text' => $template->main_copy,
            'Call to action' => $template->cta,
            'Hashtags' => implode(' ', array_map('strval', (array) ($template->hashtags ?? []))),
        ], fn ($value) => trim((string) $value) !== '');
        if ($shape !== []) {
            $prompt .= "\n\n# TEMPLATE TO FOLLOW\nWrite this post in the shape of the brand's template below. Keep its structure and intent; "
                . "replace every [blank] with a concrete detail from the brand context. Never leave square brackets, and never invent "
                . "prices, dates or facts the context does not give: write around a detail you do not know.\n";
            foreach ($shape as $label => $value) {
                $prompt .= "{$label}: {$value}\n";
            }
        }

        if ($engagementGuidance !== '') {
            $prompt .= "\n\n# ENGAGEMENT GOAL MECHANICS\nDesign the engagement mechanic around the brand's priority goals:\n" . $engagementGuidance;
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
"$R4/php.sh" tests/Feature/Content/PostAiTest.php tests/Feature/Content/TemplatePromptTest.php tests/Feature/Content/KeyDatesAiTest.php
```

Expected: `PostAiTest` `exit 0` (its earlier tests unchanged: their `generate` closures take two arguments, and PHP passes the third without complaint), `TemplatePromptTest | Tests:    2 passed`, `KeyDatesAiTest | Tests:    3 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Http/Controllers/Api/V1/Admin/Content/PostAiController.php app/Services/ContentPostGenerationService.php tests/Feature/Content/PostAiTest.php tests/Feature/Content/TemplatePromptTest.php && git commit -q -m "Content AI: write a post following one of the brand's templates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 11: The runbook and the regression run

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:**
- Consumes: everything above. Produces nothing new for code; Plan 4A-2 reads the runbook lines.

- [ ] **Step 1: The runbook**

In `docs/content-workspace.md`, replace:

```
  day's "+", repeat one post weekly for a month and stop it; check the goals line on the Plan.
```

with:

```
  day's "+", repeat one post weekly for a month and stop it; check the goals line on the Plan.
- Release 4a (server, Plan 4A-1): three additive migrations (`content_planner_profiles.holiday_country` and
  `marketing_days`, `content_planner_key_dates`, `content_planner_templates`); nothing existing changes. Built-in days
  come from our own rule table in `app/Services/Content/Days/`: the public holidays of GB, IE, DE, FR, ES, LV, LT, EE
  and US with their substitute and observed days, marketing days by country, international days by industry. A brand
  that never chose a country gets a guess (the organisation's country, else the venue's time zone); `none` means no
  holidays. A one-off holiday (a coronation bank holiday, Latvia's day after a Song Festival) is one rule line in
  `PublicHolidays::RULES`, its English name in `DayNames::EN` and its words in the five bundles.
- Key dates reach the AI (Generate, Fill with AI, Write the text): holidays, special days and the brand's events with
  their details; notes never do. Templates and their AI suggestions are counted in the AI budget like every other call.
- Verify release 4a by content (after Plan 4A-2's deploy): `/api/v1/admin/content/ideas` answers 401 when signed out
  (404 before release 4a); the `ContentApp` chunk carries the Ideas page's and the Key dates section's words.
```

- [ ] **Step 2: The regression run**

```bash
cd /c/wamp64/www/Hexa-Tech-content && "$R4/php.sh" tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/ tests/Unit/Support/ | tee "$R4/final-php.txt"
```

Expected: five lines, each `exit 0` (Feature Content = 125 at release 3 + 33 from this plan; Unit Content = 11 + 57).

- [ ] **Step 3: Commit and ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 4a's server (built-in days, key dates, ideas, templates)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && echo "Task 11: note: regression $(grep -c 'exit 0' "$R4/final-php.txt")/5 paths green (final-php.txt)" >> "$R4/progress.md"
```
