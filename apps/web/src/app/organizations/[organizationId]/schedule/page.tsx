'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, isToday, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { MEDICAL_SPECIALTY_LABELS, type MedicalSpecialty } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { SpecialtySelect } from '@/components/patients/SpecialtySelect';
import { SEX_LABELS, formatClinicalTime } from '@/lib/clinical-format';
import { patientsApi } from '@/lib/patients-api';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

const SchedulePage = ({ params }: PageProps) => {
  const { organizationId } = use(params);
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [isMineOnly, setIsMineOnly] = useState(true);

  const { data: profile } = useQuery({
    queryKey: ['clinician-profile', organizationId],
    queryFn: () => patientsApi.getClinicianProfile(organizationId),
  });

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', organizationId, day.toISOString(), isMineOnly],
    queryFn: () => patientsApi.getSchedule(organizationId, day, addDays(day, 1), isMineOnly),
  });

  const handleSpecialtyChange = async (specialty: MedicalSpecialty) => {
    try {
      await patientsApi.updateClinicianProfile(organizationId, { specialty });
      queryClient.invalidateQueries({ queryKey: ['clinician-profile', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['patient-brief', organizationId] });
      toast.success(`Briefs will now open as ${MEDICAL_SPECIALTY_LABELS[specialty]}`);
    } catch (error) {
      toast.error((error as { message?: string }).message || 'Could not update your specialty.');
    }
  };

  const handlePreviousDay = () => setDay((current) => addDays(current, -1));
  const handleNextDay = () => setDay((current) => addDays(current, 1));
  const handleToday = () => setDay(startOfDay(new Date()));

  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <PageHeader
          title="Schedule"
          description="Open a patient to read their brief before you walk in."
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Your specialty</span>
            <SpecialtySelect
              value={profile?.specialty ?? null}
              onValueChange={handleSpecialtyChange}
              ariaLabel="Your specialty"
            />
          </div>
        </PageHeader>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousDay}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-48 text-center font-medium" aria-live="polite">
              {isToday(day) ? 'Today, ' : ''}
              {format(day, 'EEEE d MMMM')}
            </h2>
            <Button variant="outline" size="icon" onClick={handleNextDay} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday(day) && (
              <Button variant="ghost" size="sm" onClick={handleToday}>
                Today
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch id="mine-only" checked={isMineOnly} onCheckedChange={setIsMineOnly} />
            <Label htmlFor="mine-only">Only my appointments</Label>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {schedule && schedule.items.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="No appointments"
            description={
              isMineOnly
                ? 'You have no appointments on this day. Turn off "Only my appointments" to see the whole clinic.'
                : 'Nobody in the clinic has appointments on this day.'
            }
          />
        )}

        <ol className="space-y-3">
          {schedule?.items.map((item) => {
            const isDone = item.status !== 'SCHEDULED';
            return (
              <li key={item.visitId}>
                <Link
                  href={`/organizations/${organizationId}/patients/${item.patient.id}`}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card
                    className={cn('transition-colors hover:border-primary', isDone && 'opacity-60')}
                  >
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0 py-4">
                      <time
                        dateTime={item.scheduledAt}
                        className="w-14 shrink-0 text-lg font-semibold tabular-nums"
                      >
                        {formatClinicalTime(item.scheduledAt)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {item.patient.firstName} {item.patient.lastName}
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {item.patient.age} {SEX_LABELS[item.patient.sex]}
                          </span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {item.reason} · {item.doctor.name} (
                          {MEDICAL_SPECIALTY_LABELS[item.specialty]})
                        </p>
                      </div>
                      {item.patient.allergyCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                          {item.patient.allergyCount}{' '}
                          {item.patient.allergyCount === 1 ? 'allergy' : 'allergies'}
                        </Badge>
                      )}
                      {isDone && (
                        <Badge variant="outline">
                          {item.status.replace('_', '-').toLowerCase()}
                        </Badge>
                      )}
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </PageContainer>
  );
};

export default SchedulePage;
