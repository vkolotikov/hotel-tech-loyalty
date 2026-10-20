<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Each post its own code (spec 2026-10-19 §5.1): versions, repeat copies and duplicates. Today is Monday 5 October 2026. */
class LinkCopiesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function postWithLink(): ContentPlannerPost
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        ContentLinks::set($post, 'https://lumiere.example/autumn');

        return $post;
    }

    public function test_versions_take_the_address_each_with_its_own_code_and_tags(): void
    {
        $post = $this->postWithLink();
        $made = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => false])->assertCreated();

        $codes = [ContentLinks::ofPost($post)->code];
        foreach ($made->json('versions') as $card) {
            $link = ContentLinks::ofPost(ContentPlannerPost::findOrFail($card['id']));
            $this->assertSame('https://lumiere.example/autumn', $link->destination);
            $this->assertSame($card['platform'], $link->utm['utm_source']);
            $this->assertSame("post-{$card['id']}", $link->utm['utm_content']);
            $codes[] = $link->code;
        }
        $this->assertCount(3, array_unique($codes));
        // A click counts for the post it came through.
        $this->get('http://' . config('landing.host') . '/go/' . $codes[1])->assertStatus(302);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.link.clicks', 0);
        $this->asManager()->getJson($this->api("posts/{$made->json('versions.0.id')}"))->assertJsonPath('post.link.clicks', 1);
    }

    public function test_repeat_copies_and_a_duplicate_take_the_address_each_with_its_own_code(): void
    {
        $post = $this->postWithLink();
        $copies = $this->asManager()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated()->json('copies.*.id');
        $duplicate = $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->json('post.id');
        $this->assertNotEmpty($copies);

        $codes = [ContentLinks::ofPost($post)->code];
        foreach ([...$copies, $duplicate] as $id) {
            $link = ContentLinks::ofPost(ContentPlannerPost::findOrFail($id));
            $this->assertSame('https://lumiere.example/autumn', $link->destination, "post {$id}");
            $this->assertSame("post-{$id}", $link->utm['utm_content']);
            $codes[] = $link->code;
        }
        $this->assertCount(count($copies) + 2, array_unique($codes));
    }

    public function test_a_post_whose_link_is_off_or_unset_gives_copies_without_one(): void
    {
        $post = $this->postWithLink();
        ContentLinks::set($post, null);
        $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->assertJsonPath('post.link', null);
        $plain = $this->makePost();
        $this->asManager()->postJson($this->api("posts/{$plain->id}/versions"), ['platforms' => ['linkedin'], 'ai' => false])->assertCreated();
        $this->assertSame(1, ContentLink::count());
    }
}
