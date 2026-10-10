import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePathsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  home: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  backups: string;
}
