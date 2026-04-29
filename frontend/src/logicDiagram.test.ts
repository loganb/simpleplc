import { describe, expect, it } from 'vitest';
import {
  assignLogicBlockStrata,
  expressionReferencesByBlock,
  extractLogicBlockReferences,
  nextStratumForExpressions,
} from './logicDiagram';

describe('logic diagram helpers', () => {
  it('extracts logic block references from expressions', () => {
    expect(extractLogicBlockReferences('BOT_Ready && !Flow_Lockout', [
      { id: 2, name: 'BOT_Ready', input_expressions: {} },
      { id: 9, name: 'Flow_Lockout', input_expressions: {} },
    ])).toEqual([2, 9]);
  });

  it('extracts references across named input expressions', () => {
    expect(expressionReferencesByBlock({
      set: 'BOT_Ready && BoilerOutletTemp',
      reset: '!Flow_Lockout',
    }, [
      { id: 1, name: 'BOT_Ready', input_expressions: {} },
      { id: 2, name: 'Flow_Lockout', input_expressions: {} },
    ])).toEqual([1, 2]);
  });

  it('assigns strata from dependency depth', () => {
    const strata = assignLogicBlockStrata([
      { id: 1, name: 'BOT_Ready', input_expressions: { value: 'BoilerOutletTemp' } },
      { id: 2, name: 'DHW_Call', input_expressions: { set: 'BOT_Ready' } },
      { id: 3, name: 'Heat_Lockout', input_expressions: { set: 'DHW_Call && BOT_Ready' } },
    ]);

    expect(strata.get(1)).toBe(1);
    expect(strata.get(2)).toBe(2);
    expect(strata.get(3)).toBe(3);
  });

  it('detects dependency loops', () => {
    expect(() => assignLogicBlockStrata([
      { id: 1, name: 'A', input_expressions: { value: 'B' } },
      { id: 2, name: 'B', input_expressions: { value: 'A' } },
    ])).toThrow('Dependency loop');
  });

  it('computes the stratum for a new block expression', () => {
    const stratum = nextStratumForExpressions(
      [
        { id: 1, name: 'BOT_Ready', input_expressions: { value: 'BoilerOutletTemp' } },
        { id: 2, name: 'DHW_Call', input_expressions: { set: 'BOT_Ready' } },
      ],
      { set: 'DHW_Call', reset: 'false' },
    );

    expect(stratum).toBe(3);
  });
});
