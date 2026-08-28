import { describe, it, expect } from 'vitest';
import { TOOLS } from './tools';

// Chrome's published budgets (CLAUDE.md section 2): tool name <=30 chars,
// tool description <=500 chars, parameter description <=150 chars. Missing
// parameter descriptions are Chrome's named #1 cause of wrong-argument calls,
// so every schema property must carry one — recursively, since `locator` is
// itself an object with its own `page`/`lines` properties.
const NAME_BUDGET = 30;
const DESCRIPTION_BUDGET = 500;
const PARAM_DESCRIPTION_BUDGET = 150;

function collectProperties(schema: any): any[] {
  const props = Object.values(schema?.properties ?? {});
  const nested = props.flatMap((p: any) => (p?.type === 'object' ? collectProperties(p) : []));
  return [...props, ...nested];
}

describe('TOOLS catalogue budgets', () => {
  it('keeps every tool name within 30 characters', () => {
    for (const t of TOOLS) {
      expect(t.name.length, `${t.name} name is ${t.name.length} chars`).toBeLessThanOrEqual(NAME_BUDGET);
    }
  });

  it('keeps every tool description within 500 characters', () => {
    for (const t of TOOLS) {
      expect(t.description.length, `${t.name} description is ${t.description.length} chars`).toBeLessThanOrEqual(DESCRIPTION_BUDGET);
    }
  });

  it('gives every schema property a non-empty description under 150 characters', () => {
    for (const t of TOOLS) {
      for (const prop of collectProperties(t.inputSchema)) {
        expect(typeof prop.description, `${t.name} has a property missing a description`).toBe('string');
        expect(prop.description.length, `${t.name} property description is empty`).toBeGreaterThan(0);
        expect(prop.description.length, `${t.name} property description is ${prop.description.length} chars`)
          .toBeLessThanOrEqual(PARAM_DESCRIPTION_BUDGET);
      }
    }
  });
});
