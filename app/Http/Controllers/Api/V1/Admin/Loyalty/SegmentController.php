<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\MemberSegment;
use App\Services\EmailComplianceService;
use App\Services\Loyalty\Campaigns\SegmentRules;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use App\Services\MemberSegmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Segments (spec 2026-10-21 release 2 §6): the saved audiences campaigns are sent to, in MemberSegmentService's
 * format, shared with the full admin's Segments. Every staff member may read the list and the options (the full
 * admin's Segments tab is everyone's); a manager makes, changes, previews and deletes (AccessMap
 * `admin/loyalty/segments`: change manager — POST preview included). Rules are read by SegmentRules, which refuses
 * what the shared service would skip; the member count is recomputed on every save, as the full admin does.
 */
class SegmentController extends Controller
{
    /** A preview's sample, as the full admin's. */
    private const SAMPLE = 10;

    public function __construct(
        private readonly MemberSegmentService $segments,
        private readonly EmailComplianceService $compliance,
    ) {
    }

    public function index(): JsonResponse
    {
        $rows = MemberSegment::query()->orderBy('name')->orderBy('id')->get();

        return response()->json(['segments' => $rows->map(fn (MemberSegment $s) => $this->row($s))->values()]);
    }

    public function options(): JsonResponse
    {
        return response()->json(SegmentRules::options());
    }

    /** How many active members unsaved rules match, how many of them agreed to marketing email, and the first ten. */
    public function preview(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $request->validate(['everyone' => 'sometimes|boolean']);
        $definition = SegmentRules::fromRequest($request->boolean('everyone'), $request->input('operator'), $request->input('filters'));

        $query = $this->segments->buildQuery($definition);
        $sample = (clone $query)->with('user:id,name,email,phone')->orderByDesc('loyalty_members.id')->limit(self::SAMPLE)->get();

        return response()->json([
            'count'     => (clone $query)->count(),
            'marketing' => $this->compliance->scopeEligible(clone $query, 'marketing')->count(),
            'sample'    => $sample->map(fn ($m) => MemberDirectory::row($m))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $this->validated($request);

        $segment = MemberSegment::create($data + ['created_by_user_id' => $request->user()->id]);
        $this->recount($segment);

        AuditLog::record('segment_created', $segment, ['name' => $segment->name, 'definition' => $segment->definition], [],
            $request->user(), "Segment '{$segment->name}' created");

        return response()->json(['segment' => $this->row($segment->fresh())], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $segment = $this->segment($id);
        $data = $this->validated($request);
        $old = ['name' => $segment->name, 'definition' => $segment->definition];

        $segment->update($data);
        $this->recount($segment);

        AuditLog::record('segment_updated', $segment, ['name' => $segment->name, 'definition' => $segment->definition], $old,
            $request->user(), "Segment '{$segment->name}' updated");

        return response()->json(['segment' => $this->row($segment->fresh())]);
    }

    /**
     * Delete a segment no draft or sending campaign names. A draft would lose its audience without anyone noticing
     * until Send; a sending one has its members already, but its page would no longer say who they were. A
     * campaign that is over keeps its numbers; its link to the segment goes (the foreign key's `nullOnDelete`).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $segment = $this->segment($id);

        $using = EmailCampaign::query()->where('segment_id', $segment->id)
            ->whereIn('status', [EmailCampaign::STATUS_DRAFT, EmailCampaign::STATUS_SENDING])
            ->orderBy('name')->get(['id', 'name', 'status']);
        if ($using->isNotEmpty()) {
            throw new LoyaltyRefused('in_use', 'A campaign still uses this segment.', 409, [
                'campaigns' => $using->map(fn (EmailCampaign $c) => ['id' => (int) $c->id, 'name' => (string) $c->name, 'status' => (string) $c->status])->values()->all(),
            ]);
        }

        $name = $segment->name;
        $segment->delete();

        AuditLog::record('segment_deleted', null, ['segment_id' => $id, 'name' => $name], [], $request->user(), "Segment '{$name}' deleted");

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function row(MemberSegment $s): array
    {
        $definition = is_array($s->definition) ? $s->definition : [];

        return [
            'id'           => (int) $s->id,
            'name'         => (string) $s->name,
            'description'  => $s->description,
            'everyone'     => SegmentRules::isEveryone($definition),
            'operator'     => is_string($definition['operator'] ?? null) ? strtoupper($definition['operator']) : 'AND',
            'filters'      => is_array($definition['filters'] ?? null) ? array_values($definition['filters']) : [],
            // What the shared service matches now (a segment with a problem may match more than it says: `problem`).
            'members'      => $this->segments->count($definition),
            'problem'      => SegmentRules::problem($s->definition),
            'last_sent_at' => $s->last_sent_at?->toIso8601String(),
            'updated_at'   => $s->updated_at?->toIso8601String(),
        ];
    }

    /**
     * The full admin's payload rules for the name and description, and SegmentRules for the definition.
     *
     * @return array{name: string, description: ?string, definition: array<string, mixed>}
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'description' => 'nullable|string|max:500',
            'everyone'    => 'sometimes|boolean',
        ]);

        return [
            'name'        => trim($data['name']),
            'description' => isset($data['description']) && trim($data['description']) !== '' ? trim($data['description']) : null,
            'definition'  => SegmentRules::fromRequest($request->boolean('everyone'), $request->input('operator'), $request->input('filters')),
        ];
    }

    /** The cached count the full admin's list reads, recomputed as its store and update do. */
    private function recount(MemberSegment $segment): void
    {
        $segment->forceFill([
            'member_count_cached'      => $this->segments->count($segment->definition ?? []),
            'member_count_computed_at' => now(),
        ])->save();
    }

    private function segment(int $id): MemberSegment
    {
        return MemberSegment::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
