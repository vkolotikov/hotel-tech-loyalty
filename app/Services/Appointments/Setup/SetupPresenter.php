<?php

namespace App\Services\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use App\Models\ServiceMasterTimeOff;
use App\Models\Staff;

/** The JSON the workspace's Setup reads: services, categories, team members, sign-in accounts. */
final class SetupPresenter
{
    public function service(Service $service): array
    {
        return [
            'id'                   => (int) $service->id,
            'name'                 => (string) $service->name,
            'category_id'          => $service->category_id ? (int) $service->category_id : null,
            'duration_minutes'     => (int) $service->duration_minutes,
            'buffer_after_minutes' => (int) ($service->buffer_after_minutes ?? 0),
            'price'                => (float) $service->price,
            'currency'             => (string) ($service->currency ?: 'EUR'),
            'short_description'    => $service->short_description,
            'is_active'            => (bool) $service->is_active,
            'performers'           => $service->masters->map(fn (ServiceMaster $m) => self::link((int) $m->id, $m->pivot))->values()->all(),
        ];
    }

    public function category(ServiceCategory $category): array
    {
        return ['id' => (int) $category->id, 'name' => (string) $category->name];
    }

    /** Needs memberRelations() loaded. */
    public function member(ServiceMaster $master): array
    {
        return [
            'id'        => (int) $master->id,
            'name'      => (string) $master->name,
            'title'     => $master->title,
            'email'     => $master->email,
            'phone'     => $master->phone,
            'user_id'   => $master->user_id ? (int) $master->user_id : null,
            'is_active' => (bool) $master->is_active,
            'services'  => $master->services->map(fn (Service $s) => self::link((int) $s->id, $s->pivot))->values()->all(),
            'week'      => $master->schedules
                ->sortBy(fn (ServiceMasterSchedule $r) => sprintf('%d %s', $r->day_of_week, $r->start_time))
                ->map(fn (ServiceMasterSchedule $r) => [
                    'day_of_week' => (int) $r->day_of_week,
                    'start_time'  => substr((string) $r->start_time, 0, 5),
                    'end_time'    => substr((string) $r->end_time, 0, 5),
                    'is_active'   => (bool) $r->is_active,
                ])->values()->all(),
            'time_off'  => $master->timeOff->map(fn (ServiceMasterTimeOff $o) => [
                'id'         => (int) $o->id,
                'date'       => $o->date instanceof \DateTimeInterface ? $o->date->format('Y-m-d') : substr((string) $o->date, 0, 10),
                'start_time' => $o->start_time ? substr((string) $o->start_time, 0, 5) : null,
                'end_time'   => $o->end_time ? substr((string) $o->end_time, 0, 5) : null,
                'reason'     => $o->reason,
            ])->values()->all(),
        ];
    }

    /** Everything member() reads; time off from the venue's $today on. */
    public static function memberRelations(string $today): array
    {
        return [
            'services',
            'schedules',
            'timeOff' => fn ($q) => $q->whereDate('date', '>=', $today)->orderBy('date')->orderBy('start_time'),
        ];
    }

    /** The organisation's staff sign-ins a team member can be linked to. */
    public function staffAccounts(): array
    {
        return Staff::with('user:id,name,email')->get()
            ->filter(fn (Staff $s) => $s->user !== null)
            ->map(fn (Staff $s) => ['user_id' => (int) $s->user_id, 'name' => (string) $s->user->name, 'email' => (string) $s->user->email])
            ->sortBy('name')->values()->all();
    }

    private static function link(int $id, ?object $pivot): array
    {
        return [
            'id'               => $id,
            'duration_minutes' => $pivot?->duration_override_minutes !== null ? (int) $pivot->duration_override_minutes : null,
            'price'            => $pivot?->price_override !== null ? (float) $pivot->price_override : null,
        ];
    }
}
