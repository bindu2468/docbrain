import { createHash } from 'crypto';
import {
  ClinicalSourceType,
  MEDICAL_SPECIALTY_LABELS,
  PatientRecordResponse,
  SafetyFlag,
} from '@app-starter/shared';

/**
 * Turns a patient's Postgres records into HydraDB knowledge items plus an
 * explicit graph.
 *
 * Every structured record carries a `graph_payload` naming the exact entities
 * and relations (drug PRESCRIBED_BY doctor, drug TREATS condition, ...), so
 * HydraDB does not have to guess them with LLM extraction. Transcripts are the
 * exception: they are free speech, so they are left for HydraDB to extract.
 *
 * Pure — no network, no database — so the mapping is unit-tested directly.
 */

/**
 * Wire shape of one `app_knowledge` item (snake_case, sent as JSON), in
 * HydraDB's class-based app-source format. The class decides what gets
 * indexed: `fields.body` becomes the searchable text. The older
 * `{ type, content: { text } }` shape is still accepted but is indexed as the
 * raw JSON of the whole item.
 */
export interface BrainKnowledgeItem {
  id: string;
  title: string;
  /** `meeting` for transcripts, `custom` for every structured record */
  kind: 'meeting' | 'custom';
  provider: typeof BRAIN_PROVIDER;
  external_id: string;
  timestamp: string;
  fields: MeetingFields | CustomFields;
  additional_metadata: BrainItemMetadata;
  relations?: { ids: string[] };
  acl: string[];
}

interface MeetingFields {
  kind: 'meeting';
  title: string;
  body: string;
  started_at: string;
}

interface CustomFields {
  kind: 'custom';
  body: string;
  data: { record_type: string };
}

/** Names this app as the items' source in HydraDB */
export const BRAIN_PROVIDER = 'patient-brain';

/**
 * Kept small on purpose: HydraDB caps `additional_metadata` at 1 KiB, and this
 * is only what is needed to link a retrieved passage back to its record.
 */
export interface BrainItemMetadata {
  record_type: ClinicalSourceType | 'SAFETY_FLAG';
  record_id: string;
}

interface GraphEntity {
  name: string;
  type: string;
  namespace: string;
}

interface GraphRelation {
  source: string;
  target: string;
  predicate: string;
  context: string;
  temporal_details?: string;
}

export interface SourceGraph {
  entities: Record<string, GraphEntity>;
  relations: GraphRelation[];
}

export interface BrainDocumentSet {
  items: BrainKnowledgeItem[];
  /** Keyed by item id. Items absent here get HydraDB's own extraction. */
  graphPayload: Record<string, SourceGraph>;
}

/**
 * HydraDB collection for one patient. A collection per patient makes the
 * boundary hard: a query scoped to one patient cannot return another's
 * records, whatever the question. Collection names allow letters, digits,
 * `_` and `-`, up to 64 characters.
 */
export const patientCollection = (patientId: string): string =>
  `patient_${patientId.replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * ACL principal for everyone in a clinic. Sent on every item and every query,
 * as a second fence behind the per-patient collection and the Postgres
 * membership check.
 */
export const clinicPrincipal = (organizationId: string): string => `group:clinic:${organizationId}`;

/** Stable HydraDB id for a record — the upsert key, and how chunks map back. */
export const brainItemId = (type: ClinicalSourceType | 'SAFETY_FLAG', id: string): string =>
  `${type.toLowerCase()}_${id}`;

const day = (iso: string): string => iso.slice(0, 10);

const entityKey = (namespace: string, name: string): string =>
  `${namespace}:${name.trim().toLowerCase().replace(/\s+/g, '_')}`;

/**
 * Collects entities and relations for one item. Entity keys are namespaced
 * and normalized so "Prednisone" in a medication and in a safety flag resolve
 * to the same node.
 */
class GraphBuilder {
  private readonly entities: Record<string, GraphEntity> = {};
  private readonly relations: GraphRelation[] = [];

  entity(namespace: string, type: string, name: string): string {
    const key = entityKey(namespace, name);
    this.entities[key] = { name, type, namespace };
    return key;
  }

  relate(
    source: string,
    predicate: string,
    target: string,
    context: string,
    temporal?: string,
  ): this {
    this.relations.push({
      source,
      target,
      predicate,
      context,
      ...(temporal ? { temporal_details: temporal } : {}),
    });
    return this;
  }

  build(): SourceGraph {
    return { entities: this.entities, relations: this.relations };
  }
}

/**
 * Build every knowledge item and its graph for one patient.
 *
 * @param flags the rule-based safety flags from the brief, included so the
 *   brain can answer "why" with the same reasoning the brief shows
 */
export const buildBrainDocuments = (
  record: PatientRecordResponse,
  flags: readonly SafetyFlag[],
  organizationId: string,
): BrainDocumentSet => {
  const acl = [clinicPrincipal(organizationId)];
  const patientName = `${record.firstName} ${record.lastName}`;
  const items: BrainKnowledgeItem[] = [];
  const graphPayload: Record<string, SourceGraph> = {};

  const diagnosisNames = new Map(record.diagnoses.map(({ id, name }) => [id, name]));

  const add = (
    type: ClinicalSourceType | 'SAFETY_FLAG',
    recordId: string,
    fields: { title: string; timestamp: string; text: string; relatedIds?: string[] },
    graph?: GraphBuilder,
  ) => {
    const id = brainItemId(type, recordId);
    // Transcripts are conversations; HydraDB's meeting class is built for them
    const isTranscript = type === 'TRANSCRIPT';
    items.push({
      id,
      title: fields.title,
      kind: isTranscript ? 'meeting' : 'custom',
      provider: BRAIN_PROVIDER,
      external_id: id,
      timestamp: fields.timestamp,
      fields: isTranscript
        ? { kind: 'meeting', title: fields.title, body: fields.text, started_at: fields.timestamp }
        : { kind: 'custom', body: fields.text, data: { record_type: type.toLowerCase() } },
      additional_metadata: { record_type: type, record_id: recordId },
      ...(fields.relatedIds && fields.relatedIds.length > 0
        ? { relations: { ids: fields.relatedIds } }
        : {}),
      acl,
    });
    if (graph) graphPayload[id] = graph.build();
  };

  const newGraph = () => {
    const graph = new GraphBuilder();
    return { graph, patient: graph.entity('patients', 'PATIENT', patientName) };
  };

  for (const visit of record.visits) {
    const { graph, patient } = newGraph();
    const doctor = graph.entity('doctors', 'DOCTOR', visit.doctor.name);
    const specialty = MEDICAL_SPECIALTY_LABELS[visit.specialty];
    const status = visit.status.replace('_', '-').toLowerCase();
    graph.relate(
      patient,
      'VISITED',
      doctor,
      `${patientName} had a ${specialty.toLowerCase()} visit (${status}): ${visit.reason}`,
      day(visit.scheduledAt),
    );

    add(
      'VISIT',
      visit.id,
      {
        title: `${specialty} visit, ${day(visit.scheduledAt)} — ${visit.reason}`,
        timestamp: visit.scheduledAt,
        text: [
          `${specialty} visit for ${patientName} with ${visit.doctor.name} on ${day(visit.scheduledAt)}.`,
          `Status: ${status}. Reason: ${visit.reason}.`,
          visit.notes ? `Doctor's notes: ${visit.notes}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
      graph,
    );
  }

  // No graph for transcripts: they are the patient's own words, and that is
  // exactly what HydraDB's extraction is for
  for (const transcript of record.transcripts) {
    add('TRANSCRIPT', transcript.id, {
      title: `Visit transcript, ${day(transcript.recordedAt)}`,
      timestamp: transcript.recordedAt,
      text: `Transcript of ${patientName}'s visit on ${day(transcript.recordedAt)}.\n${transcript.content}`,
      relatedIds: [brainItemId('VISIT', transcript.visitId)],
    });
  }

  for (const diagnosis of record.diagnoses) {
    const { graph, patient } = newGraph();
    const condition = graph.entity('conditions', 'CONDITION', diagnosis.name);
    const span = diagnosis.resolvedAt
      ? `from ${day(diagnosis.diagnosedAt)} to ${day(diagnosis.resolvedAt)}`
      : `since ${day(diagnosis.diagnosedAt)}`;
    graph.relate(
      patient,
      diagnosis.resolvedAt ? 'HAD_CONDITION' : 'HAS_CONDITION',
      condition,
      `${patientName} ${diagnosis.resolvedAt ? 'had' : 'has'} ${diagnosis.name}`,
      span,
    );

    add(
      'DIAGNOSIS',
      diagnosis.id,
      {
        title: `Diagnosis: ${diagnosis.name}`,
        timestamp: diagnosis.diagnosedAt,
        text: `${patientName} diagnosed with ${diagnosis.name}${diagnosis.code ? ` (ICD-10 ${diagnosis.code})` : ''} on ${day(diagnosis.diagnosedAt)}. ${diagnosis.resolvedAt ? `Resolved ${day(diagnosis.resolvedAt)}.` : 'Still active.'}`,
        relatedIds: diagnosis.visitId ? [brainItemId('VISIT', diagnosis.visitId)] : [],
      },
      graph,
    );
  }

  for (const medication of record.medications) {
    const { graph, patient } = newGraph();
    const drug = graph.entity('drugs', 'DRUG', medication.name);
    const isActive = medication.stoppedAt === null;
    const span = isActive
      ? `since ${day(medication.startedAt)}`
      : `from ${day(medication.startedAt)} to ${day(medication.stoppedAt ?? medication.startedAt)}`;

    graph.relate(
      patient,
      isActive ? 'TAKES' : 'TOOK',
      drug,
      `${patientName} ${isActive ? 'takes' : 'took'} ${medication.name} ${medication.dose} ${medication.frequency}`,
      span,
    );

    if (medication.drugClass) {
      const drugClass = graph.entity('drug_classes', 'DRUG_CLASS', medication.drugClass);
      graph.relate(
        drug,
        'IS_A',
        drugClass,
        `${medication.name} is one of the ${medication.drugClass}`,
      );
    }
    if (medication.prescribedBy) {
      const doctor = graph.entity('doctors', 'DOCTOR', medication.prescribedBy.name);
      graph.relate(
        doctor,
        'PRESCRIBED',
        drug,
        `${medication.prescribedBy.name} prescribed ${medication.name} on ${day(medication.startedAt)}`,
        day(medication.startedAt),
      );
    }
    const conditionName = medication.diagnosisId
      ? diagnosisNames.get(medication.diagnosisId)
      : undefined;
    if (conditionName) {
      const condition = graph.entity('conditions', 'CONDITION', conditionName);
      graph.relate(
        drug,
        'TREATS',
        condition,
        `${medication.name} was prescribed for ${conditionName}`,
      );
    }
    if (!isActive) {
      graph.relate(
        patient,
        'STOPPED',
        drug,
        `${medication.name} was stopped${medication.stopReason ? ` because: ${medication.stopReason}` : ''}`,
        day(medication.stoppedAt ?? medication.startedAt),
      );
    }

    add(
      'MEDICATION',
      medication.id,
      {
        title: `Medication: ${medication.name} ${medication.dose}`,
        timestamp: medication.startedAt,
        text: [
          `${medication.name} ${medication.dose}, ${medication.frequency}${medication.drugClass ? ` (${medication.drugClass})` : ''}.`,
          `Started ${day(medication.startedAt)}${medication.prescribedBy ? ` by ${medication.prescribedBy.name}` : ''}${conditionName ? ` for ${conditionName}` : ''}.`,
          isActive
            ? 'Listed as active.'
            : `Stopped ${day(medication.stoppedAt ?? medication.startedAt)}${medication.stopReason ? `: ${medication.stopReason}` : ''}.`,
        ].join(' '),
        relatedIds: [
          ...(medication.visitId ? [brainItemId('VISIT', medication.visitId)] : []),
          ...(medication.diagnosisId ? [brainItemId('DIAGNOSIS', medication.diagnosisId)] : []),
        ],
      },
      graph,
    );
  }

  for (const allergy of record.allergies) {
    const { graph, patient } = newGraph();
    const allergen = graph.entity('allergens', 'ALLERGEN', allergy.substance);
    graph.relate(
      patient,
      'ALLERGIC_TO',
      allergen,
      `${patientName} is allergic to ${allergy.substance} (${allergy.severity.toLowerCase()}): ${allergy.reaction}`,
    );

    add(
      'ALLERGY',
      allergy.id,
      {
        title: `Allergy: ${allergy.substance}`,
        timestamp: allergy.recordedAt,
        text: `${patientName} is allergic to ${allergy.substance}. Reaction: ${allergy.reaction}. Severity: ${allergy.severity.toLowerCase()}.`,
      },
      graph,
    );
  }

  for (const lab of record.labResults) {
    const { graph, patient } = newGraph();
    const test = graph.entity('lab_tests', 'LAB_TEST', lab.testName);
    const range = formatRange(lab.referenceLow, lab.referenceHigh);
    const flag = labFlag(lab.value, lab.referenceLow, lab.referenceHigh);
    graph.relate(
      patient,
      'HAD_LAB',
      test,
      `${lab.testName} was ${lab.value} ${lab.unit} (${flag})`,
      day(lab.collectedAt),
    );

    add(
      'LAB_RESULT',
      lab.id,
      {
        title: `Lab: ${lab.testName} ${lab.value} ${lab.unit}, ${day(lab.collectedAt)}`,
        timestamp: lab.collectedAt,
        text: `${lab.testName} for ${patientName} on ${day(lab.collectedAt)}: ${lab.value} ${lab.unit}. Normal range ${range}. Result is ${flag}.`,
        relatedIds: lab.visitId ? [brainItemId('VISIT', lab.visitId)] : [],
      },
      graph,
    );
  }

  for (const treatment of record.treatments) {
    const { graph, patient } = newGraph();
    const therapy = graph.entity('treatments', 'TREATMENT', treatment.name);
    graph.relate(
      patient,
      'RECEIVED',
      therapy,
      `${patientName} received ${treatment.name} (${treatment.kind})`,
      day(treatment.startedAt),
    );
    const conditionName = treatment.diagnosisId
      ? diagnosisNames.get(treatment.diagnosisId)
      : undefined;
    if (conditionName) {
      const condition = graph.entity('conditions', 'CONDITION', conditionName);
      graph.relate(therapy, 'TREATS', condition, `${treatment.name} is for ${conditionName}`);
    }

    add(
      'TREATMENT',
      treatment.id,
      {
        title: `Treatment: ${treatment.name}`,
        timestamp: treatment.startedAt,
        text: `${patientName}: ${treatment.name} (${treatment.kind}) from ${day(treatment.startedAt)}${treatment.endedAt ? ` to ${day(treatment.endedAt)}` : ', ongoing'}. ${treatment.notes ?? ''}`.trim(),
        relatedIds: treatment.diagnosisId ? [brainItemId('DIAGNOSIS', treatment.diagnosisId)] : [],
      },
      graph,
    );
  }

  // Flags are derived, but including them lets a "why" question retrieve the
  // same rule the brief applied, linked to the records it cites
  for (const flag of flags) {
    // HydraDB caps source ids at 100 bytes, so hash the cited records rather
    // than joining their ids. Same records in, same id out — upserts stay stable.
    const citedRecords = flag.sources.map(({ type, id }) => `${type}:${id}`).join('|');
    const flagId = `${flag.kind.toLowerCase()}_${createHash('sha256').update(citedRecords).digest('hex').slice(0, 24)}`;
    add('SAFETY_FLAG', flagId, {
      title: `Safety flag (${flag.kind.toLowerCase().replace('_', ' ')})`,
      timestamp: new Date().toISOString(),
      text: `Rule-based safety flag for ${patientName}, ${flag.severity.toLowerCase()} severity: ${flag.message}`,
      relatedIds: flag.sources.map(({ type, id }) => brainItemId(type, id)),
    });
  }

  return { items, graphPayload };
};

const formatRange = (low: number | null, high: number | null): string => {
  if (low !== null && high !== null) return `${low} to ${high}`;
  if (high !== null) return `below ${high}`;
  if (low !== null) return `above ${low}`;
  return 'not given';
};

const labFlag = (value: number, low: number | null, high: number | null): string => {
  if (high !== null && value > high) return 'high';
  if (low !== null && value < low) return 'low';
  return 'normal';
};
