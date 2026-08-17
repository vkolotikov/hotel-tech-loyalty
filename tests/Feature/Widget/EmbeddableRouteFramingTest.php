<?php

namespace Tests\Feature\Widget;

use App\Models\Brand;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Pages we tell venues to embed must actually be embeddable.
 *
 * WHY THIS EXISTS
 * The platform serves `X-Frame-Options: deny` by default at the edge, so a
 * public page is un-embeddable unless its route explicitly overrides the
 * header. Nothing enforced that, and the omission shipped twice:
 *
 *   /booking-widget   — the loader injected the iframe correctly, the iframe
 *                       fetched the page, and the browser dropped it. Blank
 *                       space, and NOTHING in the host page's console, because
 *                       the refusal is logged against the frame and not the
 *                       parent. Undiagnosable from the venue's side.
 *   /services/{token} — same bug, found only because this test was written.
 *                       Settings hands venues this exact URL as the services
 *                       "direct link".
 *
 * The failure is invisible in every ordinary test: the page returns 200 with
 * correct HTML. Only the header distinguishes "works" from "silently blank on
 * every customer site", which is why it has to be asserted directly.
 *
 * The last case is the one that makes the others safe to grant: the admin SPA
 * root must NEVER become frameable, or the login page can be overlaid by an
 * attacker's site. Embeddability is granted per-route, deliberately — it is not
 * a default to relax when a new widget seems not to work.
 */
class EmbeddableRouteFramingTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        // organizations + brands.
        $this->setUpKnowledgeSchema();

        // /book/{token} and /services/{token} read a colour override from here.
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->string('type', 32)->nullable();
                $table->string('group', 32)->nullable();
                $table->string('label')->nullable();
                $table->text('description')->nullable();
                $table->string('scope', 16)->default('company');
                $table->timestamps();
                $table->index(['organization_id', 'key']);
            });
        }

        $org = OrganizationFactory::new()->create();

        // Every org auto-gets a default brand carrying the widget token; that
        // token is what appears in the embed snippets we hand out.
        $this->token = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->value('widget_token');
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $binding) {
            if (app()->bound($binding)) {
                app()->forgetInstance($binding);
            }
        }

        parent::tearDown();
    }

    public static function embeddableRoutes(): array
    {
        return [
            'booking widget (script embed target)' => ['/booking-widget?org=%s'],
            'services widget (script embed target)' => ['/services-widget?org=%s'],
            'booking direct link'                   => ['/book/%s'],
            'services direct link'                  => ['/services/%s'],
        ];
    }

    #[DataProvider('embeddableRoutes')]
    public function test_embeddable_pages_permit_framing(string $pattern): void
    {
        $response = $this->get(sprintf($pattern, $this->token));

        $response->assertOk();

        // frame-ancestors is the directive modern browsers actually act on.
        $response->assertHeader('Content-Security-Policy', 'frame-ancestors *');

        // X-Frame-Options carries no "allow any origin" value in the spec —
        // ALLOWALL is a non-standard token older browsers accept, and it is
        // here to neutralise the inherited `deny` rather than to grant
        // anything. What matters is that it is NOT deny/sameorigin.
        $this->assertNotContains(
            strtolower($response->headers->get('X-Frame-Options') ?? ''),
            ['deny', 'sameorigin'],
            'This page is handed to venues to embed; a restrictive X-Frame-Options '
            . 'makes it render as blank space on their site with no console error.',
        );
    }

    public function test_the_admin_root_still_refuses_framing(): void
    {
        // The counterweight. The SPA root hosts the admin login, so it must
        // not pick up framing permission — an attacker framing it invisibly
        // can harvest credentials by overlay. Nothing here should ever be
        // "fixed" by granting ALLOWALL.
        $response = $this->get('/');

        $this->assertNotSame(
            'frame-ancestors *',
            $response->headers->get('Content-Security-Policy'),
            'The admin SPA root must never be made frameable.',
        );
    }
}
