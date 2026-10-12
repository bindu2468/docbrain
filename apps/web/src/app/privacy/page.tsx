import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PrivacyPage() {
  return (
    <PageContainer>
      <PageHeader title="Privacy Policy" description="Last updated: October 12, 2026" />
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p>
          At DocBrain, we take your privacy seriously. This policy explains how we collect, use, and
          protect personal data.
        </p>
        <p>
          <strong>This is a demonstration build.</strong> It holds synthetic patient records only
          and is not approved for real patient data. Do not enter information about real patients.
        </p>
        <h2>Data We Collect</h2>
        <p>
          For clinicians, we collect the account details you provide, such as your name, email
          address, and specialty. For patients, we store the records a clinic enters: visits, visit
          transcripts, diagnoses, medications, allergies, lab results, and treatments.
        </p>
        <h2>How We Use Your Data</h2>
        <p>
          We use account data to sign you in and run the service. Patient records are used only to
          show them to doctors in the same clinic and to build pre-visit briefs. Records from one
          clinic are never shown to another.
        </p>
        <h2>Services That Process Data</h2>
        <p>
          When a clinic turns these features on, patient records are sent to HydraDB to make them
          searchable, and relevant records are sent to a language model through OpenRouter to write
          summaries and answers. These services process the data on our behalf.
        </p>
        <h2>Your Rights</h2>
        <p>
          Under GDPR and CCPA, you have certain rights regarding your personal data, including the
          right to access, delete, and port your data.
        </p>
      </div>
    </PageContainer>
  );
}
