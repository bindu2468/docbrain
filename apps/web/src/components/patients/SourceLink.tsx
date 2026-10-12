import { FileSearch } from 'lucide-react';
import type { ClinicalSource } from '@app-starter/shared';
import { sourceAnchor } from '@/lib/clinical-format';

/** Links a brief item to the record it came from, further down the page. */
export const SourceLink = ({ source }: { source: ClinicalSource }) => (
  <a
    href={`#${sourceAnchor(source)}`}
    className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <FileSearch className="h-3 w-3" aria-hidden="true" />
    {source.label}
  </a>
);

export const SourceLinks = ({ sources }: { sources: readonly ClinicalSource[] }) => (
  <span className="flex flex-wrap gap-x-3 gap-y-1">
    {sources.map((source) => (
      <SourceLink key={`${source.type}-${source.id}`} source={source} />
    ))}
  </span>
);
