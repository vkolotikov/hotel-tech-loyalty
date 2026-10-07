<?php

namespace Tests\Feature\Widget;

use App\Services\IndustryPrompts\BookingWidgetVocab;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/**
 * Part H: the booking page changes only for a venue that switched deposits
 * on (spec §4.2). With them off, its output is byte for byte what it was
 * before Part H (the fixture was recorded from the view as it stood).
 */
class ServicesWidgetDepositPageTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function page(array $extra = []): string
    {
        return str_replace("\r\n", "\n", view('services-widget', array_merge([
            'orgId' => 'tok_fixture', 'lang' => 'en', 'color' => '#2d6a4f', 'apiBase' => 'https://app.test/api',
            'industry' => 'beauty', 'vocab' => BookingWidgetVocab::for('beauty'),
        ], $extra))->render());
    }

    public function test_with_deposits_off_the_page_is_exactly_as_before(): void
    {
        // tests/fixtures (lowercase): the folder git tracks; Windows forgave the capital F, a fresh worktree does not.
        $before = str_replace("\r\n", "\n", file_get_contents(base_path('tests/fixtures/services-widget-deposits-off.html')));

        $this->assertSame($before, $this->page());
        $this->assertSame($before, $this->page(['deposit' => false]));
    }

    public function test_with_deposits_on_the_page_has_its_deposit_step(): void
    {
        $html = $this->page(['deposit' => true]);

        foreach (['https://js.stripe.com/v3/', 'function renderDepositStep', 'data-act="pay"', 'Continue to deposit', 'Deposit now', 'deposit-card', 'case 8: html += renderDepositStep()'] as $part) {
            $this->assertStringContainsString($part, $html);
        }
    }

    // Final review I4/M6: paying must not rebuild the page under Stripe's card fields (it would remount them just as
    // confirmPayment runs), and the step shows what the intent holds, not an older quote. The behaviour itself is
    // checked in a real browser; this keeps the page's code from drifting back.
    public function test_paying_never_rebuilds_the_card_fields_and_the_step_shows_the_held_amount(): void
    {
        $html = $this->page(['deposit' => true]);

        $this->assertSame(1, preg_match('/function payDeposit\(\) \{(.*?)\n  \}\n/s', $html, $pay), 'payDeposit is in the page');
        $this->assertStringNotContainsString('render()', $pay[1]);
        $this->assertStringContainsString('paintDeposit()', $pay[1]);
        $this->assertStringContainsString('(dep.intent && dep.intent.deposit) || q.deposit', $html);
    }

    // 2026-10-07: one Stripe.js instance for the page (Stripe asks for one); every visit to the step used to make another.
    public function test_every_visit_to_the_step_reuses_one_stripe_instance(): void
    {
        $html = $this->page(['deposit' => true]);

        $this->assertSame(1, preg_match('/function startDeposit\(\) \{(.*?)\n  \}\n/s', $html, $start), 'startDeposit is in the page');
        $this->assertStringNotContainsString('window.Stripe(', $start[1]);
        $this->assertStringContainsString('dep.stripe = stripeJs()', $start[1]);
        $this->assertSame(1, substr_count($html, 'window.Stripe('), 'Stripe.js is started in one place');
    }

    public function test_the_routes_turn_the_step_on_only_where_deposits_are_on(): void
    {
        $url = '/services-widget?org=' . $this->org->id;
        $this->get($url)->assertOk()->assertDontSee('function renderDepositStep', false);

        $this->depositsOn();
        $this->get($url)->assertOk()->assertSee('function renderDepositStep', false);
    }
}
