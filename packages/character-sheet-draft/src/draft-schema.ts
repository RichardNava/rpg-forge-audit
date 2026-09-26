import { z } from "zod";
import { draftError } from "./errors";

export const CHARACTER_SHEET_DRAFT_VERSION = "2" as const;

/** A draft surface holds at most the generation pipeline's field budget. */
export const MAX_DRAFT_SURFACE_FIELDS = 192;
/** A draft may carry at most as many values as surface fields. */
export const MAX_DRAFT_VALUES_FIELDS = 192;
export const MAX_DRAFT_FIELD_KEY_CHARS = 128;
export const MAX_DRAFT_FIELD_LABEL_CHARS = 256;
export const MAX_DRAFT_TEXT_VALUE_CHARS = 2_000;
export const MAX_DRAFT_CHOICE_OPTIONS = 24;
export const MAX_DRAFT_CHOICE_OPTION_CHARS = 128;
export const MAX_DRAFT_SOURCE_ID_CHARS = 128;
export const MAX_DRAFT_SECTIONS = 48;
export const MAX_DRAFT_SECTION_DEPTH = 12;
export const MAX_DRAFT_LIST_ITEMS = 100;

/**
 * Draft keys are always generation canonical keys, which are also safe field
 * ids. Keeping them on the `FieldIdSchema` alphabet (letters, digits, `.`,
 * `_`, `:`, `-`) makes every draft key a valid `CharacterSheetSpec` field id
 * and a path-safe R2 segment at the same time, with no transformation.
 */
const draftKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** Opaque, path-safe identity segment rules mirroring the artifact keys policy. */
const draftIdentitySchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      !value.includes("/") && !value.includes("\\") && !value.includes(".."),
    "Draft identities must be single path-safe segments.",
  );

export const DraftIdentitySchema = draftIdentitySchema;
export type DraftIdentity = z.infer<typeof DraftIdentitySchema>;

export const DraftFieldTypeSchema = z.enum([
  "text",
  "number",
  "textarea",
  "checkbox",
  "choice",
  "list",
]);
export type DraftFieldType = z.infer<typeof DraftFieldTypeSchema>;

export const DraftValueSchema = z.union([
  z.string().max(MAX_DRAFT_TEXT_VALUE_CHARS),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z
    .array(z.string().min(1).max(MAX_DRAFT_TEXT_VALUE_CHARS))
    .min(1)
    .max(MAX_DRAFT_LIST_ITEMS),
]);
export type DraftValue = z.infer<typeof DraftValueSchema>;

export const DraftFieldSchema = z
  .strictObject({
    key: z
      .string()
      .min(1)
      .max(MAX_DRAFT_FIELD_KEY_CHARS)
      .regex(draftKeyPattern, "Draft keys must use safe canonical keys."),
    label: z.string().min(1).max(MAX_DRAFT_FIELD_LABEL_CHARS).regex(/\S/),
    type: DraftFieldTypeSchema,
    locked: z.boolean(),
    options: z
      .array(z.string().min(1).max(MAX_DRAFT_CHOICE_OPTION_CHARS).regex(/\S/))
      .min(1)
      .max(MAX_DRAFT_CHOICE_OPTIONS)
      .optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .superRefine((field, context) => {
    if (field.type === "choice") {
      if (field.options === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A choice field must declare options.",
        });
      }
      if (field.min !== undefined || field.max !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A choice field cannot declare numeric bounds.",
        });
      }
    } else if (field.options !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only choice fields may declare options.",
      });
    }
    if (field.type === "number") {
      if (
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A number field min cannot exceed its max.",
        });
      }
    } else if (field.min !== undefined || field.max !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only number fields may declare numeric bounds.",
      });
    }
  });
export type DraftField = z.infer<typeof DraftFieldSchema>;

/** A system-agnostic visual grouping. Parent links preserve arbitrary sheet hierarchy. */
export const DraftSectionSchema = z.strictObject({
  key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern),
  title: z.string().min(1).max(MAX_DRAFT_FIELD_LABEL_CHARS).regex(/\S/),
});
export type DraftSection = z.infer<typeof DraftSectionSchema>;

export const DraftPlacementKindSchema = z.enum(["field", "section"]);

export const DraftPlacementSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern),
    parentKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern).nullable(),
  }),
  z.strictObject({
    kind: z.literal("section"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern),
    parentKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern).nullable(),
  }),
]);
export type DraftPlacement = z.infer<typeof DraftPlacementSchema>;

export const DraftSourceSchema = z.strictObject({
  sourceSheetId: z.string().max(MAX_DRAFT_SOURCE_ID_CHARS).nullable(),
  sourceRunId: z.string().max(MAX_DRAFT_SOURCE_ID_CHARS).nullable(),
});
export type DraftSource = z.infer<typeof DraftSourceSchema>;

/**
 * Serializable character-sheet draft snapshot. A draft is a bounded surface
 * model, never a full `CharacterSheetSpec`: it carries the editable field
 * roster, typed values, reroll ownership flags (read locks), and provenance
 * back to the generated run it was created from. `characterName` is a derived
 * display convenience and always equals `values["character_name"] ?? null`.
 */
export const CharacterSheetDraftSchema = z
  .strictObject({
    schemaVersion: z.literal(CHARACTER_SHEET_DRAFT_VERSION),
    draftId: DraftIdentitySchema,
    sessionId: DraftIdentitySchema,
    baseVersion: z.number().int().min(1),
    version: z.number().int().min(1),
    mode: z.enum(["pc", "npc"]),
    characterName: z.string().max(256).nullable(),
    rulesContextId: z.string().max(128).nullable(),
    fields: z.array(DraftFieldSchema).min(1).max(MAX_DRAFT_SURFACE_FIELDS),
    sections: z.array(DraftSectionSchema).max(MAX_DRAFT_SECTIONS).optional(),
    structure: z.array(DraftPlacementSchema),
    values: z
      .record(z.string(), DraftValueSchema)
      .superRefine((value, context) => {
        if (Object.keys(value).length > MAX_DRAFT_VALUES_FIELDS) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A draft may carry at most ${MAX_DRAFT_VALUES_FIELDS} values.`,
          });
        }
      }),
    source: DraftSourceSchema,
    confirmed: z.boolean().default(false),
  })
  .superRefine((draft, context) => {
    const keys = draft.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Draft field keys must be unique.",
      });
    }
    const fieldKeys = new Set(keys);
    const sections = draft.sections ?? [];
    const sectionKeys = new Set(sections.map((section) => section.key));
    if (sectionKeys.size !== sections.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Draft section keys must be unique.",
      });
    }
    // Structure validation
    const structure = draft.structure ?? [];
    const placementKeys = new Set<string>();

    for (const placement of structure) {
      const compositeKey = `${placement.kind}:${placement.key}`;
      if (placementKeys.has(compositeKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate placement for ${placement.kind} "${placement.key}".`,
        });
      }
      placementKeys.add(compositeKey);

if (placement.kind === "field") {
        if (!fieldKeys.has(placement.key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field placement references unknown field "${placement.key}".`,
          });
        }
      } else {
        if (!sectionKeys.has(placement.key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section placement references unknown section "${placement.key}".`,
          });
        }
      }

      if (placement.parentKey !== null) {
        if (!sectionKeys.has(placement.parentKey)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Placement for ${placement.kind} "${placement.key}" references unknown parent section "${placement.parentKey}".`,
          });
        }
        if (placement.parentKey === placement.key) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Node "${placement.key}" cannot parent itself.`,
          });
        }
      }
    }

    // Cycle detection and depth validation
    const parentMap = new Map<string, string | null>();
    for (const placement of structure) {
      if (placement.kind === "section") {
        parentMap.set(placement.key, placement.parentKey);
      }
    }

    for (const section of sections) {
      let depth = 0;
      let current = parentMap.get(section.key);
      const visited = new Set<string>([section.key]);
      while (current !== null && current !== undefined) {
        if (visited.has(current) || depth >= MAX_DRAFT_SECTION_DEPTH) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section "${section.key}" has an invalid parent hierarchy.`,
          });
          break;
        }
        visited.add(current);
        current = parentMap.get(current);
        depth += 1;
      }
      if (depth > MAX_DRAFT_SECTION_DEPTH) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section "${section.key}" exceeds maximum depth of ${MAX_DRAFT_SECTION_DEPTH}.`,
        });
      }
    }

    // Verify preorder and contiguous subtrees
    const expectedOrder = computeExpectedPreorder(draft);
    if (JSON.stringify(expectedOrder) !== JSON.stringify(structure)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Structure array is not in valid preorder or has non-contiguous subtrees.",
      });
    }

    // Ensure every field and section has exactly one placement
    const fieldPlacements = structure.filter((p) => p.kind === "field");
    const sectionPlacements = structure.filter((p) => p.kind === "section");
    if (fieldPlacements.length !== draft.fields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every field must have exactly one placement.",
      });
    }
    if (sectionPlacements.length !== sections.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every section must have exactly one placement.",
      });
    }

    for (const entry of Object.keys(draft.values)) {
      if (!fieldKeys.has(entry)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Draft values reference unknown key "${entry}".`,
        });
      }
    }
    const nameValue =
      draft.values["character_name"] === undefined
        ? null
        : draft.values["character_name"];
    if (nameValue !== null && typeof nameValue !== "string") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The character_name value must be a string or null.",
      });
    } else if (draft.characterName !== nameValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "characterName must mirror the character_name value.",
      });
    }
  });
export type CharacterSheetDraft = z.infer<typeof CharacterSheetDraftSchema>;

/**
 * Computes the expected preorder traversal from the content registries and structure.
 * Used for validation that structure[] is in valid preorder with contiguous subtrees.
 */
function computeExpectedPreorder(draft: CharacterSheetDraft): DraftPlacement[] {
  const result: DraftPlacement[] = [];
  const structure = draft.structure ?? [];

  // Build children map from structure
  const childrenByParent = new Map<string | null, DraftPlacement[]>();
  for (const placement of draft.structure ?? []) {
    const parentKey = placement.parentKey ?? null;
    if (!childrenByParent.has(placement.parentKey)) {
      childrenByParent.set(placement.parentKey, []);
    }
    childrenByParent.get(placement.parentKey)!.push(placement);
  }

  function visit(parentKey: string | null) {
    const children = childrenByParent.get(parentKey) ?? [];
    for (const child of children) {
      result.push(child);
      if (child.kind === "section") {
        visit(child.key);
      }
    }
  }

  visit(null);
  return result;
}

/**
 * Legacy V1 types for compatibility
 */
export const LegacyDraftSectionSchema = z.strictObject({
  key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern),
  title: z.string().min(1).max(MAX_DRAFT_FIELD_LABEL_CHARS).regex(/\S/),
  parentKey: z
    .string()
    .min(1)
    .max(MAX_DRAFT_FIELD_KEY_CHARS)
    .regex(draftKeyPattern)
    .optional(),
  fieldKeys: z
    .array(
      z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).regex(draftKeyPattern),
    )
    .max(MAX_DRAFT_SURFACE_FIELDS),
});
export type LegacyDraftSection = z.infer<typeof LegacyDraftSectionSchema>;

export const LegacyCharacterSheetDraftSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    draftId: DraftIdentitySchema,
    sessionId: DraftIdentitySchema,
    baseVersion: z.number().int().min(1),
    version: z.number().int().min(1),
    mode: z.enum(["pc", "npc"]),
    characterName: z.string().max(256).nullable(),
    rulesContextId: z.string().max(128).nullable(),
    fields: z.array(DraftFieldSchema).min(1).max(MAX_DRAFT_SURFACE_FIELDS),
    sections: z.array(LegacyDraftSectionSchema).max(MAX_DRAFT_SECTIONS).optional(),
    values: z
      .record(z.string(), DraftValueSchema)
      .superRefine((value, context) => {
        if (Object.keys(value).length > MAX_DRAFT_VALUES_FIELDS) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A draft may carry at most ${MAX_DRAFT_VALUES_FIELDS} values.`,
          });
        }
      }),
    source: DraftSourceSchema,
    confirmed: z.boolean().default(false),
  });
export type LegacyCharacterSheetDraft = z.infer<typeof LegacyCharacterSheetDraftSchema>;

/**
 * Migrates a legacy V1 draft to the canonical V2 format.
 * Preserves the exact visible ordering from the V1 format.
 */
export function migrateCharacterSheetDraftV1ToV2(
  legacy: LegacyCharacterSheetDraft
): CharacterSheetDraft {
  const sections = legacy.sections ?? [];
  const sectionMap = new Map(sections.map((s) => [s.key, s]));
  const assignedFields = new Set(sections.flatMap((s) => s.fieldKeys));

  const structure: DraftPlacement[] = [];

  function visitSection(sectionKey: string, parentKey: string | null) {
    const section = sectionMap.get(sectionKey);
    if (!section) return;

    // Emit the section itself
    result.push({ kind: "section", key: section.key, parentKey: section.parentKey ?? null });

    // Emit fields in this section (in fieldKeys order)
    for (const fieldKey of section.fieldKeys) {
      const field = legacy.fields.find((f) => f.key === fieldKey);
      if (field) {
        result.push({ kind: "field", key: fieldKey, parentKey: section.key });
      }
    }

    // Visit child sections in the order they appear in sections array
    const children = legacy.sections
      ?.filter((s) => s.parentKey === section.key)
      .sort((a, b) => legacy.sections!.indexOf(a) - legacy.sections!.indexOf(b));

    if (children) {
      for (const child of children) {
        visitSection(child.key, section.key);
      }
    }
  }

  const result: DraftPlacement[] = [];

  // Root sections in order
  const rootSections = legacy.sections
    ?.filter((s) => s.parentKey === undefined)
    .sort((a, b) => legacy.sections!.indexOf(a) - legacy.sections!.indexOf(b));

  if (rootSections) {
    for (const section of rootSections) {
      visitSection(section.key, null);
    }
  }

  // Unassigned fields at root (after all sections)
  const assignedFieldsRoot = new Set(
    (legacy.sections ?? []).flatMap((s) => s.fieldKeys)
  );
  for (const field of legacy.fields) {
    if (!assignedFieldsRoot.has(field.key)) {
      result.push({ kind: "field", key: field.key, parentKey: null });
    }
  }

  const migrated: CharacterSheetDraft = {
    schemaVersion: "2",
    draftId: legacy.draftId,
    sessionId: legacy.sessionId,
    baseVersion: legacy.baseVersion,
    version: legacy.version,
    mode: legacy.mode,
    characterName: legacy.characterName,
    rulesContextId: legacy.rulesContextId,
    fields: legacy.fields,
    sections: legacy.sections?.map((s) => ({
      key: s.key,
      title: s.title,
    })) ?? [],
    values: legacy.values,
    structure: result,
    source: legacy.source,
    confirmed: legacy.confirmed,
  };

  // Validate the migrated draft
  return validateDraft(migrated);
}

/**
 * Parses and validates a draft, accepting both V1 and V2 formats.
 * Returns a canonical V2 draft.
 */
export function parseCanonicalCharacterSheetDraft(
  input: unknown
): CharacterSheetDraft {
  // Try V2 first
  const v2Result = CharacterSheetDraftSchema.safeParse(input);
  if (v2Result.success) {
    return v2Result.data;
  }

  // Try V1
  const v1Result = LegacyCharacterSheetDraftSchema.safeParse(input);
  if (v1Result.success) {
    return migrateCharacterSheetDraftV1ToV2(v1Result.data);
  }

  throw draftError(
    "invalid_draft",
    "Input is neither a valid V1 nor V2 character sheet draft."
  );
}

/**
 * Validates a draft input, accepting both V1 and V2 formats.
 * Returns a canonical V2 draft.
 */
export function validateDraft(input: unknown): CharacterSheetDraft {
  return parseCanonicalCharacterSheetDraft(input);
}

/**
 * Policy record describing why every persisted draft version remains portable:
 * it is system-agnostic (no game system is embedded), every draft key is
 * bounded and safe, and the schema is the current serialization contract.
 */
export interface DraftForwardCompatibility {
  current: true;
  schemaVersion: typeof CHARACTER_SHEET_DRAFT_VERSION;
  systemAgnostic: true;
  allExportableSystems: true;
  boundedKeys: true;
}

export function draftForwardCompatibility(
  draft: CharacterSheetDraft,
): DraftForwardCompatibility {
  return {
    current: true,
    schemaVersion: draft.schemaVersion,
    systemAgnostic: true,
    allExportableSystems: true,
    boundedKeys: true,
  };
}