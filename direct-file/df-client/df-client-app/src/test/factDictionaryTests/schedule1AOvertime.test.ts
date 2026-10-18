import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, makeW2Data, mfjFilerData, mfsFilerData, singleFilerData } from '../testData.js';

/**
 * #52 Schedule 1-A Part III — qualified overtime compensation, IRC §225 (P.L. 119-21 §70202).
 * 2026 draft Schedule 1-A: line 21 = smaller of line 20 or $12,500 ($25,000 MFJ); line 23 = $150,000 ($300,000 MFJ);
 * line 25 = line 24 / $1,000 "decrease the result to the next lower whole number"; line 26 = line 25 × $100;
 * line 27 = line 21 − line 26, not below 0. Amounts from Form W-2 box 12 code TT (new for 2026).
 */
const W2 = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const tt = (amt: string) => ({ [`/formW2s/#${W2}/qualifiedOvertimeCodeTT`]: createDollarWrapper(amt) });
const yes = { '/overtimeFlsaConfirmed': createBooleanWrapper(true) };
type FG = ReturnType<typeof setupFactGraph>['factGraph'];
const get = (fg: FG, p: string) => fg.get(p as ConcretePath).get.toString();
const complete = (fg: FG, p: string) => fg.get(p as ConcretePath).complete;
const single = (wages: number, amt: string, extra = {}) =>
  setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(wages), ...tt(amt), ...yes, ...extra })
    .factGraph;
const mfj = (wages: number, amt: string) =>
  setupFactGraph({ ...baseFilerData, ...mfjFilerData, ...makeW2Data(wages), ...tt(amt), ...yes }).factGraph;

describe(`Schedule 1-A Part III — qualified overtime`, () => {
  it(`below the cap, MAGI below threshold: full amount; flows to line 27 and line 44`, () => {
    const fg = single(70000, `4000`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`4000.00`);
    expect(get(fg, `/schedule1ALine44`)).toBe(`4000.00`);
  });

  it(`no overtime: complete $0 without asking`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(70000) });
    expect(factGraph.get(`/hasW2CodeTtOvertime` as ConcretePath).get).toBe(false);
    expect(complete(factGraph, `/schedule1AOvertimeLine27`)).toBe(true);
    expect(get(factGraph, `/schedule1AOvertimeLine27`)).toBe(`0.00`);
  });

  it(`FLSA premium not confirmed: $0`, () => {
    expect(
      get(single(70000, `4000`, { '/overtimeFlsaConfirmed': createBooleanWrapper(false) }), `/schedule1ALine27`)
    ).toBe(`0.00`);
  });

  it(`cap: $20,000 of code TT → line 21 $12,500 (single)`, () => {
    const fg = single(100000, `20000`);
    expect(get(fg, `/schedule1AOvertimeLine21`)).toBe(`12500.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`12500.00`);
  });

  it(`MAGI exactly $150,000 (at threshold): no reduction`, () => {
    const fg = single(150000, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine26`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`10000.00`);
  });

  it(`MAGI $150,999 (partial $1,000 only): line 25 rounds down to 0 → no reduction`, () => {
    const fg = single(150999, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine25`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`10000.00`);
  });

  it(`MAGI $175,500 (above): line 25 = 25 (25.5 rounded down) → line 26 $2,500 → $7,500`, () => {
    const fg = single(175500, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine25`)).toBe(`25.00`);
    expect(get(fg, `/schedule1AOvertimeLine26`)).toBe(`2500.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`7500.00`);
  });

  it(`cap applies before the phase-out: $20,000 TT, MAGI $200,000 → 12,500 − 5,000 = $7,500`, () => {
    expect(get(single(200000, `20000`), `/schedule1ALine27`)).toBe(`7500.00`);
  });

  it(`full phase-out: $10,000 TT, MAGI $260,000 → $0`, () => {
    expect(get(single(260000, `10000`), `/schedule1ALine27`)).toBe(`0.00`);
  });

  it(`MFJ: cap $25,000 and threshold $300,000; $30,000 TT at MAGI $310,500 → 25,000 − 1,000 = $24,000`, () => {
    const fg = mfj(310500, `30000`);
    expect(get(fg, `/schedule1AOvertimeLine21`)).toBe(`25000.00`);
    expect(get(fg, `/schedule1AOvertimeLine23`)).toBe(`300000.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`24000.00`);
  });

  it(`MFS: married must file jointly → $0 (§225(e))`, () => {
    const { factGraph } = setupFactGraph({
      ...baseFilerData,
      ...mfsFilerData,
      ...makeW2Data(60000),
      ...tt(`5000`),
      ...yes,
    });
    expect(get(factGraph, `/schedule1ALine27`)).toBe(`0.00`);
  });
});

/**
 * #68: overtime not on W-2 code TT, figured with the draft Form 1040 instructions p.106 methods
 * (https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf): 1 premium shown (x1); 2 total time-and-a-half pay
 * "divide the total amount by three (3)"; 3 double-time premium x 1/2 (Example 2: $10,000 → $5,000);
 * 4 total double-time pay x 1/4 (Example 3: $20,000 → $5,000); 5 regular rate x hours over 40, x 1/2.
 * §225(c)(1) (https://www.law.cornell.edu/uscode/text/26/225): "in excess of the regular rate".
 */
const switchOn = { '/overtimeAlternativeMethodsApply': createBooleanWrapper(true) };
const selfFigured = (method: string, amount: string, extra: Record<string, unknown> = {}) => ({
  ...switchOn,
  '/overtimeNotOnW2CodeTT': createBooleanWrapper(true),
  '/overtimeOnForm1099': createBooleanWrapper(false),
  '/overtimeSpecialSection7Rule': createBooleanWrapper(false),
  '/overtimeMethod': createEnumWrapper(method, `/overtimeMethodOptions`),
  '/overtimeStatementAmount': createDollarWrapper(amount),
  ...yes,
  ...extra,
});
const noTT = (wages: number, extra: Record<string, unknown>, base: Record<string, unknown> = singleFilerData) =>
  setupFactGraph({ ...baseFilerData, ...base, ...makeW2Data(wages), ...extra }).factGraph;

describe(`Schedule 1-A Part III — overtime figured from records, switch ON (#68)`, () => {
  const methods: [string, string, string][] = [
    [`statementPremium`, `5000`, `5000.00`], // paragraph 1
    [`statementTotalTimeAndHalf`, `15000`, `5000.00`], // paragraph 2, Example 1: $15,000 / 3
    [`statementPremiumDoubleTime`, `10000`, `5000.00`], // paragraph 3, Example 2
    [`statementTotalDoubleTime`, `20000`, `5000.00`], // paragraph 4, Example 3
    [`regularPayForOvertimeHours`, `10000`, `5000.00`], // paragraph 5: $25/hr x 400 hrs over 40, x 1/2
  ];
  methods.forEach(([method, amount, expected]) => {
    it(`${method}: ${amount} → ${expected} on line 17 and line 27, no knockout`, ({ task }) => {
      task.meta.testedFactPaths = [`/overtimeSelfFiguredAmount`, `/schedule1AOvertimeLine17`, `/schedule1ALine27`];
      const fg = noTT(70000, selfFigured(method, amount));
      expect(get(fg, `/overtimeSelfFiguredAmount`)).toBe(expected);
      expect(get(fg, `/schedule1AOvertimeLine17`)).toBe(expected);
      expect(get(fg, `/schedule1ALine27`)).toBe(expected);
      expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(false);
      expect(fg.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
    });
  });

  it(`combined with code TT: $4,000 TT + $3,000 premium = $7,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1AOvertimeLine17`, `/schedule1ALine27`];
    const fg = single(70000, `4000`, selfFigured(`statementPremium`, `3000`));
    expect(get(fg, `/schedule1AOvertimeLine17`)).toBe(`7000.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`7000.00`);
  });

  it(`cap applies to the combined total: $10,000 TT + $3,000 → $12,500 (single), $12,501 total edge`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1AOvertimeLine21`];
    expect(get(single(70000, `10000`, selfFigured(`statementPremium`, `2500`)), `/schedule1AOvertimeLine21`)).toBe(
      `12500.00`
    );
    expect(get(single(70000, `10000`, selfFigured(`statementPremium`, `2501`)), `/schedule1AOvertimeLine21`)).toBe(
      `12500.00`
    );
    expect(get(single(70000, `10000`, selfFigured(`statementPremium`, `3000`)), `/schedule1ALine27`)).toBe(`12500.00`);
  });

  it(`self-figured only, over the cap: $40,000 total time-and-a-half pay → $13,333.33 → $12,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1AOvertimeLine21`];
    expect(get(noTT(90000, selfFigured(`statementTotalTimeAndHalf`, `40000`)), `/schedule1AOvertimeLine21`)).toBe(
      `12500.00`
    );
  });

  it(`phaseout applies: $10,000 premium at MAGI $175,500 → $7,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine27`];
    expect(get(noTT(175500, selfFigured(`statementPremium`, `10000`)), `/schedule1ALine27`)).toBe(`7500.00`);
  });

  it(`MFJ cap $25,000 applies to the self-figured amount`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1AOvertimeLine21`];
    expect(get(noTT(120000, selfFigured(`statementPremium`, `30000`), mfjFilerData), `/schedule1AOvertimeLine21`)).toBe(
      `25000.00`
    );
  });

  it(`FLSA premium not confirmed: $0`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine27`];
    const fg = noTT(
      70000,
      selfFigured(`statementPremium`, `5000`, { '/overtimeFlsaConfirmed': createBooleanWrapper(false) })
    );
    expect(get(fg, `/schedule1ALine27`)).toBe(`0.00`);
  });

  it(`MFS: $0 (§225(e))`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine27`];
    expect(get(noTT(60000, selfFigured(`statementPremium`, `5000`), mfsFilerData), `/schedule1ALine27`)).toBe(`0.00`);
  });

  it(`answered yes but no method yet: line 27 is incomplete, not a silent $0`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine27`];
    const fg = noTT(70000, {
      ...switchOn,
      '/overtimeNotOnW2CodeTT': createBooleanWrapper(true),
      '/overtimeOnForm1099': createBooleanWrapper(false),
      '/overtimeSpecialSection7Rule': createBooleanWrapper(false),
    });
    expect(complete(fg, `/schedule1ALine27`)).toBe(false);
  });

  it(`switch on: 1099 screen is available; answering no lets methods compute`, ({ task }) => {
    // Draft Form 1040 instructions p.106 alternative methods — only when the switch is on.
    task.meta.testedFactPaths = [`/flowAskOvertime1099`, `/flowAskOvertimeMethod`, `/overtimeSelfFiguredAmount`];
    const asked = noTT(70000, {
      ...switchOn,
      '/overtimeNotOnW2CodeTT': createBooleanWrapper(true),
    });
    expect(asked.get(`/flowAskOvertime1099` as ConcretePath).get).toBe(true);
    const fg = noTT(70000, selfFigured(`statementPremium`, `3000`));
    expect(fg.get(`/flowAskOvertime1099` as ConcretePath).get).toBe(true);
    expect(fg.get(`/flowAskOvertimeMethod` as ConcretePath).get).toBe(true);
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(false);
    expect(get(fg, `/overtimeSelfFiguredAmount`)).toBe(`3000.00`);
  });
});

describe(`Schedule 1-A Part III — stop for overtime that can't be computed (#68)`, () => {
  it(`clean return and code-TT-only return are not knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutOvertimeNotComputable`, `/flowIsKnockedOut`];
    const clean = single(70000, `4000`, { '/overtimeNotOnW2CodeTT': createBooleanWrapper(false) });
    expect(clean.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(false);
    expect(clean.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
    const none = noTT(70000, {});
    expect(none.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(false);
  });

  const stops: [string, Record<string, unknown>][] = [
    [`1099 contractor overtime`, { '/overtimeOnForm1099': createBooleanWrapper(true) }],
    [`special FLSA section 7 rule`, { '/overtimeSpecialSection7Rule': createBooleanWrapper(true) }],
    [`other rate or method`, { '/overtimeMethod': createEnumWrapper(`other`, `/overtimeMethodOptions`) }],
  ];
  stops.forEach(([label, override]) => {
    it(`${label}: knocks out, blocks submission, and adds nothing to line 27`, ({ task }) => {
      task.meta.testedFactPaths = [
        `/flowKnockoutOvertimeNotComputable`,
        `/flowIsKnockedOut`,
        `/overtimeSelfFiguredAmount`,
      ];
      const fg = noTT(70000, selfFigured(`statementPremium`, `5000`, override));
      expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(true);
      expect(fg.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(true);
      expect(get(fg, `/overtimeSelfFiguredAmount`)).toBe(`0.00`);
    });
  });

  it(`1099 overtime alone (no W-2 overtime question needed): knocks out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutOvertimeNotComputable`];
    const fg = noTT(70000, {
      ...switchOn,
      '/overtimeNotOnW2CodeTT': createBooleanWrapper(true),
      '/overtimeOnForm1099': createBooleanWrapper(true),
    });
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(true);
  });

  it(`the stop is a submission-blocking fact and the #59 stop is gone`, () => {
    expect(submissionBlockingFacts).toContain(`/flowKnockoutOvertimeNotComputable`);
    expect(submissionBlockingFacts).not.toContain(`/flowKnockoutOvertimeNotOnW2CodeTT`);
  });
});

describe(`Schedule 1-A Part III — TY2026 default: alternative methods switch OFF (#68)`, () => {
  it(`the switch defaults to off`, ({ task }) => {
    task.meta.testedFactPaths = [`/overtimeAlternativeMethodsApply`];
    expect(noTT(70000, {}).get(`/overtimeAlternativeMethodsApply` as ConcretePath).get).toBe(false);
  });

  it(`overtime not on code TT: stop fires, 1099 and method screens skipped, nothing computed`, ({ task }) => {
    // Polish: /flowAskOvertime1099 gates the 1099 screen so stop-only users skip it.
    task.meta.testedFactPaths = [
      `/flowKnockoutOvertimeNotComputable`,
      `/flowIsKnockedOut`,
      `/flowAskOvertime1099`,
      `/flowAskOvertimeMethod`,
    ];
    const fg = noTT(70000, { '/overtimeNotOnW2CodeTT': createBooleanWrapper(true) });
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(true);
    expect(fg.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(true);
    expect(fg.get(`/flowAskOvertime1099` as ConcretePath).get).toBe(false);
    expect(fg.get(`/flowAskOvertimeSpecialRule` as ConcretePath).get).toBe(false);
    expect(fg.get(`/flowAskOvertimeMethod` as ConcretePath).get).toBe(false);
    expect(get(fg, `/overtimeSelfFiguredAmount`)).toBe(`0.00`);
  });

  it(`1099 overtime: stop fires`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutOvertimeNotComputable`];
    const fg = noTT(70000, {
      '/overtimeNotOnW2CodeTT': createBooleanWrapper(true),
      '/overtimeOnForm1099': createBooleanWrapper(true),
    });
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(true);
  });

  it(`even with method answers present, switch off computes $0 and stops; code TT still counts`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1AOvertimeLine17`, `/flowKnockoutOvertimeNotComputable`];
    const answers = selfFigured(`statementPremium`, `3000`, {
      '/overtimeAlternativeMethodsApply': createBooleanWrapper(false),
    });
    const fg = single(70000, `4000`, answers);
    expect(get(fg, `/schedule1AOvertimeLine17`)).toBe(`4000.00`);
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(true);
  });

  it(`code-TT-only return with the switch off: not stopped`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutOvertimeNotComputable`, `/schedule1ALine27`];
    const fg = single(70000, `4000`, { '/overtimeNotOnW2CodeTT': createBooleanWrapper(false) });
    expect(fg.get(`/flowKnockoutOvertimeNotComputable` as ConcretePath).get).toBe(false);
    expect(get(fg, `/schedule1ALine27`)).toBe(`4000.00`);
  });
});
