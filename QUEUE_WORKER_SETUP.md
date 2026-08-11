# Queue worker — required from this deploy onward

`QUEUE_CONNECTION` has changed from `sync` to `database`. **A worker must be
running in production or queued work never happens.**

Until now the app had no jobs table, no `app/Jobs/` and no worker, so
`QUEUE_CONNECTION=sync` meant every `->queue()` call ran inline inside the web
request. Nothing failed loudly; requests just took as long as the work did.
That is survivable for a welcome email and not survivable for an email
campaign to thousands of people, which is why campaign sending is now a
queued, chained job.

## What breaks if you skip this

Email campaigns will sit in **`sending` forever**: the request enqueues the
first chunk and returns immediately, and with no worker nothing ever picks it
up. No error is shown, because from the app's point of view the send was
accepted. This is the one thing to get right before the first campaign.

## Deploy steps

**1. Run migrations** (creates `jobs` and `job_batches`):

```
php artisan migrate --force
```

**2. Set the env var** on the server:

```
QUEUE_CONNECTION=database
```

**3. Run a worker process.** On Laravel Cloud, add it to the existing Worker
container alongside `schedule:work`:

```
php artisan queue:work --tries=3 --timeout=300 --sleep=3 --max-time=3600
```

`--max-time=3600` recycles the process hourly, which keeps a long-lived PHP
worker from accumulating memory. Any supervisor (Supervisor, systemd, the
platform's own process manager) that restarts it on exit is fine.

**4. Restart the worker on every deploy.** A worker holds the old code in
memory until it restarts, so a deploy that changes a job class must be
followed by:

```
php artisan queue:restart
```

## Checking it works

```
php artisan queue:work --stop-when-empty     # drains and exits — useful locally
php artisan queue:failed                     # anything that exhausted its retries
php artisan queue:retry all                  # requeue them after fixing the cause
```

A campaign that has stalled is visible in the admin: `status` stays `sending`
and `last_progress_at` stops advancing. `POST /v1/admin/email-campaigns/{id}/cancel`
stops the chain, and `POST .../reset` puts a failed or cancelled campaign back
to draft so it can be edited and sent again — previously the only escape was
`duplicate()`, which duplicates the deliveries too.

## Notes

- The campaign job **chains** rather than fanning out: each chunk of 100
  recipients queues the next with a short delay. That paces delivery instead of
  handing an SMTP relay thousands of messages at once, and gives a natural
  resume point after a failure.
- Jobs re-bind tenant context by hand (`current_organization_id`), because a
  queued job runs outside the request that created it — `TenantMiddleware`
  never fires and every scoped query would otherwise fail closed.
- `failed_jobs` already existed; only the live tables were added.
