<?php

namespace Tests\Feature\Content;

use App\Mail\ContentMorningEmail;
use App\Models\ContentPlannerPost;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * The morning email (spec 2026-10-19 §4.5). The venue is in Riga (UTC+3 in October): 05:00 UTC is 8 am there, on
 * Monday 5 October 2026.
 */
class MorningEmailTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:00:00'));
        Mail::fake();
    }

    private function optIn(User $user, array $more = []): void
    {
        $user->forceFill(['wants_content_morning_email' => true] + $more)->save();
    }

    /** @return array<string, mixed> the one queued email's words */
    private function onlyEmail(): array
    {
        Mail::assertQueued(ContentMorningEmail::class, 1);
        $lines = [];
        Mail::assertQueued(ContentMorningEmail::class, function (ContentMorningEmail $mail) use (&$lines) {
            $lines = $mail->lines;

            return true;
        });

        return $lines;
    }

    public function test_at_eight_on_the_venues_clock_the_poster_gets_todays_posts_with_links_once_a_day(): void
    {
        $this->optIn($this->staffMember, ['name' => 'Sam']);
        $evening = $this->makePost(['scheduled_date' => '2026-10-05', 'scheduled_time' => '18:00', 'title' => 'Autumn offer', 'status' => 'approved', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-05', 'hook' => 'Three colours', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-02', 'poster_id' => $this->staffMember->id]);
        $this->makePost(['scheduled_date' => '2026-10-05', 'title' => 'Not mine', 'poster_id' => $this->manager->id]);

        $this->artisan('content:send-morning-email')->assertSuccessful();

        $lines = $this->onlyEmail();
        Mail::assertQueued(ContentMorningEmail::class, fn (ContentMorningEmail $mail) => $mail->hasTo($this->staffMember->email));
        $base = rtrim((string) config('app.url'), '/');
        $this->assertSame("Today's posts: Monday, 5 October", $lines['subject']);
        $this->assertSame('Good morning, Sam.', $lines['greeting']);
        $this->assertCount(1, $lines['brands']);
        $posts = $lines['brands'][0]['posts'];
        $this->assertSame(['Three colours', 'Autumn offer'], array_column($posts, 'title'));
        $this->assertSame(['Any time', '18:00'], array_column($posts, 'time'));
        $this->assertSame(['Draft', 'Approved'], array_column($posts, 'status'));
        $this->assertSame('Instagram', $posts[1]['platform']);
        $this->assertSame("{$base}/content/posts/{$evening->id}?brand_id={$this->brandId}", $posts[1]['url']);
        $this->assertSame('Earlier posts not marked as posted yet: 1', $lines['brands'][0]['missed']);
        $this->assertSame("{$base}/content", $lines['openUrl']);
        $html = (new ContentMorningEmail($lines))->render();
        $this->assertStringContainsString('lang="en"', $html);
        $this->assertStringContainsString('Autumn offer', $html);
        $this->assertNotNull($this->staffMember->fresh()->content_morning_email_last_sent_at);

        // Later in the same hour: once a day.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:40:00'));
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertQueued(ContentMorningEmail::class, 1);

        // The next morning at eight, again: the venue's new day (the posts are now not marked as posted).
        $this->travelTo(CarbonImmutable::parse('2026-10-06 05:00:00'));
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertQueued(ContentMorningEmail::class, 2);
    }

    public function test_no_email_off_the_hour_without_the_switch_for_an_inactive_member_or_with_nothing_to_say(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued(); // not switched on

        $this->optIn($this->staffMember);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00')); // 9 am in Riga
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 05:00:00'));
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['is_active' => false]);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['is_active' => true]);
        $post->update(['status' => 'published']);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();
        $this->assertNull($this->staffMember->fresh()->content_morning_email_last_sent_at, 'nothing sent, nothing stamped');
    }

    public function test_a_manager_gets_the_posts_nobody_posts_across_their_brands_in_their_language(): void
    {
        $this->optIn($this->manager, ['language' => 'de', 'name' => 'Mia']);
        $this->makePost(['scheduled_date' => '2026-10-05', 'title' => 'Ohne Poster']);
        [$secondId, $second] = $this->secondBrand();
        app()->instance('current_brand_id', $secondId);
        ContentPlannerPost::create(['planner_profile_id' => $second->id, 'brand_id' => $secondId, 'platform' => 'linkedin', 'status' => 'draft', 'title' => 'Zweite Marke', 'scheduled_date' => '2026-10-05']);
        app()->instance('current_brand_id', $this->brandId);

        $this->artisan('content:send-morning-email')->assertSuccessful();

        $lines = $this->onlyEmail();
        $this->assertSame('de', $lines['locale']);
        $this->assertSame('Heutige Beiträge: Montag, 5. Oktober', $lines['subject']);
        $this->assertSame('Guten Morgen, Mia.', $lines['greeting']);
        $this->assertCount(2, $lines['brands']);
        $this->assertSame('Ohne Poster', $lines['brands'][0]['posts'][0]['title']);
        $this->assertSame('Second Studio', $lines['brands'][1]['name']);
        $this->assertSame('Zweite Marke', $lines['brands'][1]['posts'][0]['title']);
        $this->assertSame('Entwurf', $lines['brands'][1]['posts'][0]['status']);
        $this->assertStringEndsWith("?brand_id={$secondId}", $lines['brands'][1]['posts'][0]['url']);
    }

    public function test_an_organisation_with_content_switched_off_or_on_an_appointments_plan_gets_none(): void
    {
        $this->optIn($this->staffMember);
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->org->setWorkspace('content', false);
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();

        $this->org->setWorkspace('content', true);
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $this->artisan('content:send-morning-email')->assertSuccessful();
        Mail::assertNothingQueued();
    }

    public function test_the_email_is_scheduled_every_hour(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('content:send-morning-email')->assertSuccessful();
    }
}
