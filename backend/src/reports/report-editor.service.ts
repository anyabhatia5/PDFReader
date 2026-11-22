import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import { toCanonicalKey } from '../catalog/canonical-key.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { parseRowCells } from '../extraction/row-parser.js';
import { ReportParameter, type OriginalCells } from './entities/report-parameter.entity.js';
import { Report } from './entities/report.entity.js';
import type { AddParameterDto, UpdateParameterDto, UpdateReportDto } from './update-report.dto.js';

/**
 * Applies a user's corrections to a stored report: a new report ID, edited
 * rows, added rows and removed rows, all in ONE transaction (all or nothing).
 *
 * Edited cells are re-parsed with the same parser as extraction, so the
 * numeric value, limits and High/Low flag always match the text. The first
 * time an extracted row is edited, its extracted version is kept in
 * `original`, so OCR mistakes stay visible and can be restored.
 */
@Injectable()
export class ReportEditorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
  ) {}

  /** @throws NotFoundException (unknown report), BadRequestException (invalid change) */
  async update(reportId: string, changes: UpdateReportDto): Promise<void> {
    const updates = changes.updateParameters ?? [];
    const additions = changes.addParameters ?? [];
    const removals = new Set(changes.removePositions ?? []);

    await this.dataSource.transaction(async (manager) => {
      const report = await manager.findOne(Report, {
        where: { id: reportId },
        relations: { parameters: true },
      });
      if (!report) throw new NotFoundException(`Report ${reportId} was not found.`);

      const rowsByPosition = new Map(report.parameters.map((row) => [row.position, row]));
      assertValidChanges(rowsByPosition, updates, removals);

      // Catalog entries for every new or changed name, resolved in one go.
      const names = [...updates.flatMap((u) => (u.name === undefined ? [] : [u.name])), ...additions.map((a) => a.name)];
      const definitionIds = await this.catalog.resolveDefinitionIds(manager, names.map(cleanName));

      const now = new Date();
      if (removals.size > 0) {
        await manager.delete(ReportParameter, { reportId, position: In([...removals]) });
      }
      for (const update of updates) {
        await applyUpdate(manager, rowsByPosition.get(update.position)!, update, definitionIds, now);
      }
      await insertAdditions(manager, report, additions, definitionIds, now);

      // Report-level fields: corrected ID, and a status that matches the rows.
      const remainingRows = report.parameters.length - removals.size + additions.length;
      const reportChanges: Partial<Report> = {
        status: remainingRows > 0 ? 'completed' : 'no_parameters_found',
      };
      if (changes.reportIdentifier !== undefined) {
        const identifier = changes.reportIdentifier.trim();
        if (!identifier) throw new BadRequestException('The report ID cannot be empty.');
        if (identifier !== report.reportIdentifier) {
          reportChanges.reportIdentifier = identifier;
          reportChanges.identifierSource = 'manual';
        }
      }
      await manager.update(Report, { id: reportId }, reportChanges);
    });
  }
}

/** Rejects references to rows that don't exist, and contradictory changes. */
function assertValidChanges(
  rowsByPosition: Map<number, ReportParameter>,
  updates: UpdateParameterDto[],
  removals: Set<number>,
): void {
  for (const position of [...updates.map((u) => u.position), ...removals]) {
    if (!rowsByPosition.has(position)) throw new BadRequestException(`Row ${position} does not exist.`);
  }
  const updated = new Set<number>();
  for (const { position } of updates) {
    if (removals.has(position)) throw new BadRequestException(`Row ${position} cannot be both edited and removed.`);
    if (updated.has(position)) throw new BadRequestException(`Row ${position} is edited more than once.`);
    updated.add(position);
  }
}

/** Trims a name and checks it can be catalogued (has letters or digits). */
function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!toCanonicalKey(trimmed)) {
    throw new BadRequestException(`"${name}" is not a valid parameter name; it needs letters or digits.`);
  }
  return trimmed;
}

/** Trims a cell; an empty cell is stored as null. */
function cleanCell(cell: string | null | undefined): string | null {
  return cell?.trim() || null;
}

/** The row's current cells as text. */
function cellsOf(row: ReportParameter): OriginalCells {
  return { name: row.nameRaw, value: row.valueRaw, unit: row.unit, range: row.refRangeRaw };
}

/** Writes the cells (and everything parsed from them) onto a row entity. */
function assignCells(row: ReportParameter, cells: OriginalCells, definitionIds: Map<string, number>): void {
  const parsed = parseRowCells(cells);
  row.nameRaw = cells.name;
  row.parameterDefinitionId = definitionIds.get(toCanonicalKey(cells.name)) ?? row.parameterDefinitionId;
  row.valueRaw = parsed.value.raw;
  row.valueNumeric = parsed.value.numeric;
  row.valueComparator = parsed.value.comparator;
  row.unit = parsed.unit;
  row.refRangeRaw = parsed.referenceRange.raw;
  row.refLow = parsed.referenceRange.low;
  row.refHigh = parsed.referenceRange.high;
  row.isAbnormal = parsed.isAbnormal;
}

async function applyUpdate(
  manager: EntityManager,
  row: ReportParameter,
  update: UpdateParameterDto,
  definitionIds: Map<string, number>,
  now: Date,
): Promise<void> {
  const before = cellsOf(row);
  const after: OriginalCells = {
    name: update.name === undefined ? before.name : cleanName(update.name),
    value: update.value === undefined ? before.value : cleanCell(update.value),
    unit: update.unit === undefined ? before.unit : cleanCell(update.unit),
    range: update.range === undefined ? before.range : cleanCell(update.range),
  };
  if (JSON.stringify(after) === JSON.stringify(before)) return; // nothing actually changed

  // Keep the extracted version the first time an extracted row is edited.
  if (row.source === 'extracted' && row.original === null) row.original = before;
  assignCells(row, after, definitionIds);
  row.editedAt = now;
  await manager.save(ReportParameter, row);
}

/** Appends added rows after the last existing position (positions are never reused). */
async function insertAdditions(
  manager: EntityManager,
  report: Report,
  additions: AddParameterDto[],
  definitionIds: Map<string, number>,
  now: Date,
): Promise<void> {
  let position = Math.max(0, ...report.parameters.map((row) => row.position));
  for (const addition of additions) {
    const row = manager.create(ReportParameter, {
      reportId: report.id,
      position: ++position,
      pageNumber: null,
      source: 'manual',
      original: null,
      editedAt: now,
    });
    assignCells(
      row,
      {
        name: cleanName(addition.name),
        value: cleanCell(addition.value),
        unit: cleanCell(addition.unit),
        range: cleanCell(addition.range),
      },
      definitionIds,
    );
    await manager.save(ReportParameter, row);
  }
}
