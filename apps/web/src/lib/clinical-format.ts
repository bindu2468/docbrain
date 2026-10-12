import { format } from 'date-fns';
import type { ClinicalSource, ClinicalSourceType } from '@app-starter/shared';

export const formatClinicalDate = (iso: string): string => format(new Date(iso), 'd MMM yyyy');

export const formatClinicalDateTime = (iso: string): string =>
  format(new Date(iso), 'd MMM yyyy, HH:mm');

export const formatClinicalTime = (iso: string): string => format(new Date(iso), 'HH:mm');

/**
 * `@db.Date` values arrive as `YYYY-MM-DD`. Parsing that as a Date reads it as
 * UTC midnight, which shows the previous day west of Greenwich — so format the
 * parts directly.
 */
export const formatDateOnly = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  return format(new Date(year, month - 1, day), 'd MMM yyyy');
};

/** The element id each record renders with, so a brief source can link to it. */
export const recordAnchor = (type: ClinicalSourceType, id: string): string =>
  `${type.toLowerCase().replace('_', '-')}-${id}`;

export const sourceAnchor = (source: ClinicalSource): string =>
  recordAnchor(source.type, source.id);

export const SEX_LABELS = { FEMALE: 'F', MALE: 'M', OTHER: 'X' } as const;
