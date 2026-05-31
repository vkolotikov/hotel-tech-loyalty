<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Admin diagnostics — staff-only, super_admin-gated, throttled.
 *
 * Surfaces ops-grade signals (config-presence flags, DNS, SaaS API ping)
 * WITHOUT echoing any secret material and WITHOUT acting as a verification
 * oracle for caller-supplied input. The previous public /billing/diag
 * endpoint accepted ?token=<jwt> and reported whether the signature
 * matched — that's a remote HS256 brute-force oracle and was removed.
 *
 * Mounted at: GET /v1/admin/diag/billing
 * Auth:       saas.auth + auth:sanctum + tenant + brand (group middleware)
 *           + admin:super_admin (route middleware)
 *           + throttle:5,1 (route middleware)
 */
class DiagController extends Controller
{
    public function billing(Request $request): JsonResponse
    {
        $saasApi = config('services.saas.api_url');
        $secret  = config('services.saas.jwt_secret');

        $result = [
            'saas_api_url'   => $saasApi,
            // Presence-only — never report length, never echo any prefix.
            'has_jwt_secret' => (bool) $secret,
            'php_version'    => PHP_VERSION,
            'timestamp'      => now()->toIso8601String(),
        ];

        if (!$saasApi) {
            $result['connectivity'] = 'NOT_CONFIGURED';
            return response()->json($result);
        }

        // Test 1: DNS resolution
        $saasHost = parse_url($saasApi, PHP_URL_HOST);
        $start = microtime(true);
        $dnsResult = @dns_get_record($saasHost, DNS_A);
        $result['dns_ms'] = round((microtime(true) - $start) * 1000);
        $result['dns_resolved'] = !empty($dnsResult);
        $result['dns_ip'] = $dnsResult[0]['ip'] ?? null;

        // Test 2: GET to SaaS /up (health check)
        $start2 = microtime(true);
        try {
            $baseUrl = preg_replace('#/api$#', '', $saasApi);
            $response = Http::connectTimeout(2)->timeout(3)->get("{$baseUrl}/up");
            $result['health_check']  = 'OK';
            $result['health_status'] = $response->status();
            $result['health_ms']     = round((microtime(true) - $start2) * 1000);
        } catch (\Exception $e) {
            $result['health_check'] = 'FAILED';
            $result['health_error'] = $e->getMessage();
            $result['health_ms']    = round((microtime(true) - $start2) * 1000);
        }

        // Test 3: POST to SaaS API with bogus creds — should get 401/422.
        // Confirms the API is reachable AND speaking the expected protocol.
        $start3 = microtime(true);
        try {
            $apiRes = Http::connectTimeout(2)->timeout(3)->post("{$saasApi}/auth/token", [
                'email'    => 'diag-test@test.com',
                'password' => 'diag-test',
            ]);
            $result['api_reachable'] = true;
            $result['api_status']    = $apiRes->status();
            $result['api_ms']        = round((microtime(true) - $start3) * 1000);
        } catch (\Exception $e) {
            $result['api_reachable'] = false;
            $result['api_error']     = $e->getMessage();
            $result['api_ms']        = round((microtime(true) - $start3) * 1000);
        }

        return response()->json($result);
    }
}
