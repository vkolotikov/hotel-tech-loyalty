<?php

namespace Tests\Feature\TimeWorkspace;

use App\Models\User;
use App\Services\Time\Buddies;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * Buddies (2026-11-28): the character a person is shown with in recognition — their own choice or one by their account,
 * none when they chose none or the organisation switched characters off — and the one field of a planner profile a
 * person writes for themselves.
 *
 * Today is Friday 6 November 2026, 12:00 in Riga (the week runs from Monday the 2nd).
 */
class BuddiesTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        config(['admin_access.mode' => 'enforce']);
        $this->travelTo(CarbonImmutable::parse('2026-11-06 10:00:00', 'UTC'));
        // Everyone has work this week and the whole table is open, so everyone sees everyone's row (who sees which
        // rows is RecognitionTest's; a row that is not shown carries no character either, being absent).
        foreach ([$this->anna, $this->boris, $this->staffMember, $this->manager] as $i => $who) {
            $this->doneTask(['assigned_to_user_id' => $who->id, 'task_date' => '2026-11-03'], 30 * ($i + 1));
        }
        $this->setting('planner_recognition', 'ranking');
    }

    private function seenBy(User $user): array
    {
        return $this->actingAs($user, 'sanctum')->getJson($this->timeApi('recognition'))->assertOk()->json();
    }

    private function choose(User $user, string $buddy)
    {
        return $this->actingAs($user, 'sanctum')->putJson($this->timeApi('buddy'), ['buddy' => $buddy]);
    }

    private function profileOf(User $user): array
    {
        return json_decode((string) DB::table('staff')->where('user_id', $user->id)->value('planner_profile'), true) ?? [];
    }

    public function test_someone_who_never_chose_is_shown_a_character_by_their_account_the_same_one_for_everyone(): void
    {
        $seen = $this->seenBy($this->anna);

        $this->assertTrue($seen['buddies']);
        $expected = Buddies::KINDS[$this->anna->id % count(Buddies::KINDS)];
        $this->assertSame($expected, $seen['me']['buddy']);
        $this->assertNull($seen['me']['buddy_choice'], 'nothing was chosen yet');
        // Every row carries a character, and Boris sees Anna with the one she sees herself.
        $rows = collect($this->seenBy($this->boris)['ranking'])->keyBy('person');
        $this->assertSame($expected, $rows['u' . $this->anna->id]['buddy']);
        foreach ($rows as $row) {
            $this->assertContains($row['buddy'], Buddies::KINDS);
        }
        // Accounts next to each other get different characters: a team is varied without anyone setting anything up.
        $this->assertNotSame(Buddies::shown(['user_id' => 10, 'profile' => []]), Buddies::shown(['user_id' => 11, 'profile' => []]));
        $this->assertNull(Buddies::shown(['user_id' => null, 'profile' => []]), 'a name without an account has none');
    }

    public function test_a_person_chooses_their_own_character_or_none_and_everyone_sees_it(): void
    {
        $this->choose($this->anna, 'ember')->assertOk()->assertJson(['buddy' => 'ember']);

        $mine = $this->seenBy($this->anna);
        $this->assertSame(['ember', 'ember'], [$mine['me']['buddy'], $mine['me']['buddy_choice']]);
        $this->assertSame('ember', collect($this->seenBy($this->boris)['ranking'])->firstWhere('person', 'u' . $this->anna->id)['buddy']);
        // Boris's own is still his by his account: the choice was Anna's alone.
        $this->assertNull($this->seenBy($this->boris)['me']['buddy_choice']);

        // None: no character for her anywhere, and the choice is remembered as a choice.
        $this->choose($this->anna, 'none')->assertOk();
        $mine = $this->seenBy($this->anna);
        $this->assertSame([null, 'none'], [$mine['me']['buddy'], $mine['me']['buddy_choice']]);
        $this->assertNull(collect($this->seenBy($this->boris)['ranking'])->firstWhere('person', 'u' . $this->anna->id)['buddy']);
    }

    public function test_only_a_character_that_exists_can_be_chosen_and_only_for_oneself(): void
    {
        $this->choose($this->anna, 'dragon')->assertStatus(422);
        $this->choose($this->anna, '')->assertStatus(422);
        $this->actingAs($this->anna, 'sanctum')->putJson($this->timeApi('buddy'), [])->assertStatus(422);
        $this->assertArrayNotHasKey('buddy', $this->profileOf($this->anna));

        // There is no way to name somebody else: the endpoint takes no person, and a manager's profile form no buddy.
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['buddy' => 'kit', 'knowledge' => 'Speaks Latvian'])->assertOk();
        $this->assertNull($this->seenBy($this->anna)['me']['buddy_choice']);
        // Signed out, nothing.
        $this->app['auth']->forgetGuards();
        $this->putJson($this->timeApi('buddy'), ['buddy' => 'kit'])->assertStatus(401);
    }

    public function test_a_choice_keeps_the_rest_of_the_profile_and_a_managers_save_keeps_the_choice(): void
    {
        DB::table('staff')->where('user_id', $this->anna->id)->update(['planner_profile' => json_encode([
            'knowledge' => 'Deep cleans', 'work_start' => '07:00', 'work_end' => '15:00', 'work_days' => [1, 2, 3], 'break_minutes' => 30,
            'job_title' => 'Housekeeper', 'level' => 'senior', 'strengths' => 'Fast', 'develop' => 'Languages',
        ])]);

        $this->choose($this->anna, 'kit')->assertOk();

        $profile = $this->profileOf($this->anna);
        $this->assertSame('kit', $profile['buddy']);
        $this->assertSame(['Deep cleans', '07:00', '15:00', [1, 2, 3], 30, 'Housekeeper', 'senior', 'Fast', 'Languages'], [
            $profile['knowledge'], $profile['work_start'], $profile['work_end'], $profile['work_days'], $profile['break_minutes'],
            $profile['job_title'], $profile['level'], $profile['strengths'], $profile['develop'],
        ]);
        $this->assertArrayNotHasKey('skills', $profile, 'skills stay a column of their own');
        $this->assertSame(json_encode(['Housekeeping']), DB::table('staff')->where('user_id', $this->anna->id)->value('planner_skills'));

        // A manager changes her hours: the character she chose is still hers.
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['work_start' => '08:00', 'knowledge' => 'Deep cleans, stains'])->assertOk();
        $profile = $this->profileOf($this->anna);
        $this->assertSame(['kit', '08:00', 'Deep cleans, stains'], [$profile['buddy'], $profile['work_start'], $profile['knowledge']]);
        $this->assertSame('kit', $this->seenBy($this->anna)['me']['buddy']);
    }

    public function test_the_organisation_switches_characters_off_for_everyone_and_only_a_manager_may(): void
    {
        $this->choose($this->anna, 'pip')->assertOk();
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertJsonPath('settings.buddies', true);
        $this->assertSame('on', $this->asStaffMember()->getJson($this->timeApi('settings'))->json('planner_buddies'));

        $this->asStaffMember()->putJson($this->timeApi('settings/planner_buddies'), ['value' => 'off'])->assertStatus(403);
        $this->asManager()->putJson($this->timeApi('settings/planner_buddies'), ['value' => 'maybe'])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/planner_buddies'), ['value' => 'off'])->assertOk()->assertJsonPath('value', 'off');

        $seen = $this->seenBy($this->anna);
        $this->assertFalse($seen['buddies']);
        $this->assertNull($seen['me']['buddy']);
        $this->assertSame('pip', $seen['me']['buddy_choice'], 'her choice is kept for the day they come back');
        $this->assertSame([null], array_values(array_unique(array_column($seen['ranking'], 'buddy'))));
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertJsonPath('settings.buddies', false);
        $this->assertSame('off', $this->asStaffMember()->getJson($this->timeApi('settings'))->json('planner_buddies'));
        // The points are untouched: a character is only a picture.
        $this->assertGreaterThan(0, $seen['me']['week']['points']);

        $this->asManager()->putJson($this->timeApi('settings/planner_buddies'), ['value' => 'on'])->assertOk();
        $this->assertSame('pip', $this->seenBy($this->anna)['me']['buddy']);
    }

    public function test_another_organisations_person_is_not_reached_and_recognition_switched_off_answers_no_character(): void
    {
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        $stranger = DB::table('users')->insertGetId(['organization_id' => $other, 'name' => 'Stranger', 'email' => 's' . uniqid() . '@example.test', 'password' => 'x', 'user_type' => 'staff', 'created_at' => now(), 'updated_at' => now()]);
        $strangerStaff = DB::table('staff')->insertGetId(['organization_id' => $other, 'user_id' => $stranger, 'role' => 'staff', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->choose($this->anna, 'hexi')->assertOk();

        $this->assertNull(DB::table('staff')->where('id', $strangerStaff)->value('planner_profile'), 'nobody else\'s row is written');
        $this->assertSame(1, DB::table('staff')->whereNotNull('planner_profile')->where('planner_profile', 'like', '%hexi%')->count());

        // Where staff see only the top three and themselves, the others' characters are not sent either.
        $this->setting('planner_recognition', 'podium');
        $podium = $this->seenBy($this->anna);
        $this->assertCount(4, $podium['ranking']);
        $this->setting('planner_recognition', 'own');
        $own = $this->seenBy($this->anna);
        $this->assertSame(['u' . $this->anna->id], array_column($own['ranking'], 'person'));
        $this->assertSame('hexi', $own['ranking'][0]['buddy']);

        $this->setting('planner_recognition', 'off');
        $this->assertSame(['mode' => 'off', 'manager' => false], $this->seenBy($this->anna));
    }
}
