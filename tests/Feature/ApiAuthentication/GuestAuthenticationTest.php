<?php

namespace Tests\Feature\ApiAuthentication;

use App\Models\User;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Routing\Exception\RouteNotFoundException;
use Tests\TestCase;

class GuestAuthenticationTest extends TestCase
{
    #[DataProvider('acceptHeaders')]
    public function test_guest_api_requests_return_401_without_reporting_a_missing_login_route(array $headers): void
    {
        Exceptions::fake();

        $this->get('/api/v1/auth/me', $headers)
            ->assertUnauthorized()
            ->assertHeader('Content-Type', 'application/json')
            ->assertHeaderMissing('Location')
            ->assertExactJson(['error' => 'Unauthenticated', 'message' => 'Authentication required.']);

        Exceptions::assertNothingReported();
    }

    public static function acceptHeaders(): array
    {
        return [
            'no accept header' => [[]],
            'browser HTML' => [['Accept' => 'text/html']],
            'API JSON' => [['Accept' => 'application/json']],
        ];
    }

    public function test_a_protected_browser_route_redirects_to_the_existing_spa_login(): void
    {
        // /privacy is excluded from the SPA catch-all, so this test route
        // exercises ordinary web authentication without replacing SPA routes.
        Route::get('/privacy/_auth-regression', fn () => 'protected')->middleware(['web', 'auth']);
        Exceptions::fake();

        $this->get('/privacy/_auth-regression', ['Accept' => 'text/html'])->assertRedirect('/login');
        $this->get('/login', ['Accept' => 'text/html'])->assertOk();

        Exceptions::assertNothingReported();
    }

    public function test_authenticated_sanctum_requests_still_reach_the_endpoint(): void
    {
        Route::get('/api/_auth-regression', fn () => response()->json(['id' => auth()->id()]))
            ->middleware('auth:sanctum');
        Sanctum::actingAs((new User)->forceFill(['id' => 42, 'user_type' => 'staff']));

        $this->get('/api/_auth-regression', ['Accept' => 'text/html'])
            ->assertOk()->assertExactJson(['id' => 42]);
    }

    public function test_an_unrelated_missing_named_route_is_not_misreported_as_unauthenticated(): void
    {
        config(['app.debug' => false]);
        Route::get('/api/_missing-route-regression', fn () => route('regression.route.does.not.exist'));
        Exceptions::fake();

        $this->get('/api/_missing-route-regression')->assertStatus(500)
            ->assertExactJson(['error' => 'Server error', 'message' => 'An unexpected error occurred.']);

        Exceptions::assertReported(RouteNotFoundException::class);
    }
}
