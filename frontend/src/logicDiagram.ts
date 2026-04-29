export interface LogicBlockLike {
  id: number;
  name: string;
  input_expressions: Record<string, string>;
}

const RESERVED_WORDS = new Set(['true', 'false', 'nil', 'null']);

export function extractLogicBlockReferences(expression: string, blocks: LogicBlockLike[] = []): number[] {
  const ids = new Set<number>();
  const byName = new Map(blocks.map((block) => [block.name, block.id]));
  for (const match of expression.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    const name = match[1];
    if (RESERVED_WORDS.has(name.toLowerCase())) continue;
    const id = byName.get(name);
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

export function expressionReferencesByBlock(
  inputExpressions: Record<string, string>,
  blocks: LogicBlockLike[] = [],
): number[] {
  const ids = new Set<number>();
  for (const expression of Object.values(inputExpressions)) {
    extractLogicBlockReferences(expression, blocks).forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function assignLogicBlockStrata(blocks: LogicBlockLike[]): Map<number, number> {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const strata = new Map<number, number>();
  const visiting = new Set<number>();

  const visit = (id: number): number => {
    if (strata.has(id)) return strata.get(id)!;
    if (visiting.has(id)) throw new Error('Dependency loop detected');

    const block = byId.get(id);
    if (!block) return 0;

    visiting.add(id);
    const upstream = expressionReferencesByBlock(block.input_expressions, blocks)
      .filter((refId) => byId.has(refId))
      .map((refId) => visit(refId));
    visiting.delete(id);

    const stratum = upstream.length === 0 ? 1 : Math.max(...upstream) + 1;
    strata.set(id, stratum);
    return stratum;
  };

  blocks.forEach((block) => visit(block.id));
  return strata;
}

export function nextStratumForExpressions(
  existingBlocks: LogicBlockLike[],
  inputExpressions: Record<string, string>,
): number {
  const strata = assignLogicBlockStrata(existingBlocks);
  const upstream = expressionReferencesByBlock(inputExpressions, existingBlocks)
    .map((id) => strata.get(id) ?? 0);

  return upstream.length === 0 ? 1 : Math.max(...upstream) + 1;
}
