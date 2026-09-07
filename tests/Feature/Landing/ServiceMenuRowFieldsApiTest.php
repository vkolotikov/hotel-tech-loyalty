<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\ServiceController;
use App\Models\Service;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The two menu-row fields on the Services screen's own API — the service
 * window and the "starting price" mark that the landing menus print per row.
 *
 * Filed under the landing suite because the landing menus are the reason the
 * fields exist and because the admin Service API has no tests of its own;
 * exercised by calling the controller directly, exactly as
 * LandingPageAdminApiTest does and for the same reason (reaching the route
 * needs the whole `saas.auth` + Sanctum + subscription stack, which this repo
 * has no harness for). The tenancy traits read `current_organization_id` /
 * `current_brand_id` off the container, which is what the middleware binds.
 *
 * The values arrive as the Services form sends them: FormData strings, so the
 * mark is `'1'` / `'0'`, never a JSON boolean.
 */
class ServiceMenuRowFieldsApiTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();

        app()->instance('current_organization_id', 1);
        app()->instance('current_brand_id', 1);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        parent::tearDown();
    }

    private function controller(): ServiceController
    {
        return new ServiceController();
    }

    private function request(array $payload, string $method = 'POST'): Request
    {
        return Request::create('/v1/admin/services', $method, $payload);
    }

    /** The fields every row must carry to pass the form's own validation. */
    private function menu(array $overrides = []): array
    {
        return $overrides + ['name' => 'Le Déjeuner', 'duration_minutes' => 60, 'price' => 48, 'currency' => 'EUR'];
    }

    private function stored(int $id): object
    {
        return DB::table('services')->where('id', $id)->first(['service_window', 'price_is_from']);
    }

    // ─── Creating ────────────────────────────────────────────────────────

    public function test_a_new_menu_can_carry_a_window_and_a_starting_price_mark(): void
    {
        $response = $this->controller()->store($this->request($this->menu([
            'service_window' => 'Fri–Sun · 12:00', 'price_is_from' => '1',
        ])));

        $this->assertSame(201, $response->getStatusCode());
        $json = $response->getData(true);
        $this->assertSame('Fri–Sun · 12:00', $json['service_window']);
        $this->assertTrue($json['price_is_from']);

        $row = $this->stored($json['id']);
        $this->assertSame('Fri–Sun · 12:00', $row->service_window);
        $this->assertTrue((bool) $row->price_is_from);
    }

    public function test_a_new_menu_that_says_nothing_has_no_window_and_a_fixed_price(): void
    {
        $json = $this->controller()->store($this->request($this->menu()))->getData(true);

        $this->assertNull($json['service_window']);
        $this->assertFalse($json['price_is_from']);

        $row = $this->stored($json['id']);
        $this->assertNull($row->service_window);
        $this->assertFalse((bool) $row->price_is_from);
    }

    // ─── Editing ─────────────────────────────────────────────────────────

    public function test_an_existing_menu_can_take_its_window_and_mark_and_lose_them_again(): void
    {
        $service = Service::create($this->menu(['organization_id' => 1, 'brand_id' => 1, 'is_active' => true]));

        $json = $this->controller()->update($this->request([
            'service_window' => 'Evenings', 'price_is_from' => '1',
        ], 'PUT'), $service->id)->getData(true);

        $this->assertSame('Evenings', $json['service_window']);
        $this->assertTrue($json['price_is_from']);

        // Cleared: null for the window (standing in for the empty string the
        // kernel's ConvertEmptyStringsToNull turns into null before any
        // controller runs — the controller is called directly here, so that
        // middleware itself is not exercised), '0' for the mark.
        $json = $this->controller()->update($this->request([
            'service_window' => null, 'price_is_from' => '0',
        ], 'PUT'), $service->id)->getData(true);

        $this->assertNull($json['service_window']);
        $this->assertFalse($json['price_is_from']);

        $row = $this->stored($service->id);
        $this->assertNull($row->service_window);
        $this->assertFalse((bool) $row->price_is_from);
    }

    /** A save that does not mention the two fields leaves them exactly as they were. */
    public function test_a_save_that_omits_the_fields_leaves_them_as_they_were(): void
    {
        $service = Service::create($this->menu([
            'organization_id' => 1, 'brand_id' => 1, 'is_active' => true,
            'service_window' => 'Evenings', 'price_is_from' => true,
        ]));

        $json = $this->controller()->update($this->request(['name' => 'À la carte'], 'PUT'), $service->id)->getData(true);

        $this->assertSame('À la carte', $json['name']);
        $this->assertSame('Evenings', $json['service_window']);
        $this->assertTrue($json['price_is_from']);
    }

    /**
     * A mark that arrives as null — an empty string through the kernel's
     * ConvertEmptyStringsToNull, or an explicit null — is a fixed price,
     * never a NOT NULL violation surfacing as a 500.
     */
    public function test_a_null_mark_is_a_fixed_price_not_an_error(): void
    {
        $json = $this->controller()->store($this->request($this->menu(['price_is_from' => null])))->getData(true);

        $this->assertFalse($json['price_is_from']);

        $service = Service::create($this->menu(['organization_id' => 1, 'brand_id' => 1, 'is_active' => true, 'price_is_from' => true]));

        $json = $this->controller()->update($this->request(['price_is_from' => null], 'PUT'), $service->id)->getData(true);

        $this->assertFalse($json['price_is_from']);
        $this->assertFalse((bool) $this->stored($service->id)->price_is_from);
    }

    // ─── Bounds ──────────────────────────────────────────────────────────

    /** One line of a menu cell, never a paragraph: 120 characters fit, 121 do not. */
    public function test_the_window_is_one_line_of_a_menu_cell(): void
    {
        $json = $this->controller()->store($this->request($this->menu([
            'service_window' => str_repeat('w', 120),
        ])))->getData(true);
        $this->assertSame(120, mb_strlen($json['service_window']));

        try {
            $this->controller()->store($this->request($this->menu(['service_window' => str_repeat('w', 121)])));
            $this->fail('A 121-character window was accepted.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('service_window', $e->errors());
        }
    }

    public function test_the_mark_must_be_a_boolean(): void
    {
        try {
            $this->controller()->store($this->request($this->menu(['price_is_from' => 'yes'])));
            $this->fail("A mark of 'yes' was accepted.");
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('price_is_from', $e->errors());
        }
    }
}
