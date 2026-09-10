<?php

namespace Tests\Feature\ChatGptTools;

use App\Http\Middleware\Plugin\AuthenticatePluginToken;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Mcp\Servers\HexaTechServer;
use App\Mcp\Tools\ListLeads;
use App\Mcp\Tools\ListBookings;
use App\Mcp\Tools\SearchCustomers;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\Fluent\AssertableJson;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class LeadToolsTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['chatgpt.organization_ids' => [1], 'chatgpt.enabled' => true,
            'chatgpt.url' => 'http://localhost', 'app.url' => 'http://localhost', 'app.timezone' => 'UTC']);
        URL::forceRootUrl('http://localhost');
        $this->setUpMinimalSchema();
        Schema::table('organizations', function ($t) {
            $t->string('timezone')->nullable();
            $t->timestamp('saas_deleted_at')->nullable();
        });
        Schema::table('guests', fn ($t) => $t->text('passport_no')->nullable());
        Schema::create('staff', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('user_id');
            $t->boolean('is_active')->default(true);
        });
        Schema::create('brands', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('name');
            $t->softDeletes();
        });
        Schema::create('brand_user', function ($t) {
            $t->unsignedBigInteger('brand_id');
            $t->unsignedBigInteger('user_id');
        });
        Schema::create('pipeline_stages', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('name');
            $t->string('kind');
        });
        Schema::create('inquiries', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('pipeline_stage_id')->nullable();
            $t->string('event_name')->nullable();
            $t->string('inquiry_type')->nullable();
            $t->string('source')->nullable();
            $t->string('status')->default('New');
            $t->string('priority')->default('Medium');
            $t->text('notes')->nullable();
            $t->text('custom_data')->nullable();
            $t->date('check_in')->nullable();
            $t->date('next_task_due')->nullable();
            $t->timestamps();
        });
        DB::table('organizations')->insert([
            ['id' => 1, 'name' => 'Connected workspace', 'timezone' => 'Europe/Riga'],
            ['id' => 2, 'name' => 'Foreign workspace', 'timezone' => 'UTC'],
        ]);
        DB::table('users')->insert(['id' => 1, 'organization_id' => 1,
            'email' => 'staff@example.test', 'name' => 'Reception', 'user_type' => 'staff']);
        DB::table('staff')->insert(['user_id' => 1, 'organization_id' => 1]);
        DB::table('brands')->insert([
            ['id' => 1, 'organization_id' => 1, 'name' => 'First brand'],
            ['id' => 2, 'organization_id' => 1, 'name' => 'Second brand'],
            ['id' => 3, 'organization_id' => 2, 'name' => 'FOREIGN_BRAND'],
            ['id' => 4, 'organization_id' => 1, 'name' => 'Unassigned brand'],
        ]);
        DB::table('pipeline_stages')->insert([
            ['id' => 1, 'organization_id' => 1, 'name' => 'Call scheduled', 'kind' => 'open'],
            ['id' => 2, 'organization_id' => 2, 'name' => 'FOREIGN_STAGE', 'kind' => 'won'],
        ]);
        DB::table('guests')->insert([
            ['id' => 1, 'organization_id' => 1, 'full_name' => 'Sample Customer', 'company' => '100% Cards',
                'email' => 'PRIVATE_EMAIL@example.test', 'phone' => 'PRIVATE_PHONE', 'passport_no' => 'PRIVATE_PASSPORT'],
            ['id' => 2, 'organization_id' => 2, 'full_name' => 'FOREIGN_CUSTOMER', 'company' => 'Foreign company',
                'email' => 'FOREIGN_EMAIL@example.test', 'phone' => null, 'passport_no' => null],
        ]);
        $this->staff = User::findOrFail(1);
        $this->actingAs($this->staff);
        app()->instance('current_organization_id', 1);
        $this->travelTo(CarbonImmutable::parse('2026-09-08 22:15:00', 'UTC'));
    }

    public function test_today_means_local_creation_day_and_keeps_closed_leads(): void
    {
        $this->lead(1, '2026-09-08 20:59:59');
        $this->lead(2, '2026-09-08 21:00:00');
        $this->lead(3, '2026-09-09 20:59:59', ['status' => 'Lost']);
        $this->lead(4, '2026-09-09 21:00:00');
        $this->lead(5, '2026-09-09 12:00:00', ['organization_id' => 2]);
        $this->lead(6, '2026-09-09 13:00:00', ['status' => 'Confirmed', 'brand_id' => 2]);
        // Neither a booking today nor a follow-up today changes creation time.
        $this->lead(7, '2026-09-01 12:00:00', ['check_in' => '2026-09-09', 'next_task_due' => '2026-09-09']);
        app()->instance('current_brand_id', 1);

        $response = HexaTechServer::tool(ListLeads::class, []);
        $response->assertOk()->assertDontSee(['PRIVATE_EMAIL', 'PRIVATE_PHONE', 'PRIVATE_PASSPORT', 'PRIVATE_NOTES', 'PRIVATE_CUSTOM_DATA']);
        $data = $this->data($response);
        $this->assertSame('created_at', $data['date_basis']);
        $this->assertSame('Europe/Riga', $data['timezone']);
        $this->assertSame('2026-09-09', $data['from']);
        $this->assertSame($data['from'], $data['to']);
        $this->assertSame([3, 6, 2], array_column($data['leads'], 'id'));
        $this->assertSame(3, $data['total_count']);
        $this->assertSame(3, $data['returned_count']);
        $this->assertSame(['id' => 1, 'full_name' => 'Sample Customer', 'company' => '100% Cards'], $data['leads'][0]['customer']);
        $this->assertSame(['id' => 2, 'name' => 'Second brand'], $data['leads'][1]['brand']);
        $this->assertSame(['id' => 1, 'name' => 'Call scheduled', 'kind' => 'open'], $data['leads'][0]['pipeline_stage']);
        $this->assertNull($data['next_page']);
        $this->assertFalse($data['results_truncated']);
    }

    public function test_yesterday_is_resolved_in_workspace_timezone_and_cannot_mix_with_dates(): void
    {
        $this->lead(1, '2026-09-07 21:00:00');
        $this->lead(2, '2026-09-08 20:59:59');
        $this->lead(3, '2026-09-08 21:00:00');
        $response = HexaTechServer::tool(ListLeads::class, ['period' => 'yesterday']);
        $response->assertOk();
        $this->assertSame('2026-09-08', $this->data($response)['from']);
        $this->assertSame([2, 1], array_column($this->data($response)['leads'], 'id'));
        foreach ([['period' => 'yesterday', 'from' => '2026-09-01'], ['period' => 'tomorrow'], ['period' => null]] as $args) {
            HexaTechServer::tool(ListLeads::class, $args)->assertHasErrors();
        }
    }

    public function test_day_boundaries_handle_both_dst_transitions(): void
    {
        foreach ([
            ['2026-03-29', '2026-03-28 22:00:00', '2026-03-29 21:00:00', 23],
            ['2026-10-25', '2026-10-24 21:00:00', '2026-10-25 22:00:00', 25],
        ] as [$day, $start, $end, $hours]) {
            DB::table('inquiries')->delete();
            $first = CarbonImmutable::parse($start, 'UTC');
            $next = CarbonImmutable::parse($end, 'UTC');
            $this->assertSame((float) $hours, $first->diffInHours($next));
            $this->lead(1, $first->subSecond()->toDateTimeString());
            $this->lead(2, $start);
            $this->lead(3, $next->subSecond()->toDateTimeString());
            $this->lead(4, $end);
            $response = HexaTechServer::tool(ListLeads::class, ['from' => $day]);
            $response->assertOk();
            $this->assertSame([3, 2], array_column($this->data($response)['leads'], 'id'));
            $this->assertSame($day, $this->data($response)['to']);
        }
    }

    public function test_pivot_brands_status_and_literal_search_filter_the_count_and_rows(): void
    {
        DB::table('brand_user')->insert([['user_id' => 1, 'brand_id' => 1], ['user_id' => 1, 'brand_id' => 2]]);
        $this->lead(1, '2026-09-09 10:00:00', ['status' => 'Call scheduled']);
        $this->lead(2, '2026-09-09 11:00:00', ['brand_id' => 2, 'status' => 'Lost']);
        $this->lead(3, '2026-09-09 12:00:00', ['brand_id' => 4]);
        $this->lead(4, '2026-09-09 12:00:00', ['brand_id' => null]);
        $this->lead(5, '2026-09-09 12:00:00', ['organization_id' => 2, 'brand_id' => 1]);
        app()->instance('current_brand_id', 1);
        $all = HexaTechServer::tool(ListLeads::class, []);
        $all->assertOk();
        $this->assertSame([2, 1], array_column($this->data($all)['leads'], 'id'));
        $this->assertSame(2, $this->data($all)['total_count']);
        $filtered = HexaTechServer::tool(ListLeads::class, ['status' => 'Call scheduled', 'query' => '100%', 'brand_id' => 1]);
        $filtered->assertOk();
        $this->assertSame([1], array_column($this->data($filtered)['leads'], 'id'));
        $this->assertSame(1, $this->data($filtered)['total_count']);
        foreach ([['brand_id' => 4], ['brand_id' => 3], ['query' => '100_'], ['status' => 'Unknown custom status']] as $args) {
            $empty = HexaTechServer::tool(ListLeads::class, $args);
            $empty->assertOk();
            $this->assertSame(0, $this->data($empty)['total_count']);
            $this->assertSame([], $this->data($empty)['leads']);
        }
    }

    public function test_archived_and_foreign_assignments_do_not_restore_unrestricted_access(): void
    {
        $this->lead(1, '2026-09-09 10:00:00');
        DB::table('brands')->where('id', 1)->update(['deleted_at' => now()]);
        DB::table('brand_user')->insert([['user_id' => 1, 'brand_id' => 1], ['user_id' => 1, 'brand_id' => 3]]);
        $response = HexaTechServer::tool(ListLeads::class, []);
        $response->assertOk();
        $this->assertSame(0, $this->data($response)['total_count']);
        $this->assertSame([], $this->data($response)['leads']);
    }

    public function test_foreign_related_rows_are_not_serialized_or_searchable(): void
    {
        $this->lead(1, '2026-09-09 10:00:00', ['guest_id' => 2, 'brand_id' => 3, 'pipeline_stage_id' => 2]);
        $response = HexaTechServer::tool(ListLeads::class, []);
        $response->assertOk()->assertDontSee(['FOREIGN_CUSTOMER', 'FOREIGN_STAGE', 'FOREIGN_BRAND', 'FOREIGN_EMAIL']);
        $lead = $this->data($response)['leads'][0];
        $this->assertNull($lead['customer']);
        $this->assertNull($lead['brand']);
        $this->assertNull($lead['pipeline_stage']);
        $search = HexaTechServer::tool(ListLeads::class, ['query' => 'FOREIGN_CUSTOMER']);
        $search->assertOk();
        $this->assertSame(0, $this->data($search)['total_count']);
    }

    public function test_counts_pagination_order_and_page_cap_are_explicit(): void
    {
        foreach (range(1, 101) as $id) {
            $this->lead($id, '2026-09-09 10:00:00');
        }
        $first = HexaTechServer::tool(ListLeads::class, ['limit' => 1]);
        $first->assertOk();
        $this->assertSame([101], array_column($this->data($first)['leads'], 'id'));
        $this->assertSame(101, $this->data($first)['total_count']);
        $this->assertSame(1, $this->data($first)['returned_count']);
        $this->assertSame(2, $this->data($first)['next_page']);
        $last = HexaTechServer::tool(ListLeads::class, ['limit' => 1, 'page' => 100]);
        $last->assertOk();
        $this->assertSame([2], array_column($this->data($last)['leads'], 'id'));
        $this->assertTrue($this->data($last)['results_truncated']);
        $this->assertNull($this->data($last)['next_page']);
        $this->assertNotEmpty($this->data($last)['truncation_message']);
        DB::table('inquiries')->where('id', 1)->delete();
        $complete = HexaTechServer::tool(ListLeads::class, ['limit' => 1, 'page' => 100]);
        $complete->assertOk();
        $this->assertFalse($this->data($complete)['results_truncated']);
        $this->assertNull($this->data($complete)['next_page']);
    }

    public function test_invalid_filters_return_tool_errors_and_ninety_calendar_days_are_allowed(): void
    {
        foreach ([['from' => '2026-02-30'], ['from' => 'today'], ['from' => '2026-09-10', 'to' => '2026-09-09'],
            ['from' => '2026-01-01', 'to' => '2026-04-01'], ['limit' => 26], ['page' => 101],
            ['brand_id' => 'undefined'], ['brand_id' => -1], ['query' => ' '], ['status' => ' '],
            ['organization_id' => 2], ['date_basis' => 'next_task_due']] as $args) {
            $invalid = HexaTechServer::tool(ListLeads::class, $args);
            try {
                $invalid->assertHasErrors();
            } catch (\PHPUnit\Framework\AssertionFailedError $error) {
                $this->fail(json_encode($args).' '.$error->getMessage());
            }
            $invalid->assertDontSee('HexaTech could not complete this request');
        }
        HexaTechServer::tool(ListLeads::class, ['from' => '2026-01-01', 'to' => '2026-03-31'])->assertOk();
        $single = HexaTechServer::tool(ListLeads::class, ['to' => '2026-09-01']);
        $single->assertOk();
        $this->assertSame('2026-09-01', $this->data($single)['from']);
    }

    public function test_optional_arguments_must_be_omitted_instead_of_blank(): void
    {
        foreach ([ListLeads::class => ['from', 'to', 'query', 'status', 'brand_id', 'limit', 'page'],
            ListBookings::class => ['from', 'to', 'query', 'limit', 'page'],
            SearchCustomers::class => ['limit', 'after_id']] as $tool => $fields) {
            $required = match ($tool) {
                ListBookings::class => ['kind' => 'reservation'],
                SearchCustomers::class => ['query' => 'Sample'],
                default => [],
            };
            foreach ($fields as $field) {
                foreach (['', ' ', null] as $blank) {
                    HexaTechServer::tool($tool, [...$required, $field => $blank])
                        ->assertHasErrors()->assertDontSee('HexaTech could not complete this request');
                }
            }
        }
    }

    public function test_lead_access_requires_matching_active_staff_and_pilot(): void
    {
        $this->lead(1, '2026-09-09 10:00:00');
        app()->instance('current_organization_id', 2);
        HexaTechServer::tool(ListLeads::class, [])->assertHasErrors();
        app()->instance('current_organization_id', 1);
        config(['chatgpt.organization_ids' => []]);
        HexaTechServer::tool(ListLeads::class, [])->assertHasErrors();
        config(['chatgpt.organization_ids' => [1]]);
        DB::table('staff')->update(['is_active' => false]);
        HexaTechServer::tool(ListLeads::class, [])->assertHasErrors();
    }

    public function test_real_http_tool_call_lists_today_and_serializes_populated_customer_search(): void
    {
        $this->useControlledHttpIdentity();
        $this->lead(1, '2026-09-09 10:00:00');
        $this->callTool('list_leads', [])->assertOk()->assertJsonPath('result.isError', false)
            ->assertJsonPath('result.structuredContent.total_count', 1)
            ->assertJsonPath('result.structuredContent.leads.0.customer.full_name', 'Sample Customer');
        $response = $this->callTool('search_customers', ['query' => '100%', 'limit' => 1]);
        $response->assertOk()->assertJsonPath('result.isError', false)
            ->assertJsonPath('result.structuredContent.customers.0.full_name', 'Sample Customer')
            ->assertJsonPath('result.structuredContent.next_after_id', null);
        $this->assertStringNotContainsString('PRIVATE_PASSPORT', $response->getContent());
        $this->assertStringNotContainsString('FOREIGN_', $response->getContent());
    }

    public function test_real_http_blank_search_is_a_clear_tool_error_not_an_internal_protocol_error(): void
    {
        $this->useControlledHttpIdentity();
        foreach ([[], ['query' => ''], ['query' => null], ['query' => '  '], ['query' => '*'],
            ['query' => []], ['query' => 'Sample', 'organization_id' => 2]] as $args) {
            $response = $this->callTool('search_customers', $args);
            $response->assertOk()->assertJsonPath('result.isError', true)->assertJsonMissingPath('error');
            $this->assertStringNotContainsString('HexaTech could not complete this request', $response->getContent());
        }
        $this->callTool('search_customers', [])->assertJsonPath('result.isError', true);
        $this->assertStringContainsString('list_leads', $this->callTool('search_customers', [])->getContent());
    }

    private function useControlledHttpIdentity(): void
    {
        // Exercise real MCP request binding/validation/serialization and the
        // tenant/staff middleware. OAuth and upstream billing have dedicated
        // full-stack suites; no token verifier or network is simulated here.
        $this->withoutMiddleware([AuthenticatePluginToken::class, CheckPluginSubscription::class]);
    }

    private function callTool(string $name, array $arguments)
    {
        return $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call',
            'params' => ['name' => $name, 'arguments' => (object) $arguments]]);
    }

    private function lead(int $id, string $created, array $overrides = []): void
    {
        DB::table('inquiries')->insert(array_merge(['id' => $id, 'organization_id' => 1,
            'guest_id' => 1, 'brand_id' => 1, 'pipeline_stage_id' => 1, 'event_name' => 'Lead '.$id,
            'inquiry_type' => 'Product enquiry', 'source' => 'Website', 'status' => 'New',
            'created_at' => $created, 'notes' => 'PRIVATE_NOTES', 'custom_data' => '{"secret":"PRIVATE_CUSTOM_DATA"}'], $overrides));
    }

    private function data($response): array
    {
        $data = [];
        $response->assertStructuredContent(function (AssertableJson $json) use (&$data) {
            $data = $json->toArray();
            $json->etc();
        });

        return $data;
    }
}
