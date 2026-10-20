<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Services\Content\ContentLinks;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A tracked short link on the public host (spec 2026-10-19 §5.1, §5.3, §5.4). Today is Monday 5 October 2026, 06:00 UTC. */
class LinkRedirectTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function go(string $code, string $query = ''): string
    {
        return 'http://' . config('landing.host') . '/go/' . $code . $query;
    }

    private function link(string $destination = 'https://lumiere.example/autumn?ref=ig#book'): ContentLink
    {
        $post = $this->makePost();

        return ContentLinks::make($this->org->id, $this->brandId, (int) $post->id, $destination, ContentLinks::postTags('instagram', null, (int) $post->id));
    }

    /** @return array<string, int> "day via" => clicks */
    private function clicks(ContentLink $link): array
    {
        return DB::table('content_link_clicks')->where('link_id', $link->id)->orderBy('day')->orderBy('via')->get()
            ->mapWithKeys(fn ($row) => [substr((string) $row->day, 0, 10) . ' ' . $row->via => (int) $row->clicks])->all();
    }

    public function test_a_live_code_sends_the_visitor_on_with_its_tags_and_is_never_cached(): void
    {
        $link = $this->link();
        $this->assertMatchesRegularExpression('/^[abcdefghijkmnpqrstuvwxyz23456789]{7}$/', $link->code);

        $response = $this->get($this->go($link->code))->assertStatus(302)
            ->assertHeader('Location', "https://lumiere.example/autumn?ref=ig&utm_source=instagram&utm_medium=social&utm_campaign=content-plan&utm_content=post-{$link->post_id}#book");
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_the_public_host_keeps_its_rules_on_a_short_link(): void
    {
        $link = $this->link();
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);
        try {
            $response = $this->get($this->go($link->code))->assertStatus(302);
            $this->assertSame([], $response->headers->getCookies());
            $this->assertStringContainsString("default-src 'self'", (string) $response->headers->get('Content-Security-Policy'));
            $response->assertHeader('X-Frame-Options', 'DENY');
            $this->assertSame([], array_values(array_diff(scandir($dir), ['.', '..'])), 'a short link allocated a session');
        } finally {
            array_map('unlink', glob($dir . '/*'));
            @rmdir($dir);
        }
        // Only the code's own shape reaches the route; anything else is the host's refusal.
        foreach (['/go/ABCDEFG', '/go/abc234', '/go/abc23456', '/go/' . $link->code . '/x'] as $path) {
            $this->get('http://' . config('landing.host') . $path)->assertNotFound();
        }
    }

    public function test_clicks_count_by_venue_day_and_source_one_row_each(): void
    {
        $link = $this->link();
        $this->get($this->go($link->code))->assertStatus(302);
        $this->get($this->go($link->code))->assertStatus(302);
        $this->get($this->go($link->code, '?via=bio'))->assertStatus(302);
        $this->get($this->go($link->code, '?via=email'))->assertStatus(302);
        $this->assertSame(['2026-10-05 bio' => 1, '2026-10-05 direct' => 3], $this->clicks($link));
        // `via` is never passed on.
        $this->get($this->go($link->code, '?via=bio'))->assertHeader('Location', ContentLinks::target($link->destination, $link->utm));
    }

    // Review Focus 3: the venue's day, not UTC's.
    public function test_a_click_counts_on_the_venues_day(): void
    {
        $this->org->forceFill(['timezone' => 'Pacific/Auckland'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00')); // 01:00 on Tuesday 6 October in Auckland (NZDT, UTC+13)
        $link = $this->link();
        $this->get($this->go($link->code))->assertStatus(302);
        $this->assertSame(['2026-10-06 direct' => 1], $this->clicks($link));
    }

    public function test_robots_and_head_requests_are_sent_on_but_not_counted(): void
    {
        $link = $this->link();
        $this->call('HEAD', $this->go($link->code), [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'])->assertStatus(302);
        $robots = [
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Facebot', 'Twitterbot/1.0',
            'LinkedInBot/1.0 (compatible; Mozilla/5.0)', 'WhatsApp/2.23.20.0', 'TelegramBot (like TwitterBot)',
            'Slackbot-LinkExpanding 1.0', 'Mozilla/5.0 (compatible; Discordbot/2.0)', 'Pinterest/0.2', 'Applebot/0.1',
            'Mozilla/5.0 (compatible; Googlebot/2.1)', 'SomeCrawler/3.0', 'web spider', 'Link Preview Fetcher',
            'Mozilla/5.0 HeadlessChrome/120.0',
        ];
        foreach ($robots as $agent) {
            $this->withHeaders(['User-Agent' => $agent])->get($this->go($link->code))->assertStatus(302);
        }
        $this->assertSame([], $this->clicks($link));

        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram'])
            ->get($this->go($link->code))->assertStatus(302);
        $this->assertSame(['2026-10-05 direct' => 1], $this->clicks($link));
    }

    public function test_a_switched_off_code_says_so_in_the_brands_content_language_and_an_unknown_code_is_the_hosts_404(): void
    {
        $link = $this->link();
        $link->update(['destination' => null]);
        $this->get($this->go($link->code))->assertNotFound()->assertSee('<html lang="en">', false)->assertSee('This link is no longer active');
        $this->profile->update(['default_language' => 'ru']);
        $response = $this->get($this->go($link->code))->assertNotFound()->assertSee('<html lang="ru">', false)->assertSee('Эта ссылка больше не действует');
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->profile->update(['default_language' => 'it']);
        $this->get($this->go($link->code))->assertNotFound()->assertSee('This link is no longer active');
        $this->assertSame([], $this->clicks($link));

        $this->get($this->go('zzzz222'))->assertNotFound()->assertDontSee('This link is no longer active');
    }

    public function test_a_clash_draws_the_code_again(): void
    {
        $taken = $this->link();
        $draws = [$taken->code, 'abc2346'];
        $this->assertSame('abc2346', ContentLinks::freshCode(function () use (&$draws): string {
            return array_shift($draws);
        }));
    }

    // Final review: production logs from `error` up, so a count that keeps failing must say so there — otherwise every
    // panel shows 0 clicks and nobody learns why. The visitor is still sent on.
    public function test_a_click_that_cannot_be_counted_still_sends_the_visitor_on_and_says_so_in_the_error_log(): void
    {
        $link = $this->link();
        $logged = [];
        Log::listen(function (MessageLogged $message) use (&$logged): void {
            $logged[] = $message->level . ': ' . $message->message;
        });
        Schema::drop('content_link_clicks');

        $this->get($this->go($link->code))->assertStatus(302);
        $this->assertContains('error: content link: a click was not counted', $logged);
    }
}
