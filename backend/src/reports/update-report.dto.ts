/**
 * Request body of PATCH /api/reports/:id: the user's corrections, applied
 * together in one transaction.
 *
 * Validation rules live on the classes (class-validator) and run in Nest's
 * global ValidationPipe; unknown properties are rejected with 400.
 *
 * For cell fields: omitted (undefined) = leave unchanged, null or "" = clear.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const MAX_TEXT = 200;
const MAX_ROWS = 500;

/** Cells shared by edited and added rows. */
class RowCellsDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  value?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  range?: string | null;
}

/** Changes to an existing row, identified by its position in the report. */
export class UpdateParameterDto extends RowCellsDto {
  @IsInt()
  @Min(1)
  position: number;

  /** Optional, but if given it must be a non-empty string. */
  @ValidateIf((dto: UpdateParameterDto) => dto.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXT)
  name?: string;
}

/** A row the extraction missed. */
export class AddParameterDto extends RowCellsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXT)
  name: string;
}

export class UpdateReportDto {
  /** Replaces a generated or misread report / sample ID. */
  @ValidateIf((dto: UpdateReportDto) => dto.reportIdentifier !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reportIdentifier?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => UpdateParameterDto)
  updateParameters?: UpdateParameterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => AddParameterDto)
  addParameters?: AddParameterDto[];

  /** Positions of rows to delete. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  removePositions?: number[];
}
