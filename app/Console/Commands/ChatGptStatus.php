<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Laravel\Passport\Passport;
use League\OAuth2\Server\CryptKey;
use Symfony\Component\Console\Formatter\OutputFormatter;
use Throwable;

class ChatGptStatus extends Command
{
    protected $signature = 'chatgpt:status {--resource= : Expected canonical MCP URL to check against this deployment}';

    protected $description = 'Read-only ChatGPT preflight: configuration, OAuth schema, signing keys, client callbacks and pilot organizations';

    public function handle(): int
    {
        $checks = [];
        $origin = ChatGptSetupConfiguration::origin(config('chatgpt.url'));
        $checks[] = ['Plugin enabled', (bool) config('chatgpt.enabled'), config('chatgpt.enabled') ? 'Enabled' : 'Disabled; requests remain closed'];
        $checks[] = ['Canonical HTTPS origin', $origin !== null, $origin ?? 'Set CHATGPT_PLUGIN_URL to an HTTPS origin without path, query or credentials'];
        $resourceMatches = $origin !== null && (! $this->option('resource') || $this->option('resource') === $origin.'/mcp');
        $checks[] = ['MCP resource', $resourceMatches, $resourceMatches ? $origin.'/mcp' : 'Expected resource does not match the canonical MCP URL'];

        try {
            $schema = Passport::client()->getConnection()->getSchemaBuilder();
            $required = [
                'oauth_clients' => ['id', 'name', 'secret', 'provider', 'owner_type', 'owner_id', 'redirect_uris', 'grant_types', 'revoked', 'created_at', 'updated_at'],
                'oauth_auth_codes' => ['id', 'user_id', 'client_id', 'scopes', 'plugin_organization_id', 'revoked', 'expires_at'],
                'oauth_access_tokens' => ['id', 'user_id', 'client_id', 'name', 'scopes', 'plugin_organization_id', 'revoked', 'expires_at', 'created_at', 'updated_at'],
                'oauth_refresh_tokens' => ['id', 'access_token_id', 'revoked', 'expires_at'],
            ];
            $missing = [];
            foreach ($required as $table => $columns) {
                if (! $schema->hasTable($table) || ! $schema->hasColumns($table, $columns)) {
                    $missing[] = $table;
                }
            }
            $checks[] = ['OAuth migrations/schema', $missing === [], $missing === [] ? 'All four OAuth tables and tenant-binding columns are installed' : 'Missing or incomplete tables: '.implode(', ', $missing)];
            $client = config('chatgpt.client_id') ? Passport::client()->newQuery()->find(config('chatgpt.client_id')) : null;
            $clientReady = $client !== null && ChatGptSetupConfiguration::eligibleClient($client);
            $checks[] = ['Dedicated public OAuth client', $clientReady, $clientReady ? 'Active authorization-code/refresh client; public; mcp:use allowed' : 'Configure an active dedicated public authorization-code/refresh client'];
            $redirects = ChatGptSetupConfiguration::redirects(config('chatgpt.redirect_uris', []));
            $redirectsMatch = $clientReady && $redirects !== null && ChatGptSetupConfiguration::redirects($client->redirect_uris) === $redirects;
            $checks[] = ['Exact callback allowlist', $redirectsMatch, $redirectsMatch ? count($redirects).' exact callback(s) match client and application configuration' : 'Client callbacks and CHATGPT_PLUGIN_REDIRECT_URIS must contain the same valid exact URLs'];
        } catch (Throwable) {
            $checks[] = ['OAuth database', false, 'Unable to read OAuth schema/client; check database connectivity and migrations'];
        }

        $keysReady = $this->usableSigningKeys();
        $checks[] = ['Passport signing key pair', $keysReady, $keysReady ? 'RSA pair is present, matches, and signs/verifies successfully' : 'Keys are missing, unreadable, mismatched, or unsuitable for RSA signing; no keys were changed'];
        $this->organizationChecks($checks);

        foreach ($checks as [$label, $passed, $detail]) {
            $this->line(($passed ? 'PASS' : 'FAIL').' '.$label.': '.OutputFormatter::escape($detail));
        }
        $this->line('Read-only local preflight. Live HTTPS reachability and ChatGPT account linking still require verification.');

        return collect($checks)->every(fn ($check) => $check[1]) ? self::SUCCESS : self::FAILURE;
    }

    private function usableSigningKeys(): bool
    {
        try {
            $keys = [];
            foreach (['private', 'public'] as $type) {
                $value = str_replace('\\n', "\n", config("passport.{$type}_key") ?? '');
                $key = new CryptKey($value ?: 'file://'.Passport::keyPath('oauth-'.$type.'.key'), null, false);
                $keys[$type] = $key->getKeyContents();
            }
            $private = @openssl_pkey_get_private($keys['private']);
            $public = @openssl_pkey_get_public($keys['public']);
            if ($private === false || $public === false) {
                return false;
            }
            foreach ([$private, $public] as $key) {
                $details = openssl_pkey_get_details($key);
                if (($details['type'] ?? null) !== OPENSSL_KEYTYPE_RSA || ($details['bits'] ?? 0) < 2048) {
                    return false;
                }
            }
            $message = random_bytes(32);

            return @openssl_sign($message, $signature, $private, OPENSSL_ALGO_SHA256)
                && @openssl_verify($message, $signature, $public, OPENSSL_ALGO_SHA256) === 1;
        } catch (Throwable) {
            return false;
        }
    }

    private function organizationChecks(array &$checks): void
    {
        $ids = config('chatgpt.organization_ids', []);
        if (config('chatgpt.all_organizations', false)) {
            $checks[] = ['Organization access', true, 'All organizations explicitly enabled; active staff and organization checks still apply'];

            return;
        }
        if (! is_array($ids) || $ids === []) {
            $checks[] = ['Organization access', false, 'Pilot allowlist is empty; no organizations can connect'];

            return;
        }
        try {
            if (! Schema::hasColumns('organizations', ['id', 'name', 'is_active', 'saas_deleted_at'])) {
                $checks[] = ['Pilot organizations', false, 'Organization schema is incomplete'];

                return;
            }
            foreach (array_unique($ids) as $id) {
                if (! filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]])) {
                    $checks[] = ['Pilot organization', false, 'Allowlist contains an invalid organization ID'];

                    continue;
                }
                $organization = Organization::query()->find($id, ['id', 'name', 'is_active', 'saas_deleted_at']);
                $active = $organization && $organization->is_active && ! $organization->saas_deleted_at;
                $name = $organization ? preg_replace('/[\x00-\x1F\x7F]/', '', $organization->name) : 'not found';
                $checks[] = ['Pilot organization #'.(int) $id, (bool) $active, $name.($active ? ' (active)' : ' (unavailable)')];
            }
        } catch (Throwable) {
            $checks[] = ['Pilot organizations', false, 'Unable to read organization availability'];
        }
    }
}
