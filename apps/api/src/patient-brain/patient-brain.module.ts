import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientsModule } from '../patients/patients.module';
import { HydraDbGateway } from './hydra-db.gateway';
import { PatientBrainController } from './patient-brain.controller';
import { PatientBrainService } from './patient-brain.service';

@Module({
  imports: [PrismaModule, PatientsModule],
  controllers: [PatientBrainController],
  providers: [HydraDbGateway, PatientBrainService],
  exports: [PatientBrainService],
})
export class PatientBrainModule {}
