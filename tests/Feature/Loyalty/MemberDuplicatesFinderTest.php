<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Services\MemberMergeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * MemberMergeService::findDuplicates(), shared by the full admin's duplicates screen and HexaTech Loyalty's. Written
 * against the code that loaded every member into PHP (release 4 part E pinned it before grouping moved into the
 * database): the same pairs, in the same order, with the same suggested keeper — the oldest member of a group — and
 * the same reason, an email match before a phone match, a pair listed once.
 */
class MemberDuplicatesFinderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    /** A member with exactly this email and phone, written at a given minute after the clock's now. */
    private function person(string $name, ?string $email, ?string $phone, int $minute): LoyaltyMember
    {
        $member = $this->makeMember($name, 'x@example.test');
        DB::table('users')->where('id', $member->user_id)->update(['email' => $email ?? 'none-' . $member->id . '@example.test', 'phone' => $phone]);
        $member->forceFill(['created_at' => now()->addMinutes($minute)])->save();

        return $member;
    }

    /** @return list<array{0: string, 1: int, 2: int}> reason, kept id, other id — in the order found. */
    private function found(int $limit = 50): array
    {
        return array_map(fn (array $p) => [$p['reason'], (int) $p['winner']->id, (int) $p['loser']->id],
            app(MemberMergeService::class)->findDuplicates($limit, $this->org->id));
    }

    public function test_an_email_in_another_case_or_with_spaces_around_it_is_the_same_and_the_oldest_is_kept(): void
    {
        $older = $this->person('Old Olive', 'olive@example.test', null, -60);
        $newer = $this->person('New Olive', '  OLIVE@Example.TEST ', null, 10);
        $third = $this->person('Third Olive', 'Olive@example.test', null, 5);

        $this->assertSame([
            ['shared_email', $older->id, $third->id],
            ['shared_email', $older->id, $newer->id],
        ], $this->found());
    }

    public function test_a_phone_matches_by_its_digits_from_seven_whatever_the_separators(): void
    {
        $a = $this->person('Phone A', 'a@example.test', '+371 26 123 456', 1);
        $b = $this->person('Phone B', 'b@example.test', '(+371) 26-123-456', 2);
        $c = $this->person('Phone C', 'c@example.test', '371.26.123.456', 3);
        $d = $this->person('Phone D', 'd@example.test', 'tel: 371/26 123 456 (mobile)', 4);
        // Six digits are too few to be sure; the same six digits are no match.
        $this->person('Short E', 'e@example.test', '12-34-56', 5);
        $this->person('Short F', 'f@example.test', '123456', 6);
        // Empty phones never match one another.
        $this->person('Blank G', 'g@example.test', '', 7);
        $this->person('Blank H', 'h@example.test', '', 8);

        $this->assertSame([
            ['shared_phone', $a->id, $b->id],
            ['shared_phone', $a->id, $c->id],
            ['shared_phone', $a->id, $d->id],
        ], $this->found());
    }

    public function test_an_odd_phone_alone_in_the_database_still_finds_its_plain_twin(): void
    {
        $plain = $this->person('Plain', 'plain@example.test', '4420794600', 1);
        $odd = $this->person('Odd', 'odd@example.test', 'Tel 44 207 946 00 / home', 2);
        $oddTwin = $this->person('Odd twin', 'oddtwin@example.test', 'mob: 7700 900 123', 3);
        $oddTwo = $this->person('Odd two', 'oddtwo@example.test', '7700#900#123', 4);

        $this->assertSame([
            ['shared_phone', $plain->id, $odd->id],
            ['shared_phone', $oddTwin->id, $oddTwo->id],
        ], $this->found());
    }

    public function test_a_pair_matching_on_email_and_phone_is_listed_once_as_an_email_match_and_email_matches_come_first(): void
    {
        // A phone group that starts before any email group: it is still listed after every email match.
        $p1 = $this->person('Phone first', 'p1@example.test', '555 0101 222', -100);
        $p2 = $this->person('Phone second', 'p2@example.test', '5550101222', -90);
        $e1 = $this->person('Both one', 'both@example.test', '+1 222 333 4444', 1);
        $e2 = $this->person('Both two', 'BOTH@example.test', '1-222-333-4444', 2);

        $this->assertSame([
            ['shared_email', $e1->id, $e2->id],
            ['shared_phone', $p1->id, $p2->id],
        ], $this->found());
    }

    public function test_groups_are_found_in_the_order_of_their_oldest_member_and_the_limit_cuts_the_list(): void
    {
        $g2a = $this->person('Group two A', 'two@example.test', null, 20);
        $g1a = $this->person('Group one A', 'one@example.test', null, 10);
        $g2b = $this->person('Group two B', 'Two@example.test', null, 30);
        $g1b = $this->person('Group one B', 'One@example.test', null, 40);
        $g1c = $this->person('Group one C', 'ONE@example.test', null, 50);

        $this->assertSame([
            ['shared_email', $g1a->id, $g1b->id],
            ['shared_email', $g1a->id, $g1c->id],
            ['shared_email', $g2a->id, $g2b->id],
        ], $this->found());
        $this->assertSame([['shared_email', $g1a->id, $g1b->id], ['shared_email', $g1a->id, $g1c->id]], $this->found(2));
    }

    public function test_members_written_at_the_same_moment_keep_the_first_written(): void
    {
        $first = $this->person('Same first', 'same@example.test', null, 5);
        $second = $this->person('Same second', 'SAME@example.test', null, 5);

        $this->assertSame([['shared_email', $first->id, $second->id]], $this->found());
    }

    public function test_only_this_organisations_members_and_only_members_with_a_user_are_paired(): void
    {
        $mine = $this->person('Mine', 'shared@example.test', '+372 5555 6666', 1);
        $other = $this->otherOrganization();
        DB::table('users')->where('id', $other['member']->user_id)->update(['email' => 'SHARED@example.test', 'phone' => '37255556666']);
        $orphan = $this->person('Orphan', 'orphan@example.test', '37255556666', 2);
        DB::table('loyalty_members')->where('id', $orphan->id)->update(['user_id' => null]);

        $this->assertSame([], $this->found());
        $this->assertSame([], app(MemberMergeService::class)->findDuplicates(50, 0));
        $this->assertNotNull($mine);
    }

    public function test_only_the_members_in_a_group_of_two_or_more_are_loaded(): void
    {
        foreach (range(1, 12) as $i) {
            $this->person("Single {$i}", "single{$i}@example.test", '+1 555 000 ' . str_pad((string) $i, 4, '0', STR_PAD_LEFT), $i);
        }
        $a = $this->person('Pair A', 'pair@example.test', null, 20);
        $b = $this->person('Pair B', 'PAIR@example.test', null, 21);
        $c = $this->person('Phone C', 'c@example.test', '+1 555 999 8888', 22);
        $d = $this->person('Odd D', 'd@example.test', 'mobile 1 555 999 8888', 23);

        $candidates = new \ReflectionMethod(MemberMergeService::class, 'candidates');
        $loaded = array_map(fn ($row) => (int) $row->id, $candidates->invoke(null, $this->org->id));

        $this->assertSame([$a->id, $b->id, $c->id, $d->id], $loaded);
    }

    public function test_a_pair_carries_the_columns_both_screens_read(): void
    {
        $older = $this->person('Old Kim', 'kim@example.test', '+49 30 1234567', 1);
        $newer = $this->person('New Kim', 'KIM@example.test', null, 2);
        DB::table('loyalty_members')->where('id', $newer->id)->update(['current_points' => 75, 'lifetime_points' => 80, 'last_activity_at' => '2026-10-01 10:00:00']);

        [$pair] = app(MemberMergeService::class)->findDuplicates(50, $this->org->id);

        $this->assertSame('shared_email', $pair['reason']);
        $this->assertEqualsCanonicalizing(
            ['id', 'organization_id', 'member_number', 'lifetime_points', 'current_points', 'created_at', 'last_activity_at', 'name', 'email', 'phone'],
            array_keys((array) $pair['loser']),
        );
        $this->assertSame($older->id, (int) $pair['winner']->id);
        $this->assertSame('New Kim', $pair['loser']->name);
        $this->assertSame('KIM@example.test', $pair['loser']->email);
        $this->assertSame(75, (int) $pair['loser']->current_points);
        $this->assertSame(80, (int) $pair['loser']->lifetime_points);
        $this->assertSame('+49 30 1234567', $pair['winner']->phone);
    }
}
