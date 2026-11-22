import { Injectable } from '@nestjs/common';
import { In, type EntityManager } from 'typeorm';
import { toCanonicalKey } from './canonical-key.js';
import { ParameterDefinition } from './parameter-definition.entity.js';

/**
 * Maintains the parameter catalog (`parameter_definitions`).
 */
@Injectable()
export class CatalogService {
  /**
   * Returns the catalog id for each printed name, creating missing entries.
   *
   * Runs inside the caller's transaction (`manager`). New entries are inserted
   * with ON CONFLICT DO NOTHING, so two uploads adding the same new parameter
   * at the same moment cannot fail on the unique key; both then read the
   * single row that won.
   *
   * @returns a map from canonical key to definition id.
   */
  async resolveDefinitionIds(manager: EntityManager, names: string[]): Promise<Map<string, number>> {
    // First printed form of each key becomes its display name.
    const displayNames = new Map<string, string>();
    for (const name of names) {
      const key = toCanonicalKey(name);
      if (key && !displayNames.has(key)) displayNames.set(key, name.trim());
    }
    if (displayNames.size === 0) return new Map();

    await manager
      .createQueryBuilder()
      .insert()
      .into(ParameterDefinition)
      .values([...displayNames].map(([canonicalKey, displayName]) => ({ canonicalKey, displayName })))
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();

    const definitions = await manager.findBy(ParameterDefinition, {
      canonicalKey: In([...displayNames.keys()]),
    });
    return new Map(definitions.map((definition) => [definition.canonicalKey, definition.id]));
  }
}
