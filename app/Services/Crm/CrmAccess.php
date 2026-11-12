<?php

namespace App\Services\Crm;

use App\Models\Staff;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;

/**
 * Who may do what in HexaTech CRM (2026-11-07). The workspace reaches the full admin's own chat and CRM endpoints, so
 * their rules are the access map's (AccessMap::MAP): every staff member works the inbox, leads, deals, contacts and
 * tasks; the chatbot's behaviour, knowledge, pop-ups, the widget, canned replies and the pipelines are a manager's
 * changes. This class only answers those same rules for the bootstrap (`forBootstrap`), so the workspace can hide what
 * the server would refuse; the server decides either way.
 *
 * Staff rows are tenant-scoped, so the row read is this organisation's; a deactivated row counts for nothing.
 */
final class CrmAccess
{
    private static function staff(User $user): ?Staff
    {
        return Staff::where('user_id', $user->id)->where('is_active', true)->first();
    }

    public static function isManager(User $user): bool
    {
        if ($user->isPlatformAdmin()) {
            return true;
        }

        return in_array(self::staff($user)?->role, AccessMap::MANAGER_ROLES, true);
    }

    public static function role(User $user): ?string
    {
        return self::staff($user)?->role;
    }

    /**
     * @return array{manage_bot: bool, manage_widget: bool, manage_pipelines: bool, manage_canned: bool,
     *   manage_team: bool, delete_records: bool}
     */
    /**
     * The Analytics right, as AdminAccess judges a capability rule (`can_view_analytics`: admin/crm/reports and the
     * full admin's admin/reporting): a manager always; a staff member whose flag is set.
     */
    public static function viewsAnalytics(User $user): bool
    {
        if ($user->isPlatformAdmin()) {
            return true;
        }
        $staff = self::staff($user);

        return $staff !== null && (in_array($staff->role, AccessMap::MANAGER_ROLES, true) || (bool) $staff->can_view_analytics);
    }

    public static function forBootstrap(User $user): array
    {
        $manager = self::isManager($user);

        return [
            // admin/chatbot-config, admin/knowledge, admin/popup-rules, admin/training: changes are a manager's.
            'manage_bot'       => $manager,
            // admin/widget-config: changes are a manager's.
            'manage_widget'    => $manager,
            // admin/pipelines, admin/pipeline-stages, admin/inquiry-lost-reasons: changes are a manager's.
            'manage_pipelines' => $manager,
            // admin/chat-inbox-canned: changes are a manager's.
            'manage_canned'    => $manager,
            // admin/team (product account): a manager's.
            'manage_team'      => $manager,
            // Round 5 (2026-11-12): admin/email-templates — making and changing templates is a manager's (sending one is
            // everyone's, admin/email-templates/{template}/send).
            'manage_templates' => $manager,
            // Round 5: the Integrations page (lead-intake tokens, email sending, AI usage, channels) — a manager's.
            'manage_integrations' => $manager,
            // Round 5: admin/crm/reports (Insights → Reports) is the Analytics right's.
            'view_analytics'   => self::viewsAnalytics($user),
            // Deleting a lead, a contact or a visitor: every staff member may in the full admin; the workspace asks
            // first and shows what goes with it (delete-impact).
            'delete_records'   => true,
        ];
    }
}
