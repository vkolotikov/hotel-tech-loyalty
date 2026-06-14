<?php

namespace Tests\Feature\Notifications;

use App\Models\EmailTemplate;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the EmailTemplate model contract — reusable email
 * templates with merge-tag substitution.
 *
 * Why this matters:
 *
 *   EmailTemplate powers the SPA's "send template to member" UX
 *   (inquiry detail's "Send email" button, MemberDetail's quick-
 *   send modal). render() walks a fixed list of merge tags +
 *   substitutes member fields. A regression in any tag breaks
 *   personalisation silently — a customer receives "Hello
 *   {{first_name}}," instead of "Hello Alice,".
 *
 *   The AVAILABLE_TAGS constant is the documented public surface
 *   — the SPA's admin Templates editor shows this list. Adding
 *   a new tag without updating BOTH the constant AND render()
 *   would silently fail to substitute it.
 *
 * Contract:
 *
 *   - AVAILABLE_TAGS is a frozen list of 10 documented merge
 *     tags
 *   - merge_tags array cast (per-template overrides — the SPA
 *     stores which tags this specific template uses)
 *   - is_active bool
 *   - render() substitutes member.user.name, first_name,
 *     email, member_number, tier_name, points_balance,
 *     lifetime_points, referral_code, hotel_name (from
 *     HotelSetting), current_year
 *   - render() applies extraTags overrides (caller can pass
 *     additional tags to substitute)
 *   - createdBy BelongsTo User FK='created_by'
 *   - BelongsToOrganization + BelongsToBrand auto-fill +
 *     tenant isolation
 */
class EmailTemplateModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        // loyalty_members minimal schema doesn't include
        // referral_code — add it for render() to work.
        if (!Schema::hasColumn('loyalty_members', 'referral_code')) {
            Schema::table('loyalty_members', function ($t) {
                $t->string('referral_code', 32)->nullable();
            });
        }

        if (!Schema::hasTable('email_templates')) {
            Schema::create('email_templates', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('subject');
                $t->text('html_body');
                $t->text('merge_tags')->nullable();
                $t->string('category')->nullable();
                $t->boolean('is_active')->default(true);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function template(array $attrs = []): EmailTemplate
    {
        return EmailTemplate::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test Template',
            'subject'         => 'Hi {{first_name}}!',
            'html_body'       => 'Hello {{first_name}}, you have {{points_balance}} points.',
            'is_active'       => true,
        ], $attrs));
    }

    private function member(): LoyaltyMember
    {
        $tier = LoyaltyTier::create([
            'organization_id' => $this->orgId,
            'name'            => 'Gold',
            'min_points'      => 1000,
            'is_active'       => true,
        ]);

        $user = User::create([
            'organization_id' => $this->orgId,
            'name'            => 'Alice Smith',
            'email'           => 'alice@example.com',
        ]);

        return LoyaltyMember::create([
            'organization_id'   => $this->orgId,
            'user_id'           => $user->id,
            'tier_id'           => $tier->id,
            'member_number'     => 'GOLD-001',
            'current_points'    => 1500,
            'lifetime_points'   => 5200,
            'referral_code'     => 'REF-ALICE',
            'is_active'         => true,
        ]);
    }

    /* ─── AVAILABLE_TAGS constant ─── */

    public function test_available_tags_is_locked_at_10_documented_merge_tags(): void
    {
        // Lock the public surface. Adding a new tag requires
        // updating BOTH this constant AND render() — this test
        // catches the omission.
        $this->assertCount(10, EmailTemplate::AVAILABLE_TAGS,
            'AVAILABLE_TAGS MUST have exactly 10 documented merge tags. '
            . 'If you added one, update render() too.',
        );
    }

    public function test_available_tags_includes_documented_member_fields(): void
    {
        $expected = [
            '{{member_name}}', '{{first_name}}', '{{email}}',
            '{{member_number}}', '{{tier_name}}',
            '{{points_balance}}', '{{lifetime_points}}',
            '{{referral_code}}', '{{hotel_name}}',
            '{{current_year}}',
        ];

        foreach ($expected as $tag) {
            $this->assertArrayHasKey(
                $tag,
                EmailTemplate::AVAILABLE_TAGS,
                "AVAILABLE_TAGS MUST include '{$tag}'.",
            );
        }
    }

    public function test_each_available_tag_has_a_description(): void
    {
        // Defensive: SPA editor shows the description. Empty
        // string would render as a blank tooltip.
        foreach (EmailTemplate::AVAILABLE_TAGS as $tag => $desc) {
            $this->assertNotEmpty($desc,
                "Tag '{$tag}' MUST have a non-empty description.");
            $this->assertIsString($desc);
        }
    }

    /* ─── render() — member-field substitution ─── */

    public function test_render_substitutes_first_name(): void
    {
        // CRITICAL: the most common personalisation. Pre-fix a
        // regression that surfaced "Hello {{first_name}}," would
        // be a customer-visible embarrassment.
        $member = $this->member();
        $template = $this->template([
            'subject'   => 'Hi {{first_name}}!',
            'html_body' => 'Welcome {{first_name}}, your trip awaits.',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Hi Alice!', $rendered['subject']);
        $this->assertSame('Welcome Alice, your trip awaits.', $rendered['html']);
    }

    public function test_render_substitutes_full_member_name(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Hello {{member_name}}!',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Hello Alice Smith!', $rendered['html']);
    }

    public function test_render_substitutes_email(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Confirm at {{email}}',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Confirm at alice@example.com', $rendered['html']);
    }

    public function test_render_substitutes_member_number_and_tier_name(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Card {{member_number}} - {{tier_name}}',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Card GOLD-001 - Gold', $rendered['html']);
    }

    public function test_render_substitutes_points_balance_with_thousands_separator(): void
    {
        // Points balance uses number_format() — 1500 surfaces as
        // "1,500" for readability.
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Balance: {{points_balance}} points',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Balance: 1,500 points', $rendered['html'],
            'points_balance MUST format with thousands separator.');
    }

    public function test_render_substitutes_lifetime_points_with_thousands_separator(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Lifetime: {{lifetime_points}}',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Lifetime: 5,200', $rendered['html']);
    }

    public function test_render_substitutes_referral_code(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Share code {{referral_code}}',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Share code REF-ALICE', $rendered['html']);
    }

    public function test_render_substitutes_current_year(): void
    {
        $member = $this->member();
        $template = $this->template([
            'html_body' => '© {{current_year}} Company',
        ]);

        $rendered = $template->render($member);
        $thisYear = date('Y');

        $this->assertSame("© {$thisYear} Company", $rendered['html']);
    }

    public function test_render_substitutes_hotel_name_from_hotel_setting(): void
    {
        // Pulls from HotelSetting::getValue('company_name', 'Hotel
        // Loyalty'). Lock the integration.
        HotelSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'company_name',
            'value'           => 'Forrest Glamp',
        ]);

        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Welcome to {{hotel_name}}',
        ]);

        $rendered = $template->render($member);

        $this->assertSame('Welcome to Forrest Glamp', $rendered['html']);
    }

    public function test_render_falls_back_to_hotel_loyalty_when_company_name_not_set(): void
    {
        // Defensive: a not-yet-configured org gets the
        // documented default 'Hotel Loyalty'.
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Welcome to {{hotel_name}}',
        ]);

        $rendered = $template->render($member);

        $this->assertStringContainsString('Hotel Loyalty', $rendered['html'],
            'Unconfigured company_name MUST fall back to "Hotel Loyalty".');
    }

    /* ─── extraTags overrides ─── */

    public function test_render_applies_extra_tags_substitution(): void
    {
        // Callers can pass extra tags (e.g. {{offer_title}}) for
        // ad-hoc substitutions. Lock the spread.
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Hi {{first_name}}, your offer: {{offer_title}}',
        ]);

        $rendered = $template->render($member, [
            '{{offer_title}}' => '20% off spa',
        ]);

        $this->assertSame('Hi Alice, your offer: 20% off spa', $rendered['html']);
    }

    public function test_render_extra_tags_override_built_in_tags(): void
    {
        // Caller's extraTags WIN over built-in tags (the array
        // spread comes last). Used by admins who want to send a
        // "preview" with custom values.
        $member = $this->member();
        $template = $this->template([
            'html_body' => 'Hi {{first_name}}',
        ]);

        $rendered = $template->render($member, [
            '{{first_name}}' => 'PREVIEW',
        ]);

        $this->assertSame('Hi PREVIEW', $rendered['html'],
            'Extra tags MUST override built-in tags (last-write-wins).');
    }

    /* ─── render() returns documented shape ─── */

    public function test_render_returns_subject_and_html_keys(): void
    {
        $template = $this->template();
        $rendered = $template->render($this->member());

        $this->assertArrayHasKey('subject', $rendered);
        $this->assertArrayHasKey('html', $rendered);
    }

    /* ─── merge_tags + is_active casts ─── */

    public function test_merge_tags_round_trips_through_array_cast(): void
    {
        $tags = ['{{member_name}}', '{{points_balance}}'];

        $template = $this->template(['merge_tags' => $tags]);

        $this->assertSame($tags, $template->fresh()->merge_tags);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        $active = $this->template(['is_active' => true]);
        $inactive = $this->template(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($inactive->is_active);
    }

    /* ─── Relationships ─── */

    public function test_created_by_relationship_uses_created_by_foreign_key(): void
    {
        // FK is 'created_by' (NOT 'created_by_user_id' as some
        // sister models use). Lock the legacy column name.
        $template = $this->template();
        $rel = $template->createdBy();

        $this->assertSame('created_by', $rel->getForeignKeyName(),
            'createdBy FK MUST be created_by (NOT created_by_user_id).');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_tenant_scope_isolates_templates_cross_org(): void
    {
        // CRITICAL: templates are tenant-private. Cross-leak
        // would expose another org's email copy + variable
        // patterns.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('email_templates')->insert([
            'organization_id' => $orgA,
            'name'            => 'Org A template',
            'subject'         => 'A',
            'html_body'       => 'A',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('email_templates')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B template',
            'subject'         => 'B',
            'html_body'       => 'B',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, EmailTemplate::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, EmailTemplate::all());
    }
}
