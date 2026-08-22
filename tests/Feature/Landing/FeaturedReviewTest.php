<?php
namespace Tests\Feature\Landing;

use App\Models\ReviewSubmission;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class FeaturedReviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingContentSchema();
    }

    public function test_nothing_is_featured_by_default(): void
    {
        // The default must be off. A default of on would publish every past
        // review the moment the column ships.
        $review = ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Wonderful', 'submitted_at' => now(),
        ]);

        $this->assertFalse((bool) $review->fresh()->is_featured);
    }

    public function test_the_featured_scope_returns_only_chosen_reviews(): void
    {
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Chosen', 'is_featured' => true, 'submitted_at' => now()]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 1,
            'comment' => 'Waited 40 minutes', 'submitted_at' => now()]);

        $comments = ReviewSubmission::withoutGlobalScopes()->featured()->pluck('comment')->all();

        $this->assertSame(['Chosen'], $comments);
    }
}
