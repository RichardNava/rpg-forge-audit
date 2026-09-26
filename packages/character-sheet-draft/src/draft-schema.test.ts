import { describe, expect, it } from "vitest";
import type {
  DraftField,
  DraftSection,
  DraftPlacement,
  DraftValue,
} from "./draft-schema";
import {
  CHARACTER_SHEET_DRAFT_VERSION,
  CharacterSheetDraftSchema,
  DraftError,
  LegacyCharacterSheetDraftSchema,
  LegacyCharacterSheetDraft,
  MAX_DRAFT_SURFACE_FIELDS,
  MAX_DRAFT_VALUES_FIELDS,
  MAX_DRAFT_SECTION_DEPTH,
  draftForwardCompatibility,
  migrateCharacterSheetDraftV1ToV2,
  parseCanonicalCharacterSheetDraft,
  validateDraft,
  buildDraftStructuralIndex,
  getChildren,
  getParent,
  getDepth,
  getSubtreeRange,
  walkStructure,
} from "./index";
import { makeDraft } from "./draft-fixture";

describe("character sheet draft schema", () => {
  it("accepts the fixture draft", () => {
    expect(() => validateDraft(makeDraft())).not.toThrow();
  });

  it("parses through the canonical schema", () => {
    const draft = makeDraft();
    expect(CharacterSheetDraftSchema.parse(draft).draftId).toBe("draft.abc123");
  });

  it("rejects a values key outside the surface", () => {
    expect(() =>
      validateDraft(makeDraft({ values: { ghost: 1 } as never })),
    ).toThrowError(DraftError);
    try {
      validateDraft(makeDraft({ values: { ghost: 1 } as never }));
      throw new Error("unreachable");
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError);
      expect((error as DraftError).code).toBe("invalid_draft");
    }
  });

  it("rejects duplicate field keys", () => {
    const draft = makeDraft();
    const first = draft.fields[0];
    if (first === undefined) {
      throw new Error("fixture expected a first field");
    }
    draft.fields.push({ ...first, locked: false });
    expect(() => validateDraft(draft)).toThrowError(/must be unique/);
  });

  it("rejects a zero or negative version", () => {
    expect(() => validateDraft(makeDraft({ version: 0 }))).toThrowError(
      DraftError,
    );
    expect(() => validateDraft(makeDraft({ baseVersion: 0 }))).toThrowError(
      DraftError,
    );
  });

  it("rejects an out-of-budget surface", () => {
    const draft = makeDraft();
    const repeated = draft.fields.map((field) => field.key);
    const extra = Array.from(
      { length: MAX_DRAFT_SURFACE_FIELDS - draft.fields.length + 1 },
      (_, index) => ({
        key: `extra.${index}`,
        label: `Extra ${index}`,
        type: "text" as const,
        locked: false,
      }),
    );
    draft.fields.push(...extra);
    expect(() => validateDraft(draft)).toThrowError(DraftError);
  });

  it("rejects an out-of-budget values record", () => {
    const draft = makeDraft();
    const values: Record<string, string> = {};
    for (let index = 0; index < MAX_DRAFT_VALUES_FIELDS + 1; index += 1) {
      values[`extra.${index}`] = "x";
    }
    draft.fields.push(
      ...Array.from({ length: MAX_DRAFT_VALUES_FIELDS + 1 }, (_, index) => ({
        key: `extra.${index}`,
        label: `Extra ${index}`,
        type: "text" as const,
        locked: false,
      })),
    );
    draft.values = values as never;
    expect(() => validateDraft(draft)).toThrowError(DraftError);
  });

  it("enforces the characterName mirror invariant", () => {
    expect(() =>
      validateDraft(makeDraft({ characterName: "Someone Else" })),
    ).toThrowError(/must mirror/);
  });

  it("accepts a draft without a character_name value", () => {
    const draft = makeDraft();
    delete draft.values.character_name;
    draft.characterName = null;
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("rejects a non-string character_name value", () => {
    const draft = makeDraft();
    draft.values = { ...draft.values, character_name: 7 } as never;
    expect(() => validateDraft(draft)).toThrowError(/must be a string/);
  });

  it("rejects a choice field without options", () => {
    const draft = makeDraft();
    draft.fields = [
      { key: "flaw", label: "Flaw", type: "choice", locked: false },
    ];
    draft.values = {};
    draft.mode = "npc";
    expect(() => validateDraft(draft)).toThrowError(
      /A choice field must declare options/,
    );
  });

  it("rejects numeric bounds on a non-number field", () => {
    const draft = makeDraft();
    draft.fields = [
      {
        key: "strength",
        label: "Strength",
        type: "text",
        locked: false,
        min: 1,
      },
    ];
    draft.values = {};
    expect(() => validateDraft(draft)).toThrowError(
      /Only number fields may declare numeric bounds/,
    );
  });

  it("rejects a number field whose min exceeds max", () => {
    const draft = makeDraft();
    draft.fields = [
      {
        key: "strength",
        label: "Strength",
        type: "number",
        locked: false,
        min: 20,
        max: 1,
      },
    ];
    draft.values = {};
    expect(() => validateDraft(draft)).toThrowError(/min cannot exceed/);
  });

  it("accepts arbitrary nested section groupings and list values", () => {
    const draft = makeDraft();
    draft.fields.push({
      key: "backgrounds",
      label: "Backgrounds",
      type: "list",
      locked: false,
    });
    draft.sections = [
      { key: "attributes", title: "Attributes" },
      { key: "physical", title: "Physical" },
      { key: "details", title: "Details" },
    ];
    draft.structure = [
      { kind: "section", key: "attributes", parentKey: null },
      { kind: "section", key: "physical", parentKey: "attributes" },
      { kind: "field", key: draft.fields[0]!.key, parentKey: "physical" },
      { kind: "section", key: "details", parentKey: null },
      { kind: "field", key: "backgrounds", parentKey: "details" },
    ];
    draft.values.backgrounds = ["One", "Two"];
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("rejects section cycles and repeated field membership", () => {
    const draft = makeDraft();
    draft.sections = [
      { key: "one", title: "One" },
      { key: "two", title: "Two" },
    ];
    draft.structure = [
      { kind: "section", key: "one", parentKey: "two" },
      { kind: "section", key: "two", parentKey: "one" },
      { kind: "field", key: "character_name", parentKey: "one" },
      { kind: "field", key: "character_name", parentKey: "two" },
    ];
    expect(() => validateDraft(draft)).toThrowError(
      /invalid parent hierarchy/,
    );
  });

  it("rejects unsafe session and draft identities", () => {
    for (const identity of [
      { sessionId: ".." },
      { sessionId: "a/b" },
      { draftId: "a\\b" },
      { draftId: "" },
    ]) {
      expect(() => validateDraft(makeDraft(identity))).toThrowError(DraftError);
    }
  });

  it("rejects unsafe field keys", () => {
    const draft = makeDraft();
    draft.fields = [
      { key: "not/ok", label: "Nope", type: "text", locked: false },
    ];
    draft.values = {};
    expect(() => validateDraft(draft)).toThrowError(/safe canonical keys/);
  });

  it("reports the current forward-compatibility policy", () => {
    const policy = draftForwardCompatibility(makeDraft());
    expect(policy.current).toBe(true);
    expect(policy.schemaVersion).toBe(CHARACTER_SHEET_DRAFT_VERSION);
    expect(policy.systemAgnostic).toBe(true);
    expect(policy.allExportableSystems).toBe(true);
    expect(policy.boundedKeys).toBe(true);
  });
});

describe("character sheet draft V2 schema", () => {
  type V2DraftOverrides = Partial<{
    fields: DraftField[];
    sections: DraftSection[];
    structure: DraftPlacement[];
    values: Record<string, DraftValue>;
  }>;
  function makeV2Draft(overrides: V2DraftOverrides = {}) {
    const base = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc" as const,
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "character_name", label: "Name", type: "text" as const, locked: false },
        { key: "str", label: "Strength", type: "number" as const, locked: false, min: 1, max: 20 },
        { key: "dex", label: "Dexterity", type: "number" as const, locked: false, min: 1, max: 20 },
      ],
      sections: [
        { key: "attributes", title: "Attributes" },
        { key: "social", title: "Social" },
      ],
      structure: [
        { kind: "section" as const, key: "attributes", parentKey: null },
        { kind: "field" as const, key: "str", parentKey: "attributes" },
        { kind: "field" as const, key: "dex", parentKey: "attributes" },
        { kind: "section" as const, key: "social", parentKey: null },
        { kind: "field" as const, key: "cha", parentKey: "social" },
        { kind: "field" as const, key: "character_name", parentKey: null },
      ],
      values: { character_name: "Test", str: 10, dex: 12 },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    return {
      ...base,
      ...overrides,
      schemaVersion: "2" as const,
    };
  }

  it("accepts a valid V2 draft with only root fields", () => {
    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "name", label: "Name", type: "text" as const, locked: false },
      ],
      sections: [],
      structure: [
        { kind: "field" as const, key: "name", parentKey: null },
      ],
      values: { name: "Test" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("accepts a valid V2 draft with only root sections", () => {
    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "name", label: "Name", type: "text" as const, locked: false },
        { key: "str", label: "Strength", type: "number" as const, min: 1, max: 20, locked: false },
      ],
      sections: [
        { key: "attributes", title: "Attributes" },
      ],
      structure: [
        { kind: "section" as const, key: "attributes", parentKey: null },
        { kind: "field" as const, key: "str", parentKey: "attributes" },
        { kind: "field" as const, key: "character_name", parentKey: null },
      ],
      values: { character_name: "Test", str: 10 },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("accepts mixed root ordering: Field -> Section -> Field -> Section", () => {
    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "a", label: "A", type: "text" as const, locked: false },
        { key: "b", label: "B", type: "text" as const, locked: false },
        { key: "c", label: "C", type: "text" as const, locked: false },
      ],
      sections: [
        { key: "x", title: "X" },
        { key: "y", title: "Y" },
      ],
      structure: [
        { kind: "field" as const, key: "a", parentKey: null },
        { kind: "section" as const, key: "x", parentKey: null },
        { kind: "field" as const, key: "b", parentKey: null },
        { kind: "section" as const, key: "y", parentKey: null },
        { kind: "field" as const, key: "c", parentKey: null },
      ],
      values: { a: "A", b: "B", c: "C" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("accepts nested mixed children (Field -> Section -> Field)", () => {
    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "a", label: "A", type: "text" as const, locked: false },
        { key: "b", label: "B", type: "text" as const, locked: false },
        { key: "c", label: "C", type: "text" as const, locked: false },
      ],
      sections: [
        { key: "x", title: "X" },
        { key: "y", title: "Y", parentKey: "x" },
      ],
      structure: [
        { kind: "section" as const, key: "x", parentKey: null },
        { kind: "field" as const, key: "a", parentKey: "x" },
        { kind: "section" as const, key: "y", parentKey: "x" },
        { kind: "field" as const, key: "b", parentKey: "y" },
        { kind: "field" as const, key: "c", parentKey: "x" },
      ],
      values: { a: "A", b: "B", c: "C" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("accepts depth at maximum allowed (12)", () => {
    const fields: DraftField[] = [];
    const sections: DraftSection[] = [];
    const structure: DraftPlacement[] = [];

    let currentParent: string | null = null;
    for (let i = 0; i < 12; i++) {
      const key = `level${i}`;
      sections.push({ key, title: `Level ${i}` });
      structure.push({ kind: "section" as const, key, parentKey: currentParent });
      currentParent = key;
    }
    // Add a field at max depth
    structure.push({ kind: "field" as const, key: "deep", parentKey: currentParent });

    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [{ key: "name", label: "Name", type: "text" as const, locked: false }],
      sections,
      structure,
      values: { name: "Test" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).not.toThrow();
  });

  it("rejects a field missing from structure", () => {
    const draft = makeV2Draft({ fields: [
      { key: "a", label: "A", type: "text" as const, locked: false },
      { key: "b", label: "B", type: "text" as const, locked: false },
    ]});
    draft.structure = draft.structure.filter(p => p.key !== "b");
    expect(() => validateDraft(draft)).toThrowError(/Every field must have exactly one placement/);
  });

  it("rejects a section missing from structure", () => {
    const draft = makeV2Draft({ sections: [
      { key: "a", title: "A" },
      { key: "b", title: "B" },
    ]});
    draft.structure = draft.structure.filter(p => p.key !== "b" || p.kind !== "section");
    expect(() => validateDraft(draft)).toThrowError(/Every section must have exactly one placement/);
  });

  it("rejects duplicate placements", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "field", key: "str", parentKey: "attributes" });
    expect(() => validateDraft(draft)).toThrowError(/Duplicate placement/);
  });

  it("rejects placement referencing missing field", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "field", key: "ghost", parentKey: "attributes" });
    expect(() => validateDraft(draft)).toThrowError(/references unknown field/);
  });

  it("rejects placement referencing missing section", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "section", key: "ghost", parentKey: "attributes" });
    expect(() => validateDraft(draft)).toThrowError(/references unknown section/);
  });

  it("rejects field placement key resolving to section", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "field", key: "attributes", parentKey: null });
    expect(() => validateDraft(draft)).toThrowError(/field placement key resolves to Section/);
  });

  it("rejects section placement key resolving to field", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "section", key: "str", parentKey: null });
    expect(() => validateDraft(draft)).toThrowError(/section placement key resolves to Field/);
  });

  it("rejects parent referencing field", () => {
    const draft = makeV2Draft();
    draft.structure.push({ kind: "section", key: "ghost", parentKey: "str" });
    expect(() => validateDraft(draft)).toThrowError(/parentKey must NEVER reference a Field/);
  });

  it("rejects self-parent", () => {
    const draft = makeV2Draft({ sections: [{ key: "a", title: "A" }] });
    draft.structure.push({ kind: "section", key: "a", parentKey: "a" });
    expect(() => validateDraft(draft)).toThrowError(/cannot parent itself/);
  });

  it("rejects cycle", () => {
    const draft = makeV2Draft({ sections: [
      { key: "a", title: "A" },
      { key: "b", title: "B" },
    ]});
    draft.structure = [
      { kind: "section", key: "a", parentKey: "b" },
      { kind: "section", key: "b", parentKey: "a" },
    ];
    expect(() => validateDraft(draft)).toThrowError(/cycle|invalid parent hierarchy/);
  });

  it("rejects depth > 12", () => {
    const sections: DraftSection[] = [];
    const structure: DraftPlacement[] = [];
    let parent: string | null = null;
    for (let i = 0; i < 13; i++) {
      const key = `level${i}`;
      structure.push({ kind: "section", key, parentKey: parent });
      parent = key;
    }
    const draft = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc" as const,
      characterName: "Test",
      rulesContextId: null,
      fields: [{ key: "name", label: "Name", type: "text" as const, locked: false }],
      sections: structure.filter(s => s.kind === "section").map(s => ({ key: s.key, title: s.key })),
      structure,
      values: { name: "Test" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    expect(() => validateDraft(draft)).toThrowError(/exceeds maximum depth/);
  });

  it("rejects descendant before parent", () => {
    const draft = makeV2Draft();
    draft.structure = [
      { kind: "field", key: "str", parentKey: "attributes" },
      { kind: "section", key: "attributes", parentKey: null },
    ];
    expect(() => validateDraft(draft)).toThrowError(/Parent placement appears before every descendant/);
  });

  it("rejects broken/non-contiguous subtree", () => {
    const draft = makeV2Draft({ sections: [
      { key: "a", title: "A" },
      { key: "b", title: "B" },
    ]});
    // Structure: A -> (field in A) -> B -> (field in A again) -> (field in B)
    // This breaks contiguity of A's subtree
    draft.structure = [
      { kind: "section", key: "a", parentKey: null },
      { kind: "field", key: "f1", parentKey: "a" },
      { kind: "section", key: "b", parentKey: null },
      { kind: "field", key: "f2", parentKey: "a" }, // Breaks contiguity
      { kind: "field", key: "f3", parentKey: "b" },
    ];
    expect(() => validateDraft(draft)).toThrowError(/non-contiguous/);
  });

  it("rejects duplicate field/section key collision", () => {
    const draft = makeV2Draft({ sections: [{ key: "a", title: "A" }] });
    draft.fields.push({ key: "a", label: "A", type: "text" as const, locked: false });
    expect(() => validateDraft(draft)).toThrowError(/Keys are globally unique/);
  });

  it("rejects values referencing missing field", () => {
    const draft = makeV2Draft();
    (draft.values as Record<string, DraftValue>).ghost = "value";
    expect(() => validateDraft(draft)).toThrowError(/values reference unknown key/);
  });
});

describe("V1 -> V2 migration", () => {
  function makeLegacyDraft(overrides: Partial<LegacyCharacterSheetDraft> = {}): LegacyCharacterSheetDraft {
    return {
      schemaVersion: "1",
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc",
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "character_name", label: "Name", type: "text", locked: false },
        { key: "str", label: "Strength", type: "number", min: 1, max: 20, locked: false },
        { key: "dex", label: "Dexterity", type: "number", min: 1, max: 20, locked: false },
      ],
      sections: [
        { key: "attributes", title: "Attributes", fieldKeys: ["str", "dex"] },
        { key: "social", title: "Social", fieldKeys: ["cha"] },
      ],
      values: { character_name: "Test", str: 10, dex: 12, cha: 14 },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
      ...overrides,
    };
  }

  it("migrates simple V1 to V2", () => {
    const legacy = makeLegacyDraft();
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    expect(v2.schemaVersion).toBe("2");
    expect(v2.fields).toEqual(legacy.fields);
    expect(v2.values).toEqual(legacy.values);
    expect(v2.sections).toEqual([
      { key: "attributes", title: "Attributes" },
      { key: "social", title: "Social" },
    ]);
  });

  it("migrates nested V1 sections", () => {
    const legacy = makeLegacyDraft({
      sections: [
        { key: "attributes", title: "Attributes", fieldKeys: ["str"] },
        { key: "physical", title: "Physical", parentKey: "attributes", fieldKeys: ["str"] },
      ],
    });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    const sectionPlacements = v2.structure.filter(p => p.kind === "section");
    expect(sectionPlacements.map(p => p.key)).toEqual(["attributes", "physical"]);
    expect(sectionPlacements.find(p => p.key === "physical")?.parentKey).toBe("attributes");
  });

  it("preserves fieldKeys order", () => {
    const legacy = makeLegacyDraft({
      sections: [{ key: "attrs", title: "Attrs", fieldKeys: ["str", "dex"] }],
    });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    const fieldPlacements = v2.structure.filter(p => p.kind === "field" && p.parentKey === "attrs");
    expect(fieldPlacements.map(p => p.key)).toEqual(["str", "dex"]);
  });

  it("preserves child Section order", () => {
    const legacy = makeLegacyDraft({
      sections: [
        { key: "attrs", title: "Attrs", fieldKeys: [] },
        { key: "physical", title: "Physical", parentKey: "attrs", fieldKeys: [] },
        { key: "social", title: "Social", parentKey: "attrs", fieldKeys: [] },
      ],
    });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    const children = v2.structure.filter(p => p.kind === "section" && p.parentKey === "attrs");
    expect(children.map(p => p.key)).toEqual(["physical", "social"]);
  });

  it("root Sections precede unassigned root Fields", () => {
    const legacy = makeLegacyDraft({
      sections: [{ key: "attrs", title: "Attrs", fieldKeys: ["str"] }],
    });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    const rootPlacements = v2.structure.filter(p => p.parentKey === null);
    const rootSectionIndices = rootPlacements
      .filter(p => p.kind === "section")
      .map(p => v2.structure.indexOf(p));
    const rootFieldIndices = rootPlacements
      .filter(p => p.kind === "field")
      .map(p => v2.structure.indexOf(p));
    // All root sections should come before root fields
    expect(Math.max(...rootSectionIndices)).toBeLessThan(Math.min(...rootFieldIndices));
  });

  it("preserves fields[] content", () => {
    const legacy = makeLegacyDraft();
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    expect(v2.fields).toEqual(legacy.fields);
  });

  it("preserves values", () => {
    const legacy = makeLegacyDraft({ values: { custom: "value" } });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    expect(v2.values).toEqual(legacy.values);
  });

  it("preserves metadata/version/source", () => {
    const legacy = makeLegacyDraft({
      baseVersion: 5,
      version: 10,
      mode: "npc",
      characterName: "Hero",
      rulesContextId: "ctx-123",
      source: { sourceSheetId: "sheet-1", sourceRunId: "run-456" },
    });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    expect(v2.baseVersion).toBe(5);
    expect(v2.version).toBe(10);
    expect(v2.mode).toBe("npc");
    expect(v2.characterName).toBe("Hero");
    expect(v2.rulesContextId).toBe("ctx-123");
    expect(v2.source).toEqual(legacy.source);
  });

  it("confirmed V1 migrates to confirmed V2 in memory", () => {
    const legacy = makeLegacyDraft({ confirmed: true });
    const v2 = migrateCharacterSheetDraftV1ToV2(legacy);
    expect(v2.confirmed).toBe(true);
  });

  it("rejects invalid V1", () => {
    const invalid = { schemaVersion: "1", draftId: "x" };
    expect(() => migrateCharacterSheetDraftV1ToV2(invalid as any)).toThrowError();
  });
});

describe("canonical parser", () => {
  it("returns V2 unchanged", () => {
    const v2 = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc" as const,
      characterName: "Test",
      rulesContextId: null,
      fields: [{ key: "name", label: "Name", type: "text" as const, locked: false }],
      sections: [],
      structure: [{ kind: "field" as const, key: "name", parentKey: null }],
      values: { name: "Test" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    const result = parseCanonicalCharacterSheetDraft(v2);
    expect(result).toEqual(v2);
  });

  it("migrates V1 to V2", () => {
    const v1 = {
      schemaVersion: "1" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc" as const,
      characterName: "Test",
      rulesContextId: null,
      fields: [{ key: "name", label: "Name", type: "text" as const, locked: false }],
      sections: [],
      values: { name: "Test" },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    const result = parseCanonicalCharacterSheetDraft(v1);
    expect(result.schemaVersion).toBe("2");
    expect(result.structure).toEqual([{ kind: "field", key: "name", parentKey: null }]);
  });

  it("rejects unsupported schema version", () => {
    const invalid = { schemaVersion: "3" as const };
    expect(() => parseCanonicalCharacterSheetDraft(invalid)).toThrowError(/neither a valid V1 nor V2/);
  });
});

describe("derived structural index", () => {
  type V2DraftOverrides = Partial<{
    fields: DraftField[];
    sections: DraftSection[];
    structure: DraftPlacement[];
    values: Record<string, DraftValue>;
  }>;
  function makeV2Draft(overrides: V2DraftOverrides = {}) {
    const base = {
      schemaVersion: "2" as const,
      draftId: "draft.test",
      sessionId: "session.test",
      baseVersion: 1,
      version: 1,
      mode: "pc" as const,
      characterName: "Test",
      rulesContextId: null,
      fields: [
        { key: "character_name", label: "Name", type: "text" as const, locked: false },
        { key: "str", label: "Strength", type: "number" as const, locked: false, min: 0, max: 20 },
        { key: "dex", label: "Dexterity", type: "number" as const, locked: false, min: 0, max: 20 },
      ],
      sections: [
        { key: "attributes", title: "Attributes" },
        { key: "social", title: "Social" },
      ],
      structure: [
        { kind: "section" as const, key: "attributes", parentKey: null },
        { kind: "field" as const, key: "str", parentKey: "attributes" },
        { kind: "field" as const, key: "dex", parentKey: "attributes" },
        { kind: "section" as const, key: "social", parentKey: null },
        { kind: "field" as const, key: "cha", parentKey: "social" },
        { kind: "field" as const, key: "character_name", parentKey: null },
      ],
      values: { character_name: "Test", str: 10, dex: 12 },
      source: { sourceSheetId: null, sourceRunId: null },
      confirmed: false,
    };
    return { ...base, ...overrides };
  }

  it("builds placementByKey", () => {
    const draft = makeV2Draft();
    const index = buildDraftStructuralIndex(draft);
    expect(index.placementByKey.has("section:attributes")).toBe(true);
    expect(index.placementByKey.get("field:str")?.parentKey).toBe("attributes");
  });

  it("childrenByParent preserves structure order", () => {
    const draft = makeV2Draft();
    const index = buildDraftStructuralIndex(draft);
    const rootChildren = index.childrenByParent.get(null);
    expect(rootChildren?.map(p => p.key)).toEqual(["attributes", "social", "character_name"]);
  });

  it("correct parents", () => {
    const draft = makeV2Draft();
    const index = buildDraftStructuralIndex(draft);
    expect(index.parentByKey.get("str")).toBe("attributes");
    expect(index.parentByKey.get("attributes")).toBe(null);
  });

  it("correct depth", () => {
    const draft = makeV2Draft();
    const index = buildDraftStructuralIndex(draft);
    expect(index.depthByKey.get("attributes")).toBe(0);
    expect(index.depthByKey.get("str")).toBe(1);
    expect(index.depthByKey.get("cha")).toBe(1); // social is at root, cha is child of social
  });

  it("subtree ranges are correct", () => {
    const draft = makeV2Draft();
    const index = buildDraftStructuralIndex(draft);
    const attrsRange = index.subtreeRange.get("attributes");
    expect(attrsRange).toBeDefined();
    // attributes at index 1, its children at 2,3, so range [1, 4)
    expect(attrsRange?.start).toBe(1);
    expect(attrsRange?.end).toBe(4);
  });

  it("traversal equals canonical preorder", () => {
    const draft = makeV2Draft();
    const traversal = Array.from(walkStructure(draft));
    expect(traversal.map(t => t.placement)).toEqual(draft.structure);
  });

  it("getChildren preserves structure order", () => {
    const draft = makeV2Draft();
    const attrsChildren = getChildren(draft, "attributes");
    expect(attrsChildren.map(p => p.key)).toEqual(["str", "dex"]);
  });

  it("getParent returns correct parent", () => {
    const draft = makeV2Draft();
    expect(getParent(draft, "attributes")).toBe(null);
    expect(getParent(draft, "str")).toBe("attributes");
  });

  it("getDepth returns correct depth", () => {
    const draft = makeV2Draft();
    expect(getDepth(draft, "attributes")).toBe(0);
    expect(getDepth(draft, "str")).toBe(1);
  });

  it("getSubtreeRange returns correct range", () => {
    const draft = makeV2Draft();
    const range = getSubtreeRange(draft, "attributes");
    expect(range).toEqual({ start: 1, end: 4 });
    expect(getSubtreeRange(draft, "social")).toEqual({ start: 4, end: 6 });
    expect(getSubtreeRange(draft, "nonexistent")).toBeNull();
  });

  it("walkStructure yields correct order and depth", () => {
    const draft = makeV2Draft();
    const walked = Array.from(walkStructure(draft));
    expect(walked.map(w => w.placement)).toEqual(draft.structure);
    expect(walked.find(w => w.placement.key === "attributes")?.depth).toBe(0);
    expect(walked.find(w => w.placement.key === "str")?.depth).toBe(1);
  });
});
