'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { MEDICAL_SPECIALTY_LABELS, type MedicalSpecialty } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PageContainer } from '@/components/layout/PageContainer';
import { PatientBrief } from '@/components/patients/PatientBrief';
import { PatientRecord } from '@/components/patients/PatientRecord';
import { SpecialtySelect } from '@/components/patients/SpecialtySelect';
import { SEX_LABELS, formatDateOnly } from '@/lib/clinical-format';
import { patientsApi } from '@/lib/patients-api';

interface PageProps {
  params: Promise<{ organizationId: string; patientId: string }>;
}

const PatientPage = ({ params }: PageProps) => {
  const { organizationId, patientId } = use(params);
  // Undefined until the doctor picks a lens, so the API applies their own specialty
  const [specialty, setSpecialty] = useState<MedicalSpecialty | undefined>(undefined);

  const { data: brief, isLoading: isBriefLoading } = useQuery({
    queryKey: ['patient-brief', organizationId, patientId, specialty ?? 'own'],
    queryFn: () => patientsApi.getBrief(organizationId, patientId, specialty),
  });

  const { data: record } = useQuery({
    queryKey: ['patient-record', organizationId, patientId],
    queryFn: () => patientsApi.getRecord(organizationId, patientId),
  });

  // The record renders after the brief, so a source link opened in a new tab
  // lands before its target exists. Scroll once the record is in the DOM.
  useEffect(() => {
    if (!record || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [record]);

  if (isBriefLoading) {
    return (
      <PageContainer>
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  if (!brief) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
          Patient not found, or you do not have access to them.
        </div>
      </PageContainer>
    );
  }

  const { patient } = brief;

  return (
    <PageContainer variant="default">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/organizations/${organizationId}/schedule`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to schedule
          </Link>
        </Button>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {patient.age} {SEX_LABELS[patient.sex]} · born {formatDateOnly(patient.dateOfBirth)} ·{' '}
              <span className="font-mono">{patient.mrn}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Brief for</span>
            <SpecialtySelect
              value={brief.specialty}
              onValueChange={setSpecialty}
              ariaLabel="Read the brief as specialty"
              placeholder="All specialties"
            />
          </div>
        </header>

        {brief.specialty && (
          <p className="text-xs text-muted-foreground">
            Showing what matters to {MEDICAL_SPECIALTY_LABELS[brief.specialty].toLowerCase()} first.
            Allergies and every current medication are always shown.
          </p>
        )}

        <PatientBrief brief={brief} />

        <Separator />

        <section aria-labelledby="full-record-heading" className="space-y-4">
          <h2 id="full-record-heading" className="text-lg font-semibold">
            Full record
          </h2>
          {record ? (
            <PatientRecord record={record} />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </section>
      </div>
    </PageContainer>
  );
};

export default PatientPage;
