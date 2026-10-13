'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { addDays, isToday, startOfDay } from 'date-fns';
import {
  ArrowRight,
  CalendarDays,
  Settings,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { MEDICAL_SPECIALTY_LABELS, OrgRole } from '@app-starter/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatClinicalDate, formatClinicalTime } from '@/lib/clinical-format';
import { organizationsApi } from '@/lib/organizations-api';
import { patientsApi } from '@/lib/patients-api';
import { cn } from '@/lib/utils';

const MAX_APPOINTMENTS = 4;
const MAX_NEXT_VISITS = 4;

const ROLE_LABELS: Readonly<Record<OrgRole, string>> = {
  [OrgRole.OWNER]: 'Owner',
  [OrgRole.ADMIN]: 'Admin',
  [OrgRole.MEMBER]: 'Member',
};

const formatNextVisit = (iso: string): string =>
  isToday(new Date(iso)) ? `Today, ${formatClinicalTime(iso)}` : formatClinicalDate(iso);

interface OverviewCardProps {
  icon: LucideIcon;
  title: string;
  /** The headline number; undefined while loading */
  value: number | undefined;
  valueLabel: string;
  href: string;
  linkLabel: string;
  children: ReactNode;
}

/** One home-screen tile: a headline number, detail, and a way through. */
const OverviewCard = ({
  icon: Icon,
  title,
  value,
  valueLabel,
  href,
  linkLabel,
  children,
}: OverviewCardProps) => (
  <Card className="flex h-full flex-col">
    <CardHeader className="space-y-4 pb-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      <p>
        <span className="text-3xl font-semibold tabular-nums">{value ?? '–'}</span>
        <span className="ml-2 text-sm text-muted-foreground">{valueLabel}</span>
      </p>
    </CardHeader>
    <CardContent className="flex-1 text-sm">{children}</CardContent>
    <CardFooter>
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={href}>
          {linkLabel}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);

interface ClinicOverviewProps {
  organizationId: string;
  role: OrgRole | null | undefined;
  location: string | null;
}

/**
 * The clinic home: today's appointments, patients, and clinic settings, each
 * with live numbers and a link to the full screen.
 */
export const ClinicOverview = ({ organizationId, role, location }: ClinicOverviewProps) => {
  // Computed once per render; the queries key on the ISO day so they refresh
  // when the date changes
  const today = startOfDay(new Date());
  const base = `/organizations/${organizationId}`;

  const { data: schedule } = useQuery({
    queryKey: ['schedule', organizationId, today.toISOString(), false],
    queryFn: () => patientsApi.getSchedule(organizationId, today, addDays(today, 1), false),
  });

  const { data: patients } = useQuery({
    queryKey: ['patients', organizationId, ''],
    queryFn: () => patientsApi.list(organizationId),
  });

  const { data: profile } = useQuery({
    queryKey: ['clinician-profile', organizationId],
    queryFn: () => patientsApi.getClinicianProfile(organizationId),
  });

  // Member lists may be limited to managers; the card simply omits the count
  const { data: members } = useQuery({
    queryKey: ['organization-users', organizationId],
    queryFn: () => organizationsApi.getOrganizationUsers(organizationId),
    retry: false,
  });

  const appointments = schedule?.items ?? [];
  const now = Date.now();
  // The whole day in time order; what is already past stays, dimmed
  const shownAppointments = appointments.slice(0, MAX_APPOINTMENTS);
  const hiddenAppointments = appointments.length - shownAppointments.length;
  const mineCount = profile
    ? appointments.filter((item) => item.doctor.id === profile.userId).length
    : undefined;

  const patientItems = patients?.items ?? [];
  const withAllergies = patientItems.filter((patient) => patient.allergyCount > 0).length;
  const nextVisits = patientItems
    .filter((patient) => patient.nextVisitAt !== null)
    .sort((a, b) => (a.nextVisitAt ?? '').localeCompare(b.nextVisitAt ?? ''))
    .slice(0, MAX_NEXT_VISITS);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <OverviewCard
        icon={CalendarDays}
        title="Today's appointments"
        value={schedule ? appointments.length : undefined}
        valueLabel={
          mineCount === undefined ? 'in the clinic' : `in the clinic · ${mineCount} with you`
        }
        href={`${base}/schedule`}
        linkLabel="Open schedule"
      >
        {schedule && appointments.length === 0 && (
          <p className="text-muted-foreground">No appointments today.</p>
        )}
        <ul className="space-y-1">
          {shownAppointments.map((item) => (
            <li key={item.visitId}>
              <Link
                href={`${base}/patients/${item.patient.id}`}
                className={cn(
                  '-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  new Date(item.scheduledAt).getTime() < now && 'text-muted-foreground',
                )}
              >
                <time
                  dateTime={item.scheduledAt}
                  className="w-11 shrink-0 font-medium tabular-nums"
                >
                  {formatClinicalTime(item.scheduledAt)}
                </time>
                <span className="min-w-0 flex-1 truncate">
                  {item.patient.firstName} {item.patient.lastName}
                  <span className="ml-1 text-xs text-muted-foreground">
                    · {MEDICAL_SPECIALTY_LABELS[item.specialty]}
                  </span>
                </span>
                {item.patient.allergyCount > 0 && (
                  <ShieldAlert
                    className="h-4 w-4 shrink-0 text-destructive"
                    aria-label={`${item.patient.allergyCount} recorded allergies`}
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
        {hiddenAppointments > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">+{hiddenAppointments} more today</p>
        )}
      </OverviewCard>

      <OverviewCard
        icon={Users}
        title="Patients"
        value={patients?.total}
        valueLabel="on file"
        href={`${base}/patients`}
        linkLabel="View all patients"
      >
        {patients && (
          <div className="space-y-3">
            <p className="flex items-center gap-2">
              <Badge variant={withAllergies > 0 ? 'destructive' : 'secondary'} className="gap-1">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                {withAllergies}
              </Badge>
              <span className="text-muted-foreground">with recorded allergies</span>
            </p>
            {nextVisits.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Next visits
                </p>
                <ul className="space-y-1">
                  {nextVisits.map((patient) => (
                    <li key={patient.id}>
                      <Link
                        href={`${base}/patients/${patient.id}`}
                        className="-mx-2 flex justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">
                          {patient.firstName} {patient.lastName}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {patient.nextVisitAt && formatNextVisit(patient.nextVisitAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </OverviewCard>

      <OverviewCard
        icon={Settings}
        title="Clinic & settings"
        value={members?.total}
        valueLabel={members ? 'members' : 'members (managers only)'}
        href={`${base}/settings`}
        linkLabel="Open settings"
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Your role</dt>
          <dd>{role ? ROLE_LABELS[role] : '–'}</dd>
          <dt className="text-muted-foreground">Your specialty</dt>
          <dd>
            {profile?.specialty ? (
              MEDICAL_SPECIALTY_LABELS[profile.specialty]
            ) : (
              <Link href={`${base}/schedule`} className="text-primary hover:underline">
                Set on the schedule
              </Link>
            )}
          </dd>
          {location && (
            <>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{location}</dd>
            </>
          )}
        </dl>
      </OverviewCard>
    </div>
  );
};
