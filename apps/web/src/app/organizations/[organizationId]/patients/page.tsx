'use client';

import { use, useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { SEX_LABELS, formatClinicalDateTime } from '@/lib/clinical-format';
import { patientsApi } from '@/lib/patients-api';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

const PatientsPage = ({ params }: PageProps) => {
  const { organizationId } = use(params);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  const { data: patients, isLoading } = useQuery({
    queryKey: ['patients', organizationId, deferredSearch],
    queryFn: () => patientsApi.list(organizationId, deferredSearch || undefined),
  });

  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <PageHeader title="Patients" description="Everyone on file at this clinic." />

        <div className="relative max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or MRN"
            aria-label="Search patients by name or MRN"
            className="pl-9"
          />
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {patients && patients.items.length === 0 && (
          <EmptyState
            icon={Users}
            title="No patients found"
            description={
              deferredSearch ? 'Try a different name or MRN.' : 'No patients on file yet.'
            }
          />
        )}

        {patients && patients.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>MRN</TableHead>
                <TableHead>Allergies</TableHead>
                <TableHead>Next visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.items.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <Link
                      href={`/organizations/${organizationId}/patients/${patient.id}`}
                      className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {patient.lastName}, {patient.firstName}
                    </Link>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {patient.age} {SEX_LABELS[patient.sex]}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{patient.mrn}</TableCell>
                  <TableCell>
                    {patient.allergyCount > 0 ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        {patient.allergyCount}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {patient.nextVisitAt ? formatClinicalDateTime(patient.nextVisitAt) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageContainer>
  );
};

export default PatientsPage;
