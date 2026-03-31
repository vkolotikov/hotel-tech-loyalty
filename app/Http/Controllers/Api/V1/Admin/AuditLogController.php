<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    private const TYPE_MAP = [
        'App\Models\LoyaltyMember'      => 'Member',
        'App\Models\LoyaltyTier'        => 'Tier',
        'App\Models\HotelSetting'       => 'Setting',
        'App\Models\PointsTransaction'  => 'Transaction',
        'App\Models\NfcCard'            => 'NFC Card',
        'App\Models\User'               => 'User',
        'App\Models\NotificationCampaign' => 'Campaign',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::query()->latest();

        if ($action = $request->get('action')) {
            $query->forAction($action);
        }

        if ($subjectType = $request->get('subject_type')) {
            $fqcn = array_search($subjectType, self::TYPE_MAP);
            if ($fqcn !== false) {
                $query->forSubjectType($fqcn);
            }
        }

        if ($causerId = $request->get('causer_id')) {
            $query->forCauser((int) $causerId);
        }

        $query->betweenDates($request->get('from'), $request->get('to'));

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'ilike', "%{$search}%")
                  ->orWhere('action', 'ilike', "%{$search}%");
            });
        }

        $logs = $query->paginate($request->get('per_page', 25));

        // Resolve causer names
        $logs->getCollection()->transform(function ($log) {
            $log->causer_name = null;
            if ($log->causer_type && $log->causer_id) {
                $causer = $log->causer;
                $log->causer_name = $causer->name ?? $causer->full_name ?? "#{$log->causer_id}";
            }
            $log->subject_type_label = self::TYPE_MAP[$log->subject_type] ?? class_basename($log->subject_type ?? '');
            return $log;
        });

        return response()->json($logs);
    }

    public function actions(): JsonResponse
    {
        return response()->json(
            AuditLog::distinct()->orderBy('action')->pluck('action')
        );
    }

    public function subjectTypes(): JsonResponse
    {
        $types = AuditLog::distinct()
            ->whereNotNull('subject_type')
            ->pluck('subject_type')
            ->map(fn($fqcn) => [
                'value' => self::TYPE_MAP[$fqcn] ?? class_basename($fqcn),
                'label' => self::TYPE_MAP[$fqcn] ?? class_basename($fqcn),
            ])
            ->unique('value')
            ->values();

        return response()->json($types);
    }
}
