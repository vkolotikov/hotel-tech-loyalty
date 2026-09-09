<?php

namespace Tests\Feature\Crm;

use App\Http\Controllers\Api\V1\Admin\GuestController;
use App\Http\Controllers\Api\V1\Admin\InquiryController;
use App\Http\Middleware\ValidateCrmRecordId;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class CrmUpdateRouteIdTest extends TestCase
{
    private const CONTROLLERS = [
        'guests' => GuestController::class,
        'inquiries' => InquiryController::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // Exercise the real route and controller dispatcher while isolating
        // ID validation from login, subscription and tenant setup.
        foreach (array_keys(self::CONTROLLERS) as $resource) {
            $route = Route::getRoutes()->match(Request::create("/api/v1/admin/{$resource}/1", 'PUT'));
            $this->withoutMiddleware(array_map(fn ($middleware) => explode(':', $middleware, 2)[0], array_values(array_filter(
                app(Router::class)->gatherRouteMiddleware($route),
                fn ($middleware) => ! str_starts_with($middleware, ValidateCrmRecordId::class),
            ))));
            $route->flushController();
        }
    }

    public function test_malformed_and_overflow_ids_are_rejected_before_controller_or_database_access(): void
    {
        $this->withoutExceptionHandling();
        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        foreach (self::CONTROLLERS as $resource => $controller) {
            $this->partialMock($controller)->shouldNotReceive('update');

            foreach (['null', 'undefined', 'abc', '0', '000', '-1', '1.5', '1e3', '+1', ' 1', '1 ',
                '9223372036854775808', '999999999999999999999999999999',
                '0009223372036854775808'] as $id) {
                $this->putJson('/api/v1/admin/'.$resource.'/'.rawurlencode($id), ['notes' => 'Must not be written'])
                    ->assertNotFound()
                    ->assertExactJson(['message' => 'Invalid record ID.']);
            }
        }

        $this->assertSame([], $queries, 'Invalid IDs must not reach a database lookup.');
    }

    public function test_valid_decimal_ids_keep_the_existing_integer_controller_contract(): void
    {
        $this->withoutExceptionHandling();

        foreach (self::CONTROLLERS as $resource => $controller) {
            $mock = $this->partialMock($controller);
            foreach (['1', '267', '379', '000267', '2147483648', '9223372036854775807', '0009223372036854775807'] as $id) {
                $expectedId = (int) $id;
                $mock->shouldReceive('update')->once()
                    ->withArgs(fn (Request $request, int $actualId) => $actualId === $expectedId && $request->input('notes') === 'A partial edit')
                    ->andReturn(response()->json(['id' => $expectedId, 'notes' => 'A partial edit']));

                $this->putJson("/api/v1/admin/{$resource}/{$id}", ['notes' => 'A partial edit'])
                    ->assertOk()->assertExactJson(['id' => $expectedId, 'notes' => 'A partial edit']);
            }
        }
    }

    public function test_a_valid_but_missing_id_retains_the_controller_response(): void
    {
        foreach (self::CONTROLLERS as $resource => $controller) {
            $this->partialMock($controller)->shouldReceive('update')->once()
                ->andReturn(response()->json(['message' => 'Existing missing-record response.'], 404));
            $this->putJson("/api/v1/admin/{$resource}/999", ['notes' => 'Example'])
                ->assertNotFound()->assertExactJson(['message' => 'Existing missing-record response.']);
        }
    }

    public function test_the_guard_is_scoped_to_the_two_update_routes(): void
    {
        $guarded = [];
        foreach (Route::getRoutes() as $route) {
            if (collect($route->gatherMiddleware())->contains(fn ($middleware) => str_starts_with($middleware, ValidateCrmRecordId::class))) {
                $guarded[] = [$route->uri(), $route->methods()];
            }
        }

        $this->assertSame([
            ['api/v1/admin/guests/{guest}', ['PUT']],
            ['api/v1/admin/inquiries/{inquiry}', ['PUT']],
        ], $guarded);
    }
}
