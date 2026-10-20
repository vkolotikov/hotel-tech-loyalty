<?php

namespace Tests\Feature\Content;

use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentLink;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Editing the link-in-bio page on the Brand page (spec 2026-10-19 §6.1, §6.4, §7.2). Today is Monday 5 October 2026. */
class BioEditorTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @param list<array<string, mixed>> $buttons */
    private function body(array $buttons = [], array $page = []): array
    {
        return $page + ['is_on' => true, 'slug' => 'lumiere', 'title' => null, 'line' => null, 'show_posts' => true, 'buttons' => $buttons];
    }

    private function save(array $body)
    {
        return $this->asManager()->putJson($this->api('bio'), $body);
    }

    /** Another organisation's page holding a name. */
    private function theirs(string $slug): void
    {
        $other = $this->otherOrganization();
        DB::table('content_bio_pages')->insert([
            'organization_id' => $other['org']->id, 'brand_id' => $other['brandId'], 'planner_profile_id' => $other['post']->planner_profile_id,
            'slug' => $slug, 'is_on' => true, 'show_posts' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function landingPage(string $slug, ?int $brandId = null): void
    {
        DB::table('landing_pages')->insert([
            'organization_id' => $this->org->id, 'brand_id' => $brandId ?? $this->brandId, 'slug' => $slug, 'template_key' => 'aera_reformer',
            'industry' => 'beauty', 'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_brand_without_a_page_reads_none_and_the_name_its_landing_page_has(): void
    {
        $this->landingPage('lumiere-riga');
        $json = $this->asStaffMember()->getJson($this->api('bio'))->assertOk()->json();
        $base = $json['base_url'] ?? null;
        unset($json['base_url']);
        $this->assertSame(['page' => null, 'buttons' => [], 'url' => null, 'suggested_name' => 'lumiere-riga'], $json);
        // The address without a name (the editor shows the full address of a name not saved yet): with a name, it is the
        // page's address. The test host carries a port, which the public host's addresses then carry too.
        $this->assertMatchesRegularExpression('#^http://' . preg_quote(config('landing.host'), '#') . '(:\d+)?/links/$#', (string) $base);
        $this->assertSame(route('content.bio', ['name' => 'lumiere-riga']), $base . 'lumiere-riga');
    }

    public function test_otherwise_the_name_is_the_brands_with_a_number_when_it_is_taken(): void
    {
        // The default brand's slug is "lumiere-salon" (the organisation makes it from its name).
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon');
        $this->theirs('lumiere-salon');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-2');
        $this->theirs('lumiere-salon-2');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-3');
        // A landing-page name another bio page already has is passed over too.
        $this->landingPage('lumiere-salon-2');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-3');
    }

    public function test_a_manager_saves_the_page_and_its_buttons_in_order_and_staff_only_read_it(): void
    {
        $saved = $this->save($this->body([
            ['label' => 'Book now', 'destination' => 'https://lumiere.example/book'],
            ['label' => 'Gift cards', 'destination' => 'https://lumiere.example/gifts'],
        ], ['title' => 'Lumière', 'line' => 'Hair and colour']))->assertOk()
            ->assertJsonPath('page', ['is_on' => true, 'slug' => 'lumiere', 'title' => 'Lumière', 'line' => 'Hair and colour', 'show_posts' => true])
            ->assertJsonPath('url', route('content.bio', ['name' => 'lumiere']))
            ->assertJsonPath('buttons.0.label', 'Book now')
            ->assertJsonPath('buttons.0.destination', 'https://lumiere.example/book')
            ->assertJsonPath('buttons.0.clicks_30d', 0)
            ->assertJsonPath('buttons.1.label', 'Gift cards');
        $link = ContentLink::whereKey(ContentBioButton::whereKey($saved->json('buttons.0.id'))->value('link_id'))->first();
        $saved->assertJsonPath('buttons.0.short_url', route('content.go', ['code' => $link->code]));
        $this->assertSame(ContentLinks::BUTTON_TAGS, $link->utm);
        $this->assertNull($link->post_id);

        $this->asStaffMember()->putJson($this->api('bio'), $this->body())->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->getJson($this->api('bio'))->assertOk()->assertJsonPath('page.slug', 'lumiere')->assertJsonCount(2, 'buttons');
        // Another brand has its own page (none yet).
        [$second] = $this->secondBrand();
        $this->asManager()->getJson($this->api('bio') . '?brand_id=' . $second)->assertOk()->assertJsonPath('page', null);
    }

    // Review Focus 5
    public function test_a_button_keeps_its_code_across_saves_and_a_removed_button_is_switched_off(): void
    {
        $first = $this->save($this->body([
            ['label' => 'Book now', 'destination' => 'https://lumiere.example/book'],
            ['label' => 'Gift cards', 'destination' => 'https://lumiere.example/gifts'],
        ]))->assertOk();
        [$book, $gifts] = [$first->json('buttons.0'), $first->json('buttons.1')];

        $second = $this->save($this->body([
            ['id' => $gifts['id'], 'label' => 'Gift cards', 'destination' => 'https://lumiere.example/gift-cards'],
            ['label' => 'Prices', 'destination' => 'https://lumiere.example/prices'],
            ['id' => 999999, 'label' => 'From another tab', 'destination' => 'https://lumiere.example/tab'],
            ['id' => $gifts['id'], 'label' => 'Twice', 'destination' => 'https://lumiere.example/twice'],
        ]))->assertOk()
            ->assertJsonPath('buttons.0.id', $gifts['id'])
            ->assertJsonPath('buttons.0.short_url', $gifts['short_url'])
            ->assertJsonPath('buttons.0.destination', 'https://lumiere.example/gift-cards')
            ->assertJsonPath('buttons.1.label', 'Prices')
            ->assertJsonPath('buttons.2.label', 'From another tab')
            ->assertJsonPath('buttons.3.label', 'Twice');
        $this->assertCount(4, array_unique(array_column($second->json('buttons'), 'short_url')));
        $this->assertSame(4, ContentBioButton::count());
        // Book now was removed: its short link says so; Gift cards' leads to the new address.
        $this->get($book['short_url'])->assertNotFound()->assertSee('This link is no longer active');
        $this->get($gifts['short_url'])->assertStatus(302);
    }

    public function test_the_name_must_be_valid_not_reserved_and_free(): void
    {
        $this->save($this->body())->assertOk();
        $this->theirs('taken-name');
        foreach (['ab', 'Has Caps', 'with_underscore', '-lumiere', 'admin', 'links', str_repeat('a', 64)] as $bad) {
            $this->save($this->body([], ['slug' => $bad]))->assertStatus(422)->assertJsonPath('error', 'bio_name_invalid');
        }
        $this->save($this->body([], ['slug' => 'taken-name']))->assertStatus(409)->assertJsonPath('error', 'bio_name_taken');
        $this->assertSame('lumiere', ContentBioPage::query()->value('slug'));
        // Its own name again is fine.
        $this->save($this->body([], ['slug' => 'lumiere', 'is_on' => false]))->assertOk()->assertJsonPath('page.is_on', false);
    }

    public function test_at_most_eight_buttons_each_a_web_address_with_short_words(): void
    {
        $nine = array_fill(0, 9, ['label' => 'Button', 'destination' => 'https://lumiere.example/']);
        $this->save($this->body($nine))->assertStatus(422)->assertJsonPath('error', 'too_many_buttons');
        $this->save($this->body(array_slice($nine, 0, 8)))->assertOk()->assertJsonCount(8, 'buttons');
        $this->save($this->body([['label' => 'Bad', 'destination' => 'ftp://lumiere.example']]))->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->save($this->body([['label' => str_repeat('a', 41), 'destination' => 'https://lumiere.example/']]))->assertStatus(422)->assertJsonValidationErrors('buttons.0.label');
        $this->save($this->body([], ['title' => str_repeat('a', 61)]))->assertStatus(422)->assertJsonValidationErrors('title');
        $this->save($this->body([], ['line' => str_repeat('a', 161)]))->assertStatus(422)->assertJsonValidationErrors('line');
        $this->assertSame(8, ContentBioButton::count());
    }

    public function test_each_button_shows_its_clicks_for_the_last_thirty_venue_days(): void
    {
        $saved = $this->save($this->body([['label' => 'Book now', 'destination' => 'https://lumiere.example/book']]))->assertOk();
        $linkId = ContentBioButton::whereKey($saved->json('buttons.0.id'))->value('link_id');
        DB::table('content_link_clicks')->insert([
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'direct', 'clicks' => 4],
            ['link_id' => $linkId, 'day' => '2026-09-06', 'via' => 'bio', 'clicks' => 2],
            ['link_id' => $linkId, 'day' => '2026-09-05', 'via' => 'direct', 'clicks' => 9],
        ]);
        $this->asManager()->getJson($this->api('bio'))->assertOk()->assertJsonPath('buttons.0.clicks_30d', 6);
    }
}
