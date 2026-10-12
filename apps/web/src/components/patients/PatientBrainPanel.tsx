'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Brain, Loader2, RefreshCw, Search, Share2 } from 'lucide-react';
import type { BrainQueryResponse, BrainStatusResponse } from '@app-starter/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatClinicalDateTime } from '@/lib/clinical-format';
import { patientBrainApi } from '@/lib/patient-brain-api';
import { cn } from '@/lib/utils';
import { SourceLink } from './SourceLink';

const STATUS_POLL_MS = 3_000;

const SUGGESTED_QUESTIONS = [
  'Why are blood sugar levels going up?',
  'Which medications were stopped, and why?',
  'What did the patient say about their medications?',
] as const;

interface PatientBrainPanelProps {
  organizationId: string;
  patientId: string;
}

const StatusBadge = ({ status }: { status: BrainStatusResponse }) => {
  const { state, counts } = status;
  if (state === 'READY') return <Badge variant="teal">Ready · {counts.total} records</Badge>;
  if (state === 'INDEXING')
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Indexing {counts.searchable}/{counts.total}
      </Badge>
    );
  if (state === 'FAILED')
    return <Badge variant="destructive">{counts.failed} failed to index</Badge>;
  if (state === 'NOT_SYNCED') return <Badge variant="outline">Not synced</Badge>;
  return <Badge variant="outline">Not configured</Badge>;
};

const BrainResults = ({ result }: { result: BrainQueryResponse }) => (
  <div className="space-y-4">
    {result.excerpts.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        Nothing in this patient&apos;s records matched.
      </p>
    ) : (
      <ol className="space-y-3" aria-label="Matching records">
        {result.excerpts.map((excerpt, index) => (
          <li key={`${excerpt.title}-${index}`} className="rounded-md border p-3">
            <p className="text-sm font-medium">{excerpt.title}</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {excerpt.content}
            </p>
            {excerpt.source && (
              <div className="mt-2">
                <SourceLink source={excerpt.source} />
              </div>
            )}
          </li>
        ))}
      </ol>
    )}

    {result.relations.length > 0 && (
      <section aria-labelledby="brain-relations-heading" className="space-y-2">
        <h4 id="brain-relations-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Connections followed
        </h4>
        <ul className="space-y-1 text-sm">
          {result.relations.map((relation) => (
            <li key={`${relation.source}-${relation.predicate}-${relation.target}`}>
              <span className="font-medium">{relation.source}</span>{' '}
              <span className="font-mono text-xs text-muted-foreground">
                —{relation.predicate.toLowerCase().replace(/_/g, ' ')}→
              </span>{' '}
              <span className="font-medium">{relation.target}</span>
              {relation.context && (
                <span className="block text-xs text-muted-foreground">{relation.context}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);

/**
 * Ask questions of the patient's history, answered from HydraDB with every
 * passage linked to its record. Optional: without a HydraDB key the panel
 * says so, and the brief above is unaffected.
 */
export const PatientBrainPanel = ({ organizationId, patientId }: PatientBrainPanelProps) => {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const statusKey = ['patient-brain-status', organizationId, patientId];

  const { data: status } = useQuery({
    queryKey: statusKey,
    queryFn: () => patientBrainApi.getStatus(organizationId, patientId),
    // Poll only while HydraDB is still indexing
    refetchInterval: (query) => (query.state.data?.state === 'INDEXING' ? STATUS_POLL_MS : false),
  });

  const syncMutation = useMutation({
    mutationFn: () => patientBrainApi.sync(organizationId, patientId),
    onSuccess: (result) => {
      toast.success(`Sent ${result.itemCount} records to the patient brain`);
      queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => toast.error((error as { message?: string }).message || 'Sync failed.'),
  });

  const askMutation = useMutation({
    mutationFn: (text: string) =>
      patientBrainApi.query(organizationId, patientId, { question: text }),
    onError: (error) =>
      toast.error((error as { message?: string }).message || 'The brain could not answer.'),
  });

  const handleAsk = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    setQuestion(trimmed);
    askMutation.mutate(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleAsk(question);
  };

  const isConfigured = status !== undefined && status.state !== 'NOT_CONFIGURED';
  const canAsk = status !== undefined && status.counts.searchable > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" aria-hidden="true" />
            Ask the patient brain
          </CardTitle>
          <CardDescription>
            Searches this patient&apos;s records and the links between them, powered by HydraDB.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status && <StatusBadge status={status} />}
          {isConfigured && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', syncMutation.isPending && 'animate-spin')}
                aria-hidden="true"
              />
              {status?.state === 'NOT_SYNCED' ? 'Sync records' : 'Resync'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {status?.state === 'NOT_CONFIGURED' && (
          <p className="text-sm text-muted-foreground">
            The patient brain is off. Set <code className="font-mono">HYDRA_DB_API_KEY</code> in{' '}
            <code className="font-mono">apps/api/.env</code> and restart the API to turn it on.
          </p>
        )}

        {status?.state === 'NOT_SYNCED' && (
          <p className="text-sm text-muted-foreground">
            This patient&apos;s records have not been sent to the brain yet.
          </p>
        )}

        {status?.lastSyncedAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {formatClinicalDateTime(status.lastSyncedAt)}. Resync after the record
            changes.
          </p>
        )}

        {canAsk && (
          <>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about this patient's history"
                aria-label="Question about this patient"
                maxLength={500}
              />
              <Button type="submit" disabled={askMutation.isPending || question.trim().length < 3}>
                {askMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only sm:not-sr-only sm:ml-2">Ask</span>
              </Button>
            </form>

            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAsk(suggestion)}
                  disabled={askMutation.isPending}
                >
                  {suggestion}
                </Button>
              ))}
            </div>

            {askMutation.data && <BrainResults result={askMutation.data} />}

            <p className="text-xs text-muted-foreground">
              These are the matching records, not a written answer. Check each against its source.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
