<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * SaaS Platform JWT authentication middleware.
 *
 * Checks for a Bearer JWT issued by the SaaS Platform's /api/auth/token endpoint.
 * If valid, authenticates the request (creating a synthetic user if needed).
 * If no Bearer token is present, passes through to let Sanctum handle auth.
 */
class SaasAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Check for gateway-injected headers first
        $gatewayUserId = $request->header('X-Saas-User-Id');
        if ($gatewayUserId) {
            $request->attributes->set('saas_authenticated', true);
            $request->attributes->set('saas_user_id', $gatewayUserId);
            $request->attributes->set('saas_user_email', $request->header('X-Saas-User-Email', ''));
            $request->attributes->set('saas_org_id', $request->header('X-Saas-Org-Id', ''));
            $request->attributes->set('saas_role', $request->header('X-Saas-Role', ''));
            $this->authenticateSaasUser($request);
            return $next($request);
        }

        // Check for Bearer token
        $authHeader = $request->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
            // Sanctum tokens contain a "|" separator — let Sanctum handle those
            if ($token !== '' && !str_contains($token, '|')) {
                $result = $this->verifyJwt($token);
                if ($result['valid'] ?? false) {
                    $user = $result['user'] ?? [];
                    $org = $result['organization'] ?? [];
                    $request->attributes->set('saas_authenticated', true);
                    $request->attributes->set('saas_user_id', $user['id'] ?? '');
                    $request->attributes->set('saas_user_email', $user['email'] ?? '');
                    $request->attributes->set('saas_org_id', $org['id'] ?? '');
                    $request->attributes->set('saas_role', $org['role'] ?? '');
                    $this->authenticateSaasUser($request);
                    return $next($request);
                }

                // Invalid token present — reject
                return response()->json([
                    'error' => $result['error'] ?? 'Invalid or expired SaaS token',
                    'code' => 'unauthorized',
                ], 401);
            }
        }

        // No SaaS auth — pass through to Sanctum
        return $next($request);
    }

    /**
     * Verify a JWT token using the SaasAuth PHP SDK.
     *
     * @return array SDK result with 'valid', 'user', 'organization', 'error' keys
     */
    private function verifyJwt(string $token): array
    {
        $secret = config('services.saas.jwt_secret', '');
        if (!$secret) {
            return ['valid' => false, 'error' => 'JWT secret not configured'];
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return ['valid' => false, 'error' => 'Invalid token format'];
        }

        [$header, $payload, $signature] = $parts;

        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$header.$payload", $secret, true)), '+/', '-_'), '=');
        if (!hash_equals($expected, $signature)) {
            return ['valid' => false, 'error' => 'Invalid signature'];
        }

        $data = json_decode(base64_decode(str_pad(strtr($payload, '-_', '+/'), strlen($payload) % 4 ? strlen($payload) + 4 - strlen($payload) % 4 : strlen($payload), '=')), true);
        if (!$data) {
            return ['valid' => false, 'error' => 'Invalid payload'];
        }

        if (isset($data['exp']) && $data['exp'] < time()) {
            return ['valid' => false, 'error' => 'Token expired'];
        }

        return [
            'valid' => true,
            'user'  => [
                'id'    => $data['userId'] ?? $data['sub'] ?? '',
                'email' => $data['email'] ?? '',
            ],
            'organization' => isset($data['currentOrgId']) ? [
                'id'   => $data['currentOrgId'],
                'slug' => $data['currentOrgSlug'] ?? '',
                'role' => $data['role'] ?? 'STAFF',
            ] : null,
        ];
    }

    /**
     * Find or create a local user matching the SaaS identity and authenticate them.
     */
    private function authenticateSaasUser(Request $request): void
    {
        $email = $request->attributes->get('saas_user_email');
        if (!$email) {
            return;
        }

        // Try to find existing staff user by email
        $user = \App\Models\User::where('email', $email)
            ->where('user_type', 'staff')
            ->first();

        if ($user) {
            Auth::login($user);
        }
        // If no local user found, the request still proceeds as saas_authenticated
        // but controllers that need Auth::user() won't have one.
        // Admin routes typically need a local staff user, so consider provisioning one
        // or handling this case in controllers.
    }
}
