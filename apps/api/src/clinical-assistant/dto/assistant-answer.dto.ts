import { IsString, MaxLength, MinLength } from 'class-validator';

export class AssistantAnswerDto {
  @IsString()
  @MinLength(3, { message: 'Ask a question of at least 3 characters' })
  @MaxLength(500)
  question: string;
}
