<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route as RouteFacade;
use Illuminate\Support\Str;
use ReflectionMethod;

class ApiDocsController extends Controller
{
    public function ui(): Response
    {
        $specUrl = url('/api/docs/spec.json');
        $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hotel Loyalty API — Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css">
  <style>
    body { margin: 0; background: #1a1a2e; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { max-width: 1400px; margin: 0 auto; }
    /* Dark theme overrides */
    .swagger-ui, .swagger-ui .info .title, .swagger-ui .opblock-tag,
    .swagger-ui .opblock .opblock-summary-description, .swagger-ui table thead tr td,
    .swagger-ui table thead tr th, .swagger-ui .response-col_status,
    .swagger-ui .parameter__name, .swagger-ui .parameter__type,
    .swagger-ui .model-title, .swagger-ui .model { color: #e0e0e0 !important; }
    .swagger-ui .info .title small { background: #c9a84c !important; }
    .swagger-ui .info { margin: 30px 0; }
    .swagger-ui .scheme-container { background: #16213e !important; box-shadow: none; }
    .swagger-ui .opblock .opblock-summary { border-color: #2e2e50 !important; }
    .swagger-ui section.models { border-color: #2e2e50 !important; }
    .swagger-ui .opblock { border-color: #2e2e50 !important; background: rgba(255,255,255,0.02); }
    .swagger-ui .opblock .opblock-section-header { background: rgba(255,255,255,0.03) !important; }
    .swagger-ui .btn { border-color: #c9a84c !important; color: #c9a84c !important; }
    .swagger-ui .btn.authorize { background: transparent; }
    .swagger-ui .btn.execute { background: #c9a84c !important; color: #000 !important; }
    .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select {
      background: #0f3460 !important; color: #e0e0e0 !important; border-color: #2e2e50 !important;
    }
    .swagger-ui .model-box { background: rgba(255,255,255,0.03) !important; }
    .swagger-ui .opblock-tag { border-bottom-color: #2e2e50 !important; }
    .swagger-ui .loading-container .loading::after { color: #c9a84c; }
    #header { background: #16213e; padding: 20px 40px; border-bottom: 1px solid #2e2e50; display: flex; align-items: center; gap: 12px; }
    #header h1 { margin: 0; font: bold 20px/1 Inter, system-ui, sans-serif; color: #fff; }
    #header span { font: 12px/1 Inter, system-ui, sans-serif; color: #8e8e93; }
    #header .badge { background: #c9a84c; color: #000; padding: 2px 8px; border-radius: 9999px; font: bold 11px/1.5 Inter, sans-serif; }
  </style>
</head>
<body>
  <div id="header">
    <h1>Hotel Loyalty API</h1>
    <span class="badge">OpenAPI 3.0</span>
    <span>Auto-generated from Laravel routes</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "{$specUrl}",
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: -1,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    })
  </script>
</body>
</html>
HTML;

        return response($html, 200, ['Content-Type' => 'text/html']);
    }

    public function spec(): JsonResponse
    {
        $spec = Cache::remember('api_docs:openapi_spec', 300, fn () => $this->generateSpec());
        return response()->json($spec);
    }

    /* ────────────────────────────────────────────────
     *  Spec generator — introspects routes + validation
     * ──────────────────────────────────────────────── */

    private function generateSpec(): array
    {
        $spec = [
            'openapi' => '3.0.3',
            'info' => [
                'title'       => 'Hotel Loyalty & CRM API',
                'version'     => '1.0.0',
                'description' => "Full REST API for the Hotel Loyalty Program and CRM platform.\n\n"
                    . "**Authentication:** Most endpoints require a Bearer token obtained via `POST /api/v1/auth/login`.\n\n"
                    . "**Roles:** Member endpoints are under `/member`, admin endpoints under `/admin`.\n\n"
                    . "This spec is auto-generated from the Laravel route definitions and controller validation rules.",
                'contact' => ['name' => 'Hotel Tech Team'],
            ],
            'servers' => [
                ['url' => url('/api'), 'description' => 'Current server'],
            ],
            'tags'       => [],
            'paths'      => [],
            'components' => [
                'securitySchemes' => [
                    'BearerAuth' => [
                        'type'         => 'http',
                        'scheme'       => 'bearer',
                        'bearerFormat' => 'Sanctum',
                        'description'  => 'Token from POST /v1/auth/login',
                    ],
                ],
                'schemas' => $this->commonSchemas(),
            ],
        ];

        $routes = collect(RouteFacade::getRoutes()->getRoutes())
            ->filter(fn (Route $r) => Str::startsWith($r->uri(), 'api/v1/'))
            ->sortBy(fn (Route $r) => $r->uri());

        $tagMap = [];

        foreach ($routes as $route) {
            $methods = collect($route->methods())->reject(fn ($m) => $m === 'HEAD')->values()->all();
            if (!$methods) continue;

            $uri = '/' . Str::after($route->uri(), 'api/');
            $action = $route->getAction();

            // Skip closure routes for tag detection but still document them
            $controllerClass = null;
            $methodName = null;
            $tag = 'Webhooks';

            if (isset($action['controller'])) {
                [$controllerClass, $methodName] = explode('@', $action['controller']);
                $tag = $this->controllerToTag($controllerClass);
            }

            if (!isset($tagMap[$tag])) {
                $tagMap[$tag] = true;
            }

            $requiresAuth = $this->routeRequiresAuth($route);

            foreach ($methods as $httpMethod) {
                $operation = $this->buildOperation(
                    strtolower($httpMethod), $uri, $tag,
                    $controllerClass, $methodName, $requiresAuth, $route
                );

                $spec['paths'][$uri][strtolower($httpMethod)] = $operation;
            }
        }

        // Build sorted tag list
        $tagOrder = ['Auth', 'Member', 'Points', 'Offers', 'Bookings', 'Referrals', 'Notifications',
            'Chatbot', 'Dashboard', 'Members Admin', 'Scanning', 'NFC', 'Tiers', 'Offers Admin',
            'Benefits', 'Properties', 'Segments', 'Analytics', 'Campaigns', 'Email Templates',
            'Settings', 'Guests', 'Inquiries', 'Reservations', 'Corporate', 'Planner', 'Venues',
            'Audit Log', 'CRM Settings', 'CRM AI', 'Realtime', 'Webhooks'];

        $spec['tags'] = collect($tagOrder)
            ->filter(fn ($t) => isset($tagMap[$t]))
            ->merge(collect(array_keys($tagMap))->diff($tagOrder))
            ->unique()
            ->map(fn ($t) => ['name' => $t, 'description' => $this->tagDescription($t)])
            ->values()
            ->all();

        return $spec;
    }

    private function buildOperation(
        string $method, string $uri, string $tag,
        ?string $controllerClass, ?string $methodName,
        bool $requiresAuth, Route $route
    ): array {
        $operationId = $methodName
            ? Str::camel(class_basename($controllerClass) . '_' . $methodName)
            : Str::camel(str_replace(['/', '{', '}', '-'], ['_', '', '', '_'], $uri));

        $summary = $this->generateSummary($controllerClass, $methodName, $method, $uri);

        $operation = [
            'tags'        => [$tag],
            'summary'     => $summary,
            'operationId' => $operationId,
            'responses'   => $this->defaultResponses($method),
        ];

        if ($requiresAuth) {
            $operation['security'] = [['BearerAuth' => []]];
        }

        // Path parameters
        $pathParams = $this->extractPathParams($uri);
        if ($pathParams) {
            $operation['parameters'] = $pathParams;
        }

        // Query parameters for GET routes
        if ($method === 'get' && $controllerClass && $methodName) {
            $queryParams = $this->extractQueryParams($controllerClass, $methodName);
            if ($queryParams) {
                $operation['parameters'] = array_merge($operation['parameters'] ?? [], $queryParams);
            }
        }

        // Request body for POST/PUT/PATCH
        if (in_array($method, ['post', 'put', 'patch']) && $controllerClass && $methodName) {
            $bodySchema = $this->extractRequestBody($controllerClass, $methodName);
            if ($bodySchema) {
                $operation['requestBody'] = [
                    'required' => true,
                    'content'  => ['application/json' => ['schema' => $bodySchema]],
                ];
            }
        }

        return $operation;
    }

    /* ────────────────────────────────────────────────
     *  Validation-rule extraction via reflection
     * ──────────────────────────────────────────────── */

    private function extractRequestBody(?string $class, ?string $method): ?array
    {
        $rules = $this->getValidationRules($class, $method);
        if (!$rules) return null;
        return $this->rulesToSchema($rules);
    }

    private function extractQueryParams(?string $class, ?string $method): array
    {
        $rules = $this->getValidationRules($class, $method);
        $params = [];

        // Also detect $request->get() / $request->input() / $request->query() calls
        $gets = $this->extractRequestGets($class, $method);

        foreach ($gets as $name => $default) {
            $params[] = [
                'name'     => $name,
                'in'       => 'query',
                'required' => false,
                'schema'   => ['type' => is_int($default) ? 'integer' : 'string'],
            ];
        }

        if ($rules) {
            foreach ($rules as $field => $ruleStr) {
                // Skip nested/dot notation in query params
                if (str_contains($field, '.')) continue;
                $fieldRules = is_string($ruleStr) ? explode('|', $ruleStr) : (array) $ruleStr;
                $schema = $this->ruleToType($fieldRules);
                $params[] = [
                    'name'     => $field,
                    'in'       => 'query',
                    'required' => in_array('required', $fieldRules),
                    'schema'   => $schema,
                ];
            }
        }

        // Deduplicate by name
        $seen = [];
        return array_values(array_filter($params, function ($p) use (&$seen) {
            if (isset($seen[$p['name']])) return false;
            $seen[$p['name']] = true;
            return true;
        }));
    }

    private function getValidationRules(?string $class, ?string $method): ?array
    {
        if (!$class || !$method || !class_exists($class)) return null;

        try {
            $ref = new ReflectionMethod($class, $method);
        } catch (\Throwable) {
            return null;
        }

        $source = $this->getMethodSource($ref);
        if (!$source) return null;

        // Match $request->validate([ ... ]) or $validated = $request->validate([ ... ])
        if (!preg_match('/->validate\(\s*\[/s', $source)) return null;

        // Extract the array inside validate([...])
        $pos = strpos($source, '->validate(');
        if ($pos === false) return null;

        $start = strpos($source, '[', $pos);
        if ($start === false) return null;

        $arrayStr = $this->extractBalancedBrackets($source, $start);
        if (!$arrayStr) return null;

        return $this->parsePhpArray($arrayStr);
    }

    private function extractRequestGets(?string $class, ?string $method): array
    {
        if (!$class || !$method || !class_exists($class)) return [];

        try {
            $ref = new ReflectionMethod($class, $method);
        } catch (\Throwable) {
            return [];
        }

        $source = $this->getMethodSource($ref);
        if (!$source) return [];

        $gets = [];
        // Match $request->get('name', default) and $request->input('name') and $request->query('name')
        preg_match_all('/\$request->(?:get|input|query)\(\s*[\'"](\w+)[\'"]\s*(?:,\s*([^)]+))?\)/', $source, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $name = $m[1];
            $default = isset($m[2]) ? trim($m[2]) : null;
            $gets[$name] = is_numeric($default) ? (int) $default : $default;
        }

        return $gets;
    }

    private function getMethodSource(ReflectionMethod $ref): ?string
    {
        $file = $ref->getFileName();
        if (!$file || !file_exists($file)) return null;

        $lines = file($file);
        $start = $ref->getStartLine() - 1;
        $end = $ref->getEndLine();

        return implode('', array_slice($lines, $start, $end - $start));
    }

    private function extractBalancedBrackets(string $source, int $start): ?string
    {
        $depth = 0;
        $len = strlen($source);
        for ($i = $start; $i < $len; $i++) {
            if ($source[$i] === '[') $depth++;
            elseif ($source[$i] === ']') {
                $depth--;
                if ($depth === 0) {
                    return substr($source, $start, $i - $start + 1);
                }
            }
        }
        return null;
    }

    private function parsePhpArray(string $arrayStr): array
    {
        $rules = [];
        // Match 'field_name' => 'rules|here' or "field_name" => "rules"
        preg_match_all(
            '/[\'"]([a-zA-Z_][\w.*]*)[\'\"]\s*=>\s*[\'"]([^\'"]+)[\'"]/',
            $arrayStr, $matches, PREG_SET_ORDER
        );
        foreach ($matches as $m) {
            $rules[$m[1]] = $m[2];
        }
        return $rules;
    }

    /* ────────────────────────────────────────────────
     *  Laravel rules → OpenAPI schema mapping
     * ──────────────────────────────────────────────── */

    private function rulesToSchema(array $rules): array
    {
        $properties = [];
        $required = [];

        foreach ($rules as $field => $ruleStr) {
            // Skip nested array validation like messages.*.role
            if (str_contains($field, '.')) continue;

            $fieldRules = is_string($ruleStr) ? explode('|', $ruleStr) : (array) $ruleStr;
            $properties[$field] = $this->ruleToType($fieldRules);

            if (in_array('required', $fieldRules)) {
                $required[] = $field;
            }
        }

        $schema = ['type' => 'object', 'properties' => $properties];
        if ($required) $schema['required'] = $required;
        return $schema;
    }

    private function ruleToType(array $rules): array
    {
        $schema = ['type' => 'string'];
        $isNullable = in_array('nullable', $rules);

        foreach ($rules as $rule) {
            $rule = trim($rule);
            if (in_array($rule, ['integer', 'int'])) {
                $schema['type'] = 'integer';
            } elseif (in_array($rule, ['numeric', 'decimal'])) {
                $schema['type'] = 'number';
            } elseif ($rule === 'boolean') {
                $schema['type'] = 'boolean';
            } elseif ($rule === 'array') {
                $schema['type'] = 'array';
                $schema['items'] = ['type' => 'string'];
            } elseif ($rule === 'email') {
                $schema['format'] = 'email';
            } elseif ($rule === 'date') {
                $schema['format'] = 'date';
            } elseif ($rule === 'url') {
                $schema['format'] = 'uri';
            } elseif ($rule === 'confirmed') {
                // password_confirmation field is implied
            } elseif (str_starts_with($rule, 'max:')) {
                $val = (int) Str::after($rule, 'max:');
                if (($schema['type'] ?? '') === 'string') $schema['maxLength'] = $val;
                else $schema['maximum'] = $val;
            } elseif (str_starts_with($rule, 'min:')) {
                $val = (int) Str::after($rule, 'min:');
                if (($schema['type'] ?? '') === 'string') $schema['minLength'] = $val;
                else $schema['minimum'] = $val;
            } elseif (str_starts_with($rule, 'in:')) {
                $schema['enum'] = explode(',', Str::after($rule, 'in:'));
            }
        }

        if ($isNullable) {
            $schema['nullable'] = true;
        }

        return $schema;
    }

    /* ────────────────────────────────────────────────
     *  Route → Tag / Summary helpers
     * ──────────────────────────────────────────────── */

    private function controllerToTag(string $class): string
    {
        $base = class_basename($class);

        return match ($base) {
            'AuthController'              => 'Auth',
            'MemberController'            => 'Member',
            'PointsController'            => 'Points',
            'OfferController'             => 'Offers',
            'BookingController'           => 'Bookings',
            'ReferralController'          => 'Referrals',
            'ChatbotController'           => 'Chatbot',
            'DashboardController'         => 'Dashboard',
            'MemberAdminController'       => 'Members Admin',
            'ScanController'              => 'Scanning',
            'NfcController'               => 'NFC',
            'TierController'              => 'Tiers',
            'OffersAdminController'       => 'Offers Admin',
            'BenefitAdminController'      => 'Benefits',
            'PropertyAdminController'     => 'Properties',
            'CampaignSegmentController'   => 'Segments',
            'AnalyticsController'         => 'Analytics',
            'NotificationController'      => 'Notifications',
            'EmailTemplateController'     => 'Email Templates',
            'SettingsController'          => 'Settings',
            'GuestController'             => 'Guests',
            'InquiryController'           => 'Inquiries',
            'ReservationController'       => 'Reservations',
            'CorporateAccountController'  => 'Corporate',
            'PlannerController'           => 'Planner',
            'VenueController'             => 'Venues',
            'AuditLogController'          => 'Audit Log',
            'CrmSettingsController'       => 'CRM Settings',
            'CrmAiController'             => 'CRM AI',
            'RealtimeController'          => 'Realtime',
            default                       => Str::headline(Str::replaceLast('Controller', '', $base)),
        };
    }

    private function generateSummary(?string $class, ?string $method, string $httpMethod, string $uri): string
    {
        if (!$method) {
            return Str::headline(str_replace(['/', '{', '}', '-'], [' ', '', '', ' '], Str::after($uri, '/v1/')));
        }

        // Convert camelCase method name to readable summary
        $readable = Str::headline($method);

        // Shorten common patterns
        $readable = str_replace(['Index', 'Store', 'Show', 'Update', 'Destroy'], ['List', 'Create', 'Get details', 'Update', 'Delete'], $readable);

        return $readable;
    }

    private function tagDescription(string $tag): string
    {
        return match ($tag) {
            'Auth'            => 'Authentication — register, login, logout, profile',
            'Member'          => 'Member-facing profile and card endpoints',
            'Points'          => 'Member points balance and transaction history',
            'Offers'          => 'Member-facing special offers',
            'Bookings'        => 'Member booking history',
            'Referrals'       => 'Member referral program',
            'Notifications'   => 'Push notification management',
            'Chatbot'         => 'AI chatbot for members',
            'Dashboard'       => 'Admin dashboard KPIs, charts, and activity feeds',
            'Members Admin'   => 'Admin member management — CRUD, points operations, AI insights',
            'Scanning'        => 'QR and NFC scanning for check-in',
            'NFC'             => 'NFC card issuance and management',
            'Tiers'           => 'Loyalty tier configuration',
            'Offers Admin'    => 'Admin offer management with AI generation',
            'Benefits'        => 'Benefit definitions, tier assignments, and entitlements',
            'Properties'      => 'Property and outlet management',
            'Segments'        => 'Campaign audience segmentation',
            'Analytics'       => 'Advanced analytics — revenue, engagement, trends, forecasts',
            'Campaigns'       => 'Push notification campaign management',
            'Email Templates' => 'Email template CRUD with merge tags',
            'Settings'        => 'Application settings and theming',
            'Guests'          => 'CRM guest/contact management with tags and segments',
            'Inquiries'       => 'CRM sales pipeline — inquiry tracking and follow-ups',
            'Reservations'    => 'CRM reservation management with check-in/out',
            'Corporate'       => 'Corporate account management with negotiated rates',
            'Planner'         => 'Task planner with subtasks and day notes',
            'Venues'          => 'Venue and event booking management',
            'Audit Log'       => 'System audit trail for compliance',
            'CRM Settings'    => 'CRM-specific configuration (room types, sources, etc.)',
            'CRM AI'          => 'AI assistant — chat, lead capture, member/corporate extraction',
            'Realtime'        => 'Server-Sent Events and polling for live updates',
            'Webhooks'        => 'External system webhook endpoints',
            default           => '',
        };
    }

    private function extractPathParams(string $uri): array
    {
        $params = [];
        preg_match_all('/\{(\w+)\}/', $uri, $matches);
        foreach ($matches[1] as $name) {
            $params[] = [
                'name'     => $name,
                'in'       => 'path',
                'required' => true,
                'schema'   => ['type' => 'integer'],
                'description' => Str::headline($name) . ' ID',
            ];
        }
        return $params;
    }

    private function routeRequiresAuth(Route $route): bool
    {
        $middleware = $route->gatherMiddleware();
        foreach ($middleware as $m) {
            if (str_contains((string) $m, 'auth:sanctum') || str_contains((string) $m, 'saas.auth')) {
                return true;
            }
        }
        return false;
    }

    private function defaultResponses(string $method): array
    {
        $responses = [
            '200' => ['description' => 'Successful operation', 'content' => ['application/json' => ['schema' => ['type' => 'object']]]],
        ];

        if (in_array($method, ['post'])) {
            $responses['201'] = ['description' => 'Created successfully'];
            $responses['422'] = ['description' => 'Validation error', 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ValidationError']]]];
        }
        if (in_array($method, ['put', 'patch', 'post'])) {
            $responses['422'] = ['description' => 'Validation error', 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ValidationError']]]];
        }

        $responses['401'] = ['description' => 'Unauthenticated'];

        return $responses;
    }

    private function commonSchemas(): array
    {
        return [
            'ValidationError' => [
                'type' => 'object',
                'properties' => [
                    'message' => ['type' => 'string', 'example' => 'The given data was invalid.'],
                    'errors'  => [
                        'type' => 'object',
                        'additionalProperties' => [
                            'type'  => 'array',
                            'items' => ['type' => 'string'],
                        ],
                    ],
                ],
            ],
            'PaginationMeta' => [
                'type' => 'object',
                'properties' => [
                    'current_page' => ['type' => 'integer'],
                    'from'         => ['type' => 'integer', 'nullable' => true],
                    'last_page'    => ['type' => 'integer'],
                    'per_page'     => ['type' => 'integer'],
                    'to'           => ['type' => 'integer', 'nullable' => true],
                    'total'        => ['type' => 'integer'],
                ],
            ],
        ];
    }
}
