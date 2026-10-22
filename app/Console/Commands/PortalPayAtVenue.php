<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Organization;
use App\Services\Booking\PayAtVenueFallback;
use App\Services\Booking\Setup\BookingRules;
use Illuminate\Console\Command;

/**
 * Reads or switches "Take bookings to pay at the venue when online payment is unavailable" for one organisation
 * (release 6, spec 2026-10-23 §2 item 4): the member portal's fallback (PayAtVenueFallback), off by default, otherwise
 * switched only in the Appointments workspace's Setup → Settings — which `php artisan workspace:appointments
 * <organisation id> --off` hides. The command writes the same setting the same way, through BookingRules::write(),
 * and records each change in the audit log (`booking.pay_at_venue_changed`, the old and the new value).
 *
 *   php artisan portal:pay-at-venue <organisation id> --status
 *   php artisan portal:pay-at-venue <organisation id> --on
 *   php artisan portal:pay-at-venue <organisation id> --off
 */
class PortalPayAtVenue extends Command
{
    protected $signature = 'portal:pay-at-venue
                            {org : The organisation id}
                            {--on : Take member-portal bookings to pay at the venue when Stripe cannot be reached}
                            {--off : Never take them without an online payment}
                            {--status : Show the setting (the default when no option is given)}';

    protected $description = 'Read or switch the member portal\'s "pay at the venue when online payment is unavailable" for an organisation, also with the Appointments workspace off';

    protected $help = <<<'HELP'
        This is the Appointments workspace's Setup → Settings switch "Take bookings to pay at the venue when online
        payment is unavailable" (hotel_settings `portal_pay_at_venue_when_unavailable`, off by default). Use it when the
        workspace is switched off for the organisation (php artisan workspace:appointments <organisation id> --off),
        which hides Setup. It is written as that screen writes it (BookingRules) and each change is audited
        (booking.pay_at_venue_changed).

        When it is on, a member-portal booking whose payment cannot reach Stripe (Stripe unreachable, never another
        Stripe error) may be confirmed to be paid at the venue, for that one booking. The public booking widget is not
        affected.

          php artisan portal:pay-at-venue <organisation id> --status
          php artisan portal:pay-at-venue <organisation id> --on
          php artisan portal:pay-at-venue <organisation id> --off
        HELP;

    public function handle(BookingRules $rules): int
    {
        $raw = (string) $this->argument('org');
        $org = ctype_digit($raw) ? Organization::query()->find((int) $raw) : null;
        if (!$org) {
            $this->error('Name an existing organisation: php artisan portal:pay-at-venue <organisation id> --on|--off|--status');

            return self::FAILURE;
        }
        if (count(array_filter([$this->option('on'), $this->option('off'), $this->option('status')])) > 1) {
            $this->error('Choose one of --on, --off and --status.');

            return self::FAILURE;
        }

        // The setting is read and written for this organisation, whatever the console had bound; put back after.
        $wasBound = app()->bound('current_organization_id');
        $prior = $wasBound ? app('current_organization_id') : null;
        app()->instance('current_organization_id', (int) $org->id);
        try {
            $was = PayAtVenueFallback::enabled();
            $want = $this->option('on') ? true : ($this->option('off') ? false : null);

            if ($want !== null && $want !== $was) {
                $rules->write($org, ['pay_at_venue_when_unavailable' => $want]);
                AuditLog::record('booking.pay_at_venue_changed', $org,
                    ['pay_at_venue_when_unavailable' => $want], ['pay_at_venue_when_unavailable' => $was],
                    null, 'Switched with php artisan portal:pay-at-venue');
            }
            $now = PayAtVenueFallback::enabled();
        } finally {
            $wasBound ? app()->instance('current_organization_id', $prior) : app()->forgetInstance('current_organization_id');
        }

        $this->line(sprintf(
            'org %d (%s): pay at the venue when online payment is unavailable: %s%s',
            $org->id,
            $org->name,
            $now ? 'ON' : 'off',
            $want !== null && $want === $was ? ' (it already was; nothing changed)' : '',
        ));

        return self::SUCCESS;
    }
}
