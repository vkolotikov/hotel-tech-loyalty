<?php
namespace Tests\Feature\Audit;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Models\Organization;
use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;
class PlatformAuditReproductionTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;
    protected function setUp(): void { parent::setUp(); $this->setUpAppointments(); $this->setUpBookingRefundSchema(); }
    public function test_saas_verified_org_b_reuses_org_a_user_and_overwrites_org_a_password(): void {
        $orgB=Organization::create(['name'=>'Audit B','slug'=>'audit-b','saas_org_id'=>'saas-audit-b','subscription_status'=>'ACTIVE']);
        $originalId=$this->staff->id; $originalOrg=$this->staff->organization_id;
        app()->forgetInstance('current_organization_id'); app()->forgetInstance('current_brand_id');
        $method=new \ReflectionMethod(AuthController::class,'provisionLocalUserFromSaas');
        $result=$method->invoke(app(AuthController::class), ['user'=>['email'=>$this->staff->email,'name'=>'Audit actor'], 'organization'=>['id'=>'saas-audit-b','role'=>'OWNER']], 'audit-new-pass-123');
        $this->assertSame($originalId,$result->id);
        $this->assertSame($originalOrg,$result->organization_id);
        $this->assertNotSame($orgB->id,$result->organization_id);
        $this->assertTrue(Hash::check('audit-new-pass-123',$this->staff->fresh()->password));
        $this->assertDatabaseHas('staff',['user_id'=>$originalId,'organization_id'=>$orgB->id,'role'=>'super_admin']);
    }
    public function test_manager_can_create_missing_integration_secret_even_in_enforce_mode(): void {
        config()->set('admin_access.mode','enforce');
        app()->instance('current_organization_id',$this->org->id);
        HotelSetting::withoutGlobalScopes()->where('organization_id',$this->org->id)->where('key','twilio_auth_token')->delete();
        $this->actingAs($this->staff,'sanctum')->putJson('/api/v1/admin/settings',['settings'=>[['key'=>'twilio_auth_token','value'=>'audit-dummy-not-a-real-credential']]])->assertOk()->assertJsonPath('written',1);
        $this->assertDatabaseHas('hotel_settings',['organization_id'=>$this->org->id,'key'=>'twilio_auth_token','group'=>'general']);
        $this->actingAs($this->staff,'sanctum')->putJson('/api/v1/admin/settings',['settings'=>[['key'=>'twilio_auth_token','value'=>'audit-second-dummy']]])->assertOk()->assertJsonPath('written',1)->assertJsonPath('skipped',0);
    }
    private function accountTables(): void {
        if (!\Illuminate\Support\Facades\Schema::hasTable('email_verification_codes')) \Illuminate\Support\Facades\Schema::create('email_verification_codes',function($t){ $t->id(); $t->string('email'); $t->string('code',6); $t->timestamp('expires_at'); $t->timestamp('verified_at')->nullable(); $t->timestamps(); });
        if (!\Illuminate\Support\Facades\Schema::hasTable('personal_access_tokens')) \Illuminate\Support\Facades\Schema::create('personal_access_tokens',function($t){ $t->id(); $t->morphs('tokenable'); $t->string('name'); $t->string('token',64)->unique(); $t->text('abilities')->nullable(); $t->timestamp('last_used_at')->nullable(); $t->timestamp('expires_at')->nullable(); $t->timestamps(); });
    }
    public function test_manager_reinvite_demotes_the_last_active_owner(): void {
        $this->accountTables();
        \Illuminate\Support\Facades\Mail::fake();
        if (!\Illuminate\Support\Facades\Schema::hasColumn('staff','planner_skills')) \Illuminate\Support\Facades\Schema::table('staff',fn($t)=>$t->text('planner_skills')->nullable());
        config()->set('admin_access.mode','enforce');
        $owner=$this->staffUser($this->org);
        DB::table('staff')->where('user_id',$owner->id)->update(['role'=>'super_admin']);
        $this->assertSame(1, DB::table('staff')->where('organization_id',$this->org->id)->where('role','super_admin')->count());
        $response=$this->actingAs($this->staff,'sanctum')->postJson('/api/v1/admin/team/invite',['email'=>$owner->email,'name'=>'Audit owner','role'=>'manager']);
        $response->assertOk();
        $this->assertDatabaseHas('staff',['organization_id'=>$this->org->id,'user_id'=>$owner->id,'role'=>'manager']);
        $this->assertSame(0,DB::table('staff')->where('organization_id',$this->org->id)->where('role','super_admin')->where('is_active',true)->count());
    }
    public function test_password_reset_keeps_previous_sessions_valid(): void {
        $this->accountTables();
        $token=$this->staff->createToken('audit-pre-reset');
        $tokenId=$token->accessToken->id;
        \App\Models\EmailVerificationCode::create(['email'=>$this->staff->email,'code'=>'248591','expires_at'=>now()->addMinutes(15)]);
        $this->postJson('/api/v1/auth/reset-password',['email'=>$this->staff->email,'code'=>'248591','password'=>'audit-new-pass-456','password_confirmation'=>'audit-new-pass-456'])->assertOk();
        $this->assertTrue(Hash::check('audit-new-pass-456',$this->staff->fresh()->password));
        $this->assertDatabaseHas('personal_access_tokens',['id'=>$tokenId]);
        $this->withToken($token->plainTextToken)->getJson('/api/v1/auth/me')->assertOk();
    }
    public function test_public_login_saas_fallback_returns_wrong_tenant_identity(): void {
        $this->accountTables();
        config()->set('services.saas.api_url','https://saas-audit.example.test/api');
        config()->set('services.saas.jwt_secret','audit-only-signing-placeholder');
        $orgB=Organization::create(['name'=>'Audit B','slug'=>'audit-login-b','saas_org_id'=>'saas-login-b','subscription_status'=>'ACTIVE']);
        \Illuminate\Support\Facades\Http::preventStrayRequests();
        \Illuminate\Support\Facades\Http::fake(['https://saas-audit.example.test/api/auth/service-verify-password'=>\Illuminate\Support\Facades\Http::response(['user'=>['email'=>$this->staff->email,'name'=>'Audit actor'],'organization'=>['id'=>'saas-login-b','role'=>'OWNER']],200)]);
        app()->forgetInstance('current_organization_id'); app()->forgetInstance('current_brand_id');
        $result=$this->postJson('/api/v1/auth/login',['email'=>$this->staff->email,'password'=>'saas-only-new-password'])->assertOk()->assertJsonPath('user.id',$this->staff->id)->assertJsonPath('staff.role','manager');
        $this->assertTrue(Hash::check('saas-only-new-password',$this->staff->fresh()->password));
        $this->assertDatabaseHas('staff',['organization_id'=>$orgB->id,'user_id'=>$this->staff->id,'role'=>'super_admin']);
        $this->assertDatabaseHas('personal_access_tokens',['tokenable_id'=>$this->staff->id]);
    }
}