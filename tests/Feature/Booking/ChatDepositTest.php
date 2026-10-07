<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §4.4: at a venue with deposits the chat does not book services itself; it sends the visitor to the booking page. */
class ChatDepositTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripeForDeposits();
        // The chat widget's config, as WidgetConfigCacheBustTest builds it.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64)->nullable();
                $t->string('api_key', 100)->nullable();
                $t->string('company_name')->nullable();
                $t->string('header_title')->nullable();
                $t->string('welcome_message')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        $this->key = (string) Str::uuid();
        DB::table('chat_widget_configs')->insert(['organization_id' => $this->org->id, 'widget_key' => $this->key, 'company_name' => 'Lumière Salon', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->org->forceFill(['widget_token' => 'wt-lumiere'])->save();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function book(): TestResponse
    {
        return $this->postJson("/api/v1/widget/{$this->key}/book-service", [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'start_at' => '2026-10-06T10:00:00+00:00',
            'customer_name' => 'Ada Guest', 'customer_email' => 'ada@example.test',
        ]);
    }

    public function test_at_a_venue_with_deposits_the_chat_sends_the_visitor_to_the_booking_page(): void
    {
        $this->depositsOn();

        $this->book()->assertStatus(422)
            ->assertJsonPath('error', 'deposit_required')
            ->assertJsonPath('booking_url', url('/services/wt-lumiere') . '?service=' . $this->service->id . '&master=' . $this->master->id);
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_without_deposits_the_chat_books_as_before(): void
    {
        $this->book()->assertStatus(201);
        $this->assertSame('chat_widget', ServiceBooking::sole()->source);
    }

    public function test_the_assistant_is_told_the_card_leads_to_the_booking_page(): void
    {
        $chat = app(WidgetChatController::class);
        $prompt = new \ReflectionMethod($chat, 'buildWidgetSystemPrompt');

        $this->assertStringContainsString('asks for a deposit', $prompt->invoke($chat, null, '', 'Lumière Salon', 'en', '', '', 'beauty', true));
        $this->assertStringNotContainsString('asks for a deposit', $prompt->invoke($chat, null, '', 'Lumière Salon', 'en', '', '', 'beauty', false));
    }
}
