<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\URL;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The editor's live pane iframes the tenant's real page, from the admin
 * origin, so the preview alone must relax `frame-ancestors`. A published
 * page has no reason to be framable by anyone -- that directive is its
 * entire clickjacking defence -- so the relaxation must stay confined to
 * the signed preview route and never leak onto a live page.
 */
class LandingPreviewFramingTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    private function landingUrl(string $slug): string
    {
        return 'http://' . $this->host() . '/' . $slug;
    }

    private function signedPreviewUrl(LandingPage $page): string
    {
        return URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]);
    }

    private function makePage(string $status): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1,
            'slug'            => 'framing-' . $status . '-' . uniqid(),
            'template_key'    => 'ruled_page', 'industry' => 'beauty', 'status' => $status,
            'published_at'    => $status === 'published' ? now() : null,
            'content'         => ['hero' => ['headline' => 'Framing Test']],
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page;
    }

    private function publishedPage(): LandingPage
    {
        return $this->makePage('published');
    }

    private function draftPage(): LandingPage
    {
        return $this->makePage('draft');
    }

    public function test_a_published_page_still_refuses_to_be_framed(): void
    {
        $page = $this->publishedPage();

        $csp = $this->get($this->landingUrl($page->slug))->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
    }

    public function test_the_preview_may_be_framed_by_the_admin_origin_only(): void
    {
        $page = $this->draftPage();

        $csp = $this->get($this->signedPreviewUrl($page))->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("frame-ancestors 'self' " . config('app.url'), $csp);
        $this->assertStringNotContainsString("frame-ancestors 'none'", $csp);
        // A wildcard here would let any site frame a draft.
        $this->assertStringNotContainsString('frame-ancestors *', $csp);
    }

    public function test_every_admin_host_may_frame_the_preview_not_only_the_one_in_app_url(): void
    {
        // The editor pane is framed by whichever admin host the tenant signed
        // in to, and this product answers on all of config/pwa.php's hosts.
        // Naming only config('app.url') left the pane empty on five of the six
        // -- a tenant reported it as "preview not works", and a design nobody
        // could see shipped because of it. The assertion above passes on a
        // one-origin policy, which is exactly why it did not catch this.
        $page = $this->draftPage();

        $csp = $this->get($this->signedPreviewUrl($page))->headers->get('Content-Security-Policy');

        preg_match('/frame-ancestors ([^;]+)/', (string) $csp, $directive);
        $this->assertNotEmpty($directive, 'The preview names no frame-ancestors.');

        $permitted = preg_split('/\s+/', trim($directive[1]));

        foreach (array_keys((array) config('pwa.hosts')) as $host) {
            $this->assertContains(
                'https://' . $host,
                $permitted,
                "The admin host [{$host}] cannot frame its own preview, so the editor pane is blank there."
            );
        }
    }

    public function test_the_preview_carries_the_rest_of_the_policy_unchanged(): void
    {
        $page = $this->draftPage();

        $csp = $this->get($this->signedPreviewUrl($page))->headers->get('Content-Security-Policy');

        foreach (["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"] as $directive) {
            $this->assertStringContainsString($directive, $csp,
                "Relaxing frame-ancestors must not have disturbed {$directive}.");
        }
    }
}
