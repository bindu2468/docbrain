'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Brain, Loader2, RefreshCw, Search, Share2 } from 'lucide-react';
import type {
  AssistantAnswerResponse,
  BrainQueryResponse,
  BrainStatusResponse,
} from '@app-starter/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatClinicalDateTime } from '@/lib/clinical-format';
import { clinicalAssistantApi } from '@/lib/clinical-assistant-api';
import { patientBrainApi } from '@/lib/patient-brain-api';
import { cn } from '@/lib/utils';
import { CitedText } from './CitedText';
import { SourceLink } from './SourceLink';

const STATUS_POLL_MS = 3_000;

const SUGGESTED_QUESTIONS = [
  'Why are blood sugar levels going up?',
  'Which medications were stopped, and why?',
  'What did the patient say about their medications?',
] as const;

/** A question asked from elsewhere on the page; `nonce` makes repeats re-ask. */
export interface AskRequest {
  question: string;
  nonce: number;
}

interface PatientBrainPanelProps {
  organizationId: string;
  patientId: string;
  /** With the assistant on, questions get a written answer; otherwise raw passages */
  isAssistantEnabled: boolean;
  askRequest?: AskRequest;
}

const ORIGIN_LABELS = {
  PATIENT_BRAIN:
    'Answered from passages the patient brain (HydraDB) retrieved, plus allergies, flags, medications, and conditions.',
  RECORD: 'Answered from the full record in the clinic database.',
} as const;

const AnswerResult = ({ result }: { result: AssistantAnswerResponse }) => (
  <div className="space-y-3 rounded-md border p-4">
    <p className="text-sm leading-relaxed">
      <CitedText text={result.answer} citations={result.citations} />
    </p>
    {result.citations.length > 0 && (
      <ol className="space-y-1" aria-label="Sources cited">
        {result.citations.map((citation) => (
          <li key={citation.marker} className="flex gap-2 text-xs">
            <span className="w-6 shrink-0 text-muted-foreground">[{citation.marker}]</span>
            {citation.source ? (
              <SourceLink source={citation.source} />
            ) : (
              <span className="text-muted-foreground">{citation.title}</span>
            )}
          </li>
        ))}
      </ol>
    )}
    <p className="text-xs text-muted-foreground">
      {ORIGIN_LABELS[result.contextOrigin]} Written by {result.model}.
    </p>
  </div>
);

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
export const PatientBrainPanel = ({
  organizationId,
  patientId,
  isAssistantEnabled,
  askRequest,
}: PatientBrainPanelProps) => {
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

  const { mutate: searchBrain, ...searchMutation } = useMutation({
    mutationFn: (text: string) =>
      patientBrainApi.query(organizationId, patientId, { question: text }),
    onError: (error) =>
      toast.error((error as { message?: string }).message || 'The brain could not answer.'),
  });

  const { mutate: requestAnswer, ...answerMutation } = useMutation({
    mutationFn: (text: string) =>
      clinicalAssistantApi.answer(organizationId, patientId, { question: text }),
    onError: (error) =>
      toast.error((error as { message?: string }).message || 'The assistant could not answer.'),
  });

  const handleAsk = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) return;
      setQuestion(trimmed);
      if (isAssistantEnabled) {
        requestAnswer(trimmed);
      } else {
        searchBrain(trimmed);
      }
    },
    [isAssistantEnabled, requestAnswer, searchBrain],
  );

  // A suggested question clicked in the summary card lands here
  useEffect(() => {
    if (askRequest) handleAsk(askRequest.question);
  }, [askRequest, handleAsk]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleAsk(question);
  };

  const isPending = answerMutation.isPending || searchMutation.isPending;
  const isConfigured = status !== undefined && status.state !== 'NOT_CONFIGURED';
  // The assistant can answer from the record even when the brain is off
  const canAsk = isAssistantEnabled || (status !== undefined && status.counts.searchable > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" aria-hidden="true" />
            Ask about this patient
          </CardTitle>
          <CardDescription>
            Searches this patient&apos;s records and the links between them with HydraDB
            {isAssistantEnabled ? ', then writes a cited answer.' : '.'}
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
              <Button type="submit" disabled={isPending || question.trim().length < 3}>
                {isPending ? (
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
                  disabled={isPending}
                >
                  {suggestion}
                </Button>
              ))}
            </div>

            {isAssistantEnabled && answerMutation.data && (
              <AnswerResult result={answerMutation.data} />
            )}
            {!isAssistantEnabled && searchMutation.data && (
              <BrainResults result={searchMutation.data} />
            )}

            <p className="text-xs text-muted-foreground">
              {isAssistantEnabled
                ? 'Summary and pointers only. Check each claim against its source; the clinical decision is yours.'
                : 'These are the matching records, not a written answer. Check each against its source.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
