<?php
namespace App\Http\Controllers\Api\V1\Admin {
    function curl_init($url) { $GLOBALS['audit_smoobu_url']=$url; return new \stdClass; }
    function curl_setopt_array($ch,$options) { $GLOBALS['audit_smoobu_options']=$options; return true; }
    function curl_exec($ch) { return '{"apartments":[]}'; }
    function curl_getinfo($ch,$option) { return 200; }
    function curl_error($ch) { return ''; }
    function curl_close($ch) {}
}
namespace Tests\Feature\Audit {
    use App\Models\HotelSetting;
    use Illuminate\Foundation\Testing\DatabaseTransactions;
    use Tests\Concerns\SetsUpAppointmentsSchema;
    use Tests\TestCase;
    class IntegrationUrlBoundaryAuditTest extends TestCase {
        use DatabaseTransactions, SetsUpAppointmentsSchema;
        protected function setUp(): void { parent::setUp(); $this->setUpAppointments(); $this->setUpBookingRefundSchema(); }
        public function test_manager_can_route_connection_probe_with_platform_fallback_to_loopback(): void {
            config()->set('admin_access.mode','enforce');
            app()->instance('current_organization_id',$this->org->id);
            $_ENV['SMOOBU_API_KEY']='audit-placeholder-platform-key'; $_SERVER['SMOOBU_API_KEY']='audit-placeholder-platform-key'; putenv('SMOOBU_API_KEY=audit-placeholder-platform-key');
            try {
                HotelSetting::withoutGlobalScopes()->where('organization_id',$this->org->id)->whereIn('key',['booking_smoobu_base_url','booking_smoobu_api_key'])->delete();
                $this->actingAs($this->staff,'sanctum')->putJson('/api/v1/admin/settings',['settings'=>[['key'=>'booking_smoobu_base_url','value'=>'http://127.0.0.1:9876/internal']]])->assertOk()->assertJsonPath('written',1);
                $this->actingAs($this->staff,'sanctum')->postJson('/api/v1/admin/settings/test-integration',['type'=>'smoobu'])->assertOk()->assertJsonPath('success',true);
                $this->assertSame('http://127.0.0.1:9876/internal/apartments?page=1&page_size=50',$GLOBALS['audit_smoobu_url']);
                $this->assertContains('Api-Key: audit-placeholder-platform-key',$GLOBALS['audit_smoobu_options'][CURLOPT_HTTPHEADER]);
            } finally { unset($_ENV['SMOOBU_API_KEY'],$_SERVER['SMOOBU_API_KEY']); putenv('SMOOBU_API_KEY'); }
        }
    }
}