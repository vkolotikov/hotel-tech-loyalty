<?php

namespace App\Services\Booking\Setup;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * `exists:<table>,id` limited to the bound organisation. A bare `exists`
 * accepts another organisation's id, which the pivot then links across
 * tenants; the full admin and the workspace both validate links with this.
 */
final class OwnRows
{
    public static function rule(string $table): Exists
    {
        return Rule::exists($table, 'id')->where('organization_id', (int) app('current_organization_id'));
    }
}
