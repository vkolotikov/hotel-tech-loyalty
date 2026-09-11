<?php

namespace App\Http\Controllers\Api\V1\Integrations;

use App\Http\Controllers\Controller;
use App\Services\BusinessOutcomeReport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BusinessReportController extends Controller
{
    public function issue(Request $request)
    {
        $org = $request->user()?->organization_id;
        abort_unless($org, 403);
        $token = bin2hex(random_bytes(32));
        DB::table('business_report_keys')->updateOrInsert(['organization_id' => $org], [
            'token_hash' => hash('sha256', $token), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['token' => $token])->header('Cache-Control', 'no-store');
    }

    public function show(Request $request, BusinessOutcomeReport $report)
    {
        $token = $request->bearerToken();
        abort_unless(is_string($token) && preg_match('/^[a-f0-9]{64}$/D', $token), 401);
        $org = DB::table('business_report_keys')->where('token_hash', hash('sha256', $token))->value('organization_id');
        abort_unless($org, 401);

        return response()->json($report->build((int) $org))->header('Cache-Control', 'private, no-store');
    }
}
