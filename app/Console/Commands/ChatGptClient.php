<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use InvalidArgumentException;
use Laravel\Passport\Client;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;
use Throwable;

class ChatGptClient extends Command
{
    protected $signature = 'chatgpt:client
        {--redirect-uri=* : Exact OAuth callback URI; repeat for each allowed callback}
        {--name=Hexa-Tech : Dedicated public client name}
        {--client-id= : Explicit client to update; otherwise use CHATGPT_PLUGIN_CLIENT_ID}';

    protected $description = 'Create or configure the dedicated public ChatGPT OAuth client without changing keys or environment files';

    public function handle(ClientRepository $clients): int
    {
        $redirects = ChatGptSetupConfiguration::redirects($this->option('redirect-uri'));
        if ($redirects === null) {
            $this->error('Provide exact --redirect-uri values using HTTPS, or HTTP loopback with an explicit port. Wildcards, fragments, credentials and commas are not accepted.');

            return self::FAILURE;
        }
        $name = trim((string) $this->option('name'));
        if ($name === '' || mb_strlen($name) > 255 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
            $this->error('The client name must contain 1 to 255 characters without control characters.');

            return self::FAILURE;
        }
        $id = (string) ($this->option('client-id') ?: config('chatgpt.client_id', ''));
        try {
            $client = Passport::client()->getConnection()->transaction(function () use ($clients, $name, $id, $redirects): Client {
                if ($id !== '') {
                    $client = Passport::client()->newQuery()->lockForUpdate()->find($id);
                    if (! $client || ! ChatGptSetupConfiguration::eligibleClient($client)) {
                        throw new InvalidArgumentException('The selected client must be an active, unowned public authorization-code and refresh-token client with mcp:use access. It was not changed.');
                    }
                    if ($client->name !== $name || ChatGptSetupConfiguration::redirects($client->redirect_uris) !== $redirects) {
                        $client->forceFill(['name' => $name, 'redirect_uris' => $redirects])->save();
                    }

                    return $client;
                }

                $named = Passport::client()->newQuery()->where('name', $name)->lockForUpdate()->get();
                if ($named->isNotEmpty()) {
                    if ($named->count() !== 1 || ! ChatGptSetupConfiguration::eligibleClient($named->first())
                        || ChatGptSetupConfiguration::redirects($named->first()->redirect_uris) !== $redirects) {
                        throw new InvalidArgumentException('A client with this name already exists. Set CHATGPT_PLUGIN_CLIENT_ID or supply --client-id to select the dedicated public client explicitly. Nothing was changed.');
                    }

                    return $named->first();
                }

                return $clients->createAuthorizationCodeGrantClient($name, $redirects, confidential: false);
            });
        } catch (InvalidArgumentException $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        } catch (Throwable) {
            // Database exceptions may include connection credentials or SQL values.
            $this->error('Client setup failed. Check the database connection and installed OAuth migrations. No environment files or signing keys were changed.');

            return self::FAILURE;
        }

        $this->info('Dedicated public OAuth client is configured.');
        $this->line('CHATGPT_PLUGIN_CLIENT_ID='.$client->id);
        $this->line('Set CHATGPT_PLUGIN_REDIRECT_URIS to the exact --redirect-uri values, joined by commas.');
        $this->line('Callbacks configured: '.count($redirects).'. No client secret is used.');
        $this->line('Environment files, signing keys and plugin enablement were not changed. Run chatgpt:status after applying configuration.');

        return self::SUCCESS;
    }
}
