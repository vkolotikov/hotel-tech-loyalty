<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailVerificationCode;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use App\Models\AuditLog;
use App\Services\PlanLimitGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Team management — invite team members to the admin with different
 * access roles. Settings → Team uses this.
 *
 * Identity model:
 *   - User row holds the login (email + password). user_type='staff'.
 *   - Staff row holds the role + per-feature permission flags scoped
 *     to the current organization.
 *   - Both are created in one transaction when an admin invites a
 *     new teammate.
 *
 * Invite flow (does NOT require SaaS):
 *   1. Admin enters email + name + role
 *   2. We create User + Staff locally with a random initial password
 *   3. Generate a 6-digit invite code (EmailVerificationCode, 48h TTL)
 *   4. Email the teammate a link to /activate?email=…
 *   5. They follow the existing claimAccount() flow to set their
 *      password and log in
 *
 * Roles:
 *   - super_admin — full control including team + billing
 *   - manager     — everything except team + billing
 *   - staff       — per-feature flags decide what they see
 *
 * Permission flags on Staff (per-feature):
 *   - can_award_points
 *   - can_redeem_points
 *   - can_manage_offers
 *   - can_view_analytics
 */
class TeamController extends Controller
{
    private const ROLES = ['super_admin', 'manager', 'staff'];

    /**
     * Canonical list of sidebar group labels. Must stay in sync with
     * `navGroups` in frontend/src/components/Layout.tsx. Overview +
     * System are intentionally absent here — they're locked-visible
     * via Layout's ALWAYS_VISIBLE set so a per-user whitelist can
     * never hide the Dashboard or Settings.
     */
    private const TOGGLEABLE_GROUPS = [
        'AI Chat',
        'Members & Loyalty',
        'Bookings',
        'CRM & Marketing',
        'Operations',
    ];

    /**
     * GET /v1/admin/team
     * List every staff member in the current org. Returns both active
     * and inactive so the admin can see deactivated accounts and
     * reactivate them.
     */
    public function index(Request $request): JsonResponse
    {
        $rows = Staff::with('user:id,name,email,phone,avatar_url')
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->get();

        // Pull the latest unverified invite code per email in one query
        // so the UI can show "expires in 36h" on each pending row instead
        // of just "Pending". Indexed only on the pending subset so a busy
        // team list doesn't fan out into one query per row.
        $pendingEmails = $rows
            ->filter(fn (Staff $s) => $s->user && !$s->last_login_at)
            ->pluck('user.email')
            ->filter()
            ->unique()
            ->values();
        $inviteExpiry = collect();
        if ($pendingEmails->isNotEmpty()) {
            $inviteExpiry = EmailVerificationCode::whereIn('email', $pendingEmails)
                ->whereNull('verified_at')
                ->where('expires_at', '>', now())
                ->orderByDesc('id')
                ->get(['email', 'expires_at'])
                ->groupBy('email')
                ->map(fn ($g) => $g->first()->expires_at);
        }

        $staff = $rows->map(fn (Staff $s) => [
                'id'                  => $s->id,
                'user_id'             => $s->user_id,
                'name'                => $s->user?->name,
                'email'               => $s->user?->email,
                'phone'               => $s->user?->phone,
                'avatar_url'          => $s->user?->avatar_url,
                'role'                => $s->role,
                'department'          => $s->department,
                'is_active'           => $s->is_active,
                'last_login_at'       => $s->last_login_at,
                'invite_expires_at'   => $s->last_login_at ? null : ($inviteExpiry[$s->user?->email] ?? null),
                'can_award_points'    => $s->can_award_points,
                'can_redeem_points'   => $s->can_redeem_points,
                'can_manage_offers'   => $s->can_manage_offers,
                'can_view_analytics'  => $s->can_view_analytics,
                'allowed_nav_groups'  => $s->allowed_nav_groups,
                'planner_skills'      => $s->planner_skills,
                'is_me'               => $s->user_id === $request->user()?->id,
            ]);

        return response()->json([
            'staff' => $staff,
            'roles' => self::ROLES,
            'available_groups' => self::TOGGLEABLE_GROUPS,
        ]);
    }

    /**
     * POST /v1/admin/team/invite
     * Invite a new teammate. Idempotent on email — if a staff record
     * already exists for the email in this org, returns it instead of
     * 422'ing so an admin can re-send to fix a typo'd address.
     */
    public function invite(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'                => 'required|email|max:200',
            'name'                 => 'required|string|max:200',
            'role'                 => 'required|string|in:' . implode(',', self::ROLES),
            'department'           => 'nullable|string|max:80',
            'can_award_points'     => 'nullable|boolean',
            'can_redeem_points'    => 'nullable|boolean',
            'can_manage_offers'    => 'nullable|boolean',
            'can_view_analytics'   => 'nullable|boolean',
            'allowed_nav_groups'   => 'nullable|array',
            'allowed_nav_groups.*' => 'string|in:' . implode(',', self::TOGGLEABLE_GROUPS),
            // Planner pool skill allowlist. Null = no restriction (this
            // staff can claim any task_group). Empty array = none.
            // Values are arbitrary strings matching planner_tasks.task_group
            // so we don't constrain them here — orgs configure their own
            // groups via Settings → Planner.
            'planner_skills'       => 'nullable|array',
            'planner_skills.*'     => 'string|max:80',
        ]);

        $email = strtolower(trim($validated['email']));
        $orgId = app('current_organization_id');

        // Only super_admin can mint another super_admin. Managers can
        // invite up to manager level.
        if ($validated['role'] === 'super_admin' && !$this->isCurrentUserSuperAdmin($request)) {
            return response()->json(['error' => 'Only super-admins can invite super-admins.'], 403);
        }

        // Plan-cap check. Skip when the email already maps to an existing
        // staff record in this org — re-inviting an existing teammate
        // doesn't add to the count and shouldn't be blocked.
        $existingStaff = Staff::withoutGlobalScopes()
            ->whereHas('user', fn ($q) => $q->where('email', $email))
            ->where('organization_id', $orgId)
            ->exists();
        if (!$existingStaff) {
            if ($block = app(PlanLimitGuard::class)->check(PlanLimitGuard::KEY_TEAM)) {
                return response()->json(['error' => $block, 'reason' => 'plan_limit'], 402);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $email, $orgId) {
                // Reuse an existing user in THIS org with THIS email.
                // Migration `2026_05_25_120000_users_email_unique_per_org_for_staff`
                // replaced the global users.email unique with two partial
                // uniques — staff are (org, email) unique, members are
                // globally email unique. So the same email can exist as:
                //   - a staff at multiple orgs (legitimate multi-org consultant)
                //   - a member at one org + a staff at another (or same) org
                // Filter by user_type='staff' so we don't accidentally
                // pick up a member row and treat them as the staff user.
                $user = User::withoutGlobalScopes()
                    ->where('email', $email)
                    ->where('organization_id', $orgId)
                    ->where('user_type', 'staff')
                    ->first();

                if (!$user) {
                    $user = User::withoutGlobalScopes()->create([
                        'name'            => $validated['name'],
                        'email'           => $email,
                        'password'        => Hash::make(Str::random(40)),
                        'user_type'       => 'staff',
                        'organization_id' => $orgId,
                    ]);
                }

                // Find-or-create staff row scoped to this org.
                $staff = Staff::withoutGlobalScopes()
                    ->where('user_id', $user->id)
                    ->where('organization_id', $orgId)
                    ->first();

                // allowed_nav_groups defaults to null (= "all visible per
                // org settings") for admins. For staff role we accept the
                // passed list as-is — even null means "all" for back-compat.
                $allowedGroups = $validated['allowed_nav_groups'] ?? null;
                if (in_array($validated['role'], ['super_admin', 'manager'], true)) {
                    // Admins always see everything regardless of this
                    // setting, but we still null it for clarity.
                    $allowedGroups = null;
                }

                $payload = [
                    'organization_id'    => $orgId,
                    'user_id'            => $user->id,
                    'role'               => $validated['role'],
                    'department'         => $validated['department'] ?? null,
                    'can_award_points'   => (bool) ($validated['can_award_points']   ?? in_array($validated['role'], ['super_admin', 'manager', 'staff'])),
                    'can_redeem_points'  => (bool) ($validated['can_redeem_points']  ?? in_array($validated['role'], ['super_admin', 'manager'])),
                    'can_manage_offers'  => (bool) ($validated['can_manage_offers']  ?? in_array($validated['role'], ['super_admin', 'manager'])),
                    'can_view_analytics' => (bool) ($validated['can_view_analytics'] ?? in_array($validated['role'], ['super_admin', 'manager'])),
                    'allowed_nav_groups' => $allowedGroups,
                    // Planner skill allowlist: ignored on managers (they
                    // always see the full pool), persisted as-is for
                    // regular staff. Null means "no restriction".
                    'planner_skills'     => in_array($validated['role'], ['super_admin', 'manager'], true)
                        ? null
                        : ($validated['planner_skills'] ?? null),
                    'is_active'          => true,
                ];
                if ($staff) {
                    $staff->update($payload);
                } else {
                    $staff = Staff::withoutGlobalScopes()->create($payload);
                }

                // Generate a fresh invite code. Wipe any prior unverified
                // codes for this email first so re-invitations don't
                // collide with a stale code.
                EmailVerificationCode::where('email', $email)
                    ->whereNull('verified_at')
                    ->delete();
                $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                EmailVerificationCode::create([
                    'email'      => $email,
                    'code'       => $code,
                    'expires_at' => now()->addHours(48),
                ]);

                return ['user' => $user, 'staff' => $staff, 'code' => $code];
            });
        } catch (\Throwable $e) {
            Log::error('Team invite failed', ['error' => $e->getMessage(), 'email' => $email]);
            return response()->json(['error' => 'Could not create the invite: ' . $e->getMessage()], 500);
        }

        // Send the invite email outside the transaction so an SMTP hiccup
        // doesn't roll back the user creation. Admin can always Resend.
        $emailSent = $this->sendInviteEmail($email, $validated['name'], $result['code']);

        AuditLog::create([
            'organization_id' => $orgId,
            'user_id'         => $request->user()?->id,
            'action'          => 'team.invite',
            'subject_type'    => 'staff',
            'subject_id'      => $result['staff']->id,
            'description'     => "Invited {$email} as {$validated['role']}",
            'ip_address'      => $request->ip(),
        ]);

        return response()->json([
            'message'    => 'Invite sent to ' . $email,
            'staff_id'   => $result['staff']->id,
            'email_sent' => $emailSent,
        ]);
    }

    /**
     * PATCH /v1/admin/team/{id}
     * Update role / department / permission flags on a teammate.
     * Refuses to demote the last super_admin so an org can't lock
     * itself out of the admin entirely.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $staff = Staff::findOrFail($id);

        $validated = $request->validate([
            'role'                 => 'sometimes|string|in:' . implode(',', self::ROLES),
            'department'           => 'sometimes|nullable|string|max:80',
            'can_award_points'     => 'sometimes|boolean',
            'can_redeem_points'    => 'sometimes|boolean',
            'can_manage_offers'    => 'sometimes|boolean',
            'can_view_analytics'   => 'sometimes|boolean',
            'allowed_nav_groups'   => 'sometimes|nullable|array',
            'allowed_nav_groups.*' => 'string|in:' . implode(',', self::TOGGLEABLE_GROUPS),
            'planner_skills'       => 'sometimes|nullable|array',
            'planner_skills.*'     => 'string|max:80',
        ]);

        // Admins always see everything — clear any whitelist they may have
        // had from a previous "staff" assignment so they don't accidentally
        // remain restricted after a promotion.
        $nextRole = $validated['role'] ?? $staff->role;
        if (in_array($nextRole, ['super_admin', 'manager'], true)) {
            $validated['allowed_nav_groups'] = null;
            // Same logic for planner skills — managers bypass the skill
            // gate by design, so any leftover list is meaningless.
            $validated['planner_skills'] = null;
        }

        // Only super-admin can promote TO super-admin.
        if (isset($validated['role']) && $validated['role'] === 'super_admin' && !$this->isCurrentUserSuperAdmin($request)) {
            return response()->json(['error' => 'Only super-admins can grant the super-admin role.'], 403);
        }

        // Don't allow demoting the last super_admin in the org.
        if ($staff->role === 'super_admin' && isset($validated['role']) && $validated['role'] !== 'super_admin') {
            $remaining = Staff::where('role', 'super_admin')
                ->where('is_active', true)
                ->where('id', '!=', $staff->id)
                ->count();
            if ($remaining === 0) {
                return response()->json(['error' => 'Cannot demote the only active super-admin.'], 422);
            }
        }

        // Capture pre-update state so the audit row can record exactly what
        // changed. Role escalation (staff → super_admin) is the highest-stakes
        // write in the system; without the diff, a promotion reads identically
        // to a department-field rename. See AUDIT-2026-06-13-ADDENDUM.md
        // observability finding.
        $auditableFields = ['role','department','is_active','can_award_points',
            'can_redeem_points','can_manage_offers','can_view_analytics',
            'allowed_nav_groups','planner_skills'];
        $before = $staff->only($auditableFields);

        $staff->update($validated);

        $after = $staff->fresh()->only($auditableFields);
        $changed = [];
        foreach ($auditableFields as $f) {
            if (($before[$f] ?? null) !== ($after[$f] ?? null)) {
                $changed[] = $f;
            }
        }

        $description = 'Updated team member';
        if (($before['role'] ?? null) !== ($after['role'] ?? null)) {
            $description = "Role: {$before['role']} → {$after['role']}";
        } elseif (!empty($changed)) {
            $description = 'Updated ' . implode(', ', $changed);
        }

        AuditLog::create([
            'organization_id' => app('current_organization_id'),
            'user_id'         => $request->user()?->id,
            'action'          => 'team.update',
            'subject_type'    => 'staff',
            'subject_id'      => $staff->id,
            'description'     => $description,
            'old_values'      => $before,
            'new_values'      => $after,
            'ip_address'      => $request->ip(),
        ]);

        return response()->json(['staff' => $staff->fresh()]);
    }

    /**
     * PATCH /v1/admin/team/{id}/deactivate
     * Soft-deactivate. Same can't-deactivate-last-super-admin guard.
     */
    public function deactivate(Request $request, int $id): JsonResponse
    {
        $staff = Staff::findOrFail($id);

        if ($staff->user_id === $request->user()?->id) {
            return response()->json(['error' => "You can't deactivate your own account."], 422);
        }

        if ($staff->role === 'super_admin') {
            $remaining = Staff::where('role', 'super_admin')
                ->where('is_active', true)
                ->where('id', '!=', $staff->id)
                ->count();
            if ($remaining === 0) {
                return response()->json(['error' => 'Cannot deactivate the only active super-admin.'], 422);
            }
        }

        // Capture role + permissions so a deactivation followed by a quick
        // reactivation still leaves a record of what level of access the
        // account had at deactivation time.
        $before = $staff->only(['role','is_active','can_award_points',
            'can_redeem_points','can_manage_offers','can_view_analytics']);

        $staff->update(['is_active' => false]);

        AuditLog::create([
            'organization_id' => app('current_organization_id'),
            'user_id'         => $request->user()?->id,
            'action'          => 'team.deactivate',
            'subject_type'    => 'staff',
            'subject_id'      => $staff->id,
            'description'     => "Deactivated team member (was {$staff->role})",
            'old_values'      => $before,
            'new_values'      => ['is_active' => false],
            'ip_address'      => $request->ip(),
        ]);

        return response()->json(['ok' => true]);
    }

    /**
     * PATCH /v1/admin/team/{id}/reactivate
     */
    public function reactivate(Request $request, int $id): JsonResponse
    {
        $staff = Staff::findOrFail($id);
        $staff->update(['is_active' => true]);

        AuditLog::create([
            'organization_id' => app('current_organization_id'),
            'user_id'         => $request->user()?->id,
            'action'          => 'team.reactivate',
            'subject_type'    => 'staff',
            'subject_id'      => $staff->id,
            'description'     => 'Reactivated team member',
            'ip_address'      => $request->ip(),
        ]);

        return response()->json(['ok' => true]);
    }

    /**
     * POST /v1/admin/team/{id}/resend
     * Wipe old codes and email a fresh one. Useful when an invite
     * expires or the recipient lost the email.
     */
    public function resend(Request $request, int $id): JsonResponse
    {
        $staff = Staff::with('user')->findOrFail($id);
        if (!$staff->user?->email) {
            return response()->json(['error' => 'No email on file for this teammate.'], 422);
        }
        $email = $staff->user->email;

        EmailVerificationCode::where('email', $email)
            ->whereNull('verified_at')
            ->delete();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        EmailVerificationCode::create([
            'email'      => $email,
            'code'       => $code,
            'expires_at' => now()->addHours(48),
        ]);

        $emailSent = $this->sendInviteEmail($email, $staff->user->name ?? $email, $code);

        AuditLog::create([
            'organization_id' => app('current_organization_id'),
            'user_id'         => $request->user()?->id,
            'action'          => 'team.resend',
            'subject_type'    => 'staff',
            'subject_id'      => $staff->id,
            'description'     => "Resent invite to {$email}",
            'ip_address'      => $request->ip(),
        ]);

        return response()->json(['ok' => true, 'email_sent' => $emailSent]);
    }

    /**
     * Send a simple invitation email. Uses Mail::raw so we don't
     * need a Mailable class — keeps the surface area small. The
     * /activate URL on the admin SPA handles code-based password
     * setup via the existing claimAccount() endpoint.
     */
    private function sendInviteEmail(string $email, string $name, string $code): bool
    {
        try {
            $org = Organization::find(app('current_organization_id'));
            $orgName = $org?->name ?? 'your team';
            $appUrl = rtrim(config('app.url', ''), '/');
            // Include the 6-digit code so the Activate page can pre-fill
            // it from the URL. Without `&code=...`, the page can't
            // identify which invitation to redeem (we'd just see the
            // email but not which one of N possible invites it belongs
            // to) and shows "missing required information".
            $link = $appUrl . '/activate?email=' . urlencode($email) . '&code=' . urlencode($code);

            Mail::raw(
                "Hi {$name},\n\n" .
                "You've been invited to join {$orgName} on Hotel Tech.\n\n" .
                "Your activation code: {$code}\n\n" .
                "Click here to set your password and log in:\n{$link}\n\n" .
                "This invitation expires in 48 hours.\n\n" .
                "— The {$orgName} team",
                function ($m) use ($email, $orgName) {
                    $m->to($email)->subject("You're invited to join {$orgName}");
                }
            );
            return true;
        } catch (\Throwable $e) {
            Log::warning('Team invite email failed', ['email' => $email, 'error' => $e->getMessage()]);
            return false;
        }
    }

    private function isCurrentUserSuperAdmin(Request $request): bool
    {
        $u = $request->user();
        if (!$u) return false;
        return Staff::where('user_id', $u->id)
            ->where('role', 'super_admin')
            ->where('is_active', true)
            ->exists();
    }
}
