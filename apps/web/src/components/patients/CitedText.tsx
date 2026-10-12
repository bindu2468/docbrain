import { Fragment } from 'react';
import type { AssistantCitation } from '@app-starter/shared';
import { sourceAnchor } from '@/lib/clinical-format';

const MARKER_PATTERN = /(\[\d{1,3}\])/g;

interface CitedTextProps {
  text: string;
  citations: readonly AssistantCitation[];
}

/**
 * Model text with each `[n]` turned into a link to the record it cites. The
 * API has already removed markers that point at nothing; a marker with no
 * linkable record (e.g. a safety flag) renders as plain text.
 */
export const CitedText = ({ text, citations }: CitedTextProps) => {
  const byMarker = new Map(citations.map((citation) => [citation.marker, citation]));

  return (
    <>
      {text.split(MARKER_PATTERN).map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const citation = match ? byMarker.get(Number(match[1])) : undefined;

        if (!match) return <Fragment key={index}>{part}</Fragment>;
        if (!citation?.source) {
          return (
            <sup key={index} className="text-xs text-muted-foreground">
              {part}
            </sup>
          );
        }

        return (
          <sup key={index}>
            <a
              href={`#${sourceAnchor(citation.source)}`}
              className="rounded px-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Source ${citation.marker}: ${citation.title}`}
              title={citation.title}
            >
              {part}
            </a>
          </sup>
        );
      })}
    </>
  );
};
