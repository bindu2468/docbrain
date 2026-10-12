import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { PatientBrainModule } from '../patient-brain/patient-brain.module';
import { ClinicalAssistantController } from './clinical-assistant.controller';
import { ClinicalAssistantService } from './clinical-assistant.service';
import { OpenRouterGateway } from './openrouter.gateway';

@Module({
  imports: [PatientsModule, PatientBrainModule],
  controllers: [ClinicalAssistantController],
  providers: [OpenRouterGateway, ClinicalAssistantService],
})
export class ClinicalAssistantModule {}
