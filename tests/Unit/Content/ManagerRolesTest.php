<?php

namespace Tests\Unit\Content;

use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Content\ContentAccess;
use App\Support\AdminAccess\AccessMap;
use PHPUnit\Framework\TestCase;

/** One list of the roles that manage (spec 2026-10-15 §3.2): the access map's. */
class ManagerRolesTest extends TestCase
{
    public function test_the_access_map_holds_the_only_list_of_manager_roles(): void
    {
        $this->assertSame(['super_admin', 'manager'], AccessMap::MANAGER_ROLES);
        $this->assertFalse(defined(ContentAccess::class . '::MANAGER_ROLES'));
        $this->assertFalse(defined(SetupAccess::class . '::MANAGER_ROLES'));
    }
}
