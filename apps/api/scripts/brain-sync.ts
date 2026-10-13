/**
 * Sync every patient in a clinic to the patient brain (HydraDB).
 *
 *   pnpm --filter @docbrain/api brain:sync [organization-slug]
 *
 * Defaults to the seeded `riverside-clinic`. Run it after `prisma:seed`: the
 * seed rebuilds each patient's history with new ids, and this rebuilds the
 * brain to match. Needs HYDRA_DB_API_KEY in apps/api/.env.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { PatientBrainModule } from '../src/patient-brain/patient-brain.module';
import { PatientBrainService } from '../src/patient-brain/patient-brain.service';
import { HydraDbGateway } from '../src/patient-brain/hydra-db.gateway';
import { patientRecordInclude, toPatientRecord } from '../src/patients/patient.mapper';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: path.join(__dirname, '../.env') }),
    PatientBrainModule,
  ],
})
class BrainSyncModule {}

async function main() {
  const slug = process.argv[2] ?? 'riverside-clinic';
  const app = await NestFactory.createApplicationContext(BrainSyncModule, {
    logger: ['error', 'warn'],
  });

  try {
    if (!app.get(HydraDbGateway).isEnabled) {
      throw new Error('HYDRA_DB_API_KEY is not set in apps/api/.env.');
    }

    const prisma = app.get(PrismaService);
    const brain = app.get(PatientBrainService);

    const organization = await prisma.organization.findUnique({
      where: { slug },
      include: { members: { where: { role: 'OWNER' }, take: 1 } },
    });
    if (!organization) throw new Error(`No organization with slug "${slug}".`);

    // The brief's "since last visit" baseline needs a viewer; flags do not
    // depend on it, so any clinic owner will do
    const viewerId = organization.members[0]?.userId ?? 'system';

    const patients = await prisma.patient.findMany({
      where: { organizationId: organization.id, archivedAt: null },
      include: patientRecordInclude(organization.id),
      orderBy: { lastName: 'asc' },
    });

    console.log(`Syncing ${patients.length} patient(s) in "${organization.name}"...`);
    for (const patient of patients) {
      const result = await brain.syncRecord(
        organization.id,
        toPatientRecord(patient, new Date()),
        viewerId,
      );
      console.log(`  ${patient.firstName} ${patient.lastName}: ${result.itemCount} items`);
    }
    console.log('Done. Indexing continues in HydraDB; check a patient page for status.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
