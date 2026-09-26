import { z } from "zod";
import type {
  CharacterSheetDraft,
  DraftField,
  DraftFieldType,
  DraftSection,
  DraftNodeRef,
  DraftValue,
} from "./draft-schema";
import {
  DraftFieldSchema,
  DraftNodeRefSchema,
  DraftSectionSchema,
  DraftValueSchema,
  MAX_DRAFT_FIELD_KEY_CHARS,
  MAX_DRAFT_SECTION_DEPTH,
  MAX_DRAFT_SURFACE_FIELDS,
} from "./draft-schema";
import { draftError } from "./errors";
import { assertDraftEditable } from "./finalize";
import { assertDraftFieldExists } from "./guided-edit";

export const DraftAddFieldSchema = z.strictObject({
  key: z
    .string()
    .min(1)
    .max(MAX_DRAFT_FIELD_KEY_CHARS)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
      "Field keys must use safe canonical keys.",
    ),
  label: z.string().min(1).max(256).regex(/\S/),
  type: z.enum(["text", "number", "textarea", "checkbox", "choice", "list"]),
  locked: z.boolean().default(false),
  options: z
    .array(z.string().min(1).max(128).regex(/\S/))
    .min(1)
    .max(24)
    .optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});
export type DraftAddField = z.infer<typeof DraftAddFieldSchema>;

const DraftFieldTypeChangeSchema = z.strictObject({
  key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
  type: z.enum(["text", "number", "textarea", "checkbox", "choice", "list"]),
  options: z
    .array(z.string().min(1).max(128).regex(/\S/))
    .min(1)
    .max(24)
    .optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});

const DraftFieldUpdateSchema = DraftFieldTypeChangeSchema.extend({
  label: z.string().min(1).max(256).regex(/\S/),
});

export const DraftMutationSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("place_node"),
    node: DraftNodeRefSchema,
    destination: z.strictObject({
      parent: z.union([z.strictObject({ kind: z.literal("root") }), z.strictObject({ kind: z.literal("section"), key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS) })]),
      before: DraftNodeRefSchema.nullable(),
    }),
  }),
  z.strictObject({ op: z.literal("remove_section"), key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS), strategy: z.literal("reject_if_nonempty") }),
  z.strictObject({
    op: z.literal("set_value"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    value: DraftValueSchema,
  }),
  z.strictObject({
    op: z.literal("set_field_label"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    label: z.string().min(1).max(256).regex(/\S/),
  }),
  z.strictObject({
    op: z.literal("set_field_type"),
    field: DraftFieldTypeChangeSchema,
  }),
  z.strictObject({ op: z.literal("update_field"), field: DraftFieldUpdateSchema }),
  z.strictObject({ op: z.literal("add_section"), section: DraftSectionSchema }),
  z.strictObject({
    op: z.literal("rename_section"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    title: z.string().min(1).max(256).regex(/\S/),
  }),
  z.strictObject({
    op: z.literal("move_field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    sectionKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
  }),
  z.strictObject({
    op: z.literal("place_field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    sectionKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
    beforeFieldKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
  }),
  z.strictObject({
    op: z.literal("reparent_section"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    parentKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
  }),
  z.strictObject({
    op: z.literal("place_section"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
    parentKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
    beforeSectionKey: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS).nullable(),
  }),
  z.strictObject({
    op: z.literal("clear_value"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
  }),
  z.strictObject({
    op: z.literal("lock_field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
  }),
  z.strictObject({
    op: z.literal("unlock_field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
  }),
  z.strictObject({
    op: z.literal("add_field"),
    field: DraftAddFieldSchema,
  }),
  z.strictObject({
    op: z.literal("remove_field"),
    key: z.string().min(1).max(MAX_DRAFT_FIELD_KEY_CHARS),
  }),
]);
export type DraftMutation = z.infer<typeof DraftMutationSchema>;

/**
 * Applies one typed mutation to an immutable draft snapshot and returns the
 * next snapshot. The mutation never mutates the input. The `characterName`
 * display convenience stays mirrored to `values["character_name"]`; a locked
 * field is read-only until the client explicitly unlocks it.
 */
export function applyDraftMutation(
  draft: CharacterSheetDraft,
  mutationInput: unknown,
): CharacterSheetDraft {
  assertDraftEditable(draft);
  const mutation = parseDraftMutation(mutationInput);

  switch (mutation.op) {
    case "place_node": {
      const sections = draft.sections ?? [];
      const sourceExists = mutation.node.kind === "field"
        ? draft.fields.some((field) => field.key === mutation.node.key)
        : sections.some((section) => section.key === mutation.node.key);
      if (!sourceExists) throw draftError("invalid_mutation", "The node does not exist.");
      const destinationParent = mutation.destination.parent.kind === "section" ? mutation.destination.parent.key : null;
      if (destinationParent !== null && !sections.some((section) => section.key === destinationParent)) throw draftError("invalid_mutation", "The destination section does not exist.");
      if (mutation.node.kind === "section" && destinationParent !== null) {
        if (mutation.node.key === destinationParent || descendantSectionKeys(mutation.node.key, sections).has(destinationParent)) throw draftError("invalid_mutation", "A section cannot be moved into its own descendant.");
      }
      const normalized = materializeOrders(draft);
      const sourceParent = parentForNode(normalized, mutation.node);
      const destination = orderedNodes(normalized, destinationParent).filter((ref) => !(ref.kind === mutation.node.kind && ref.key === mutation.node.key));
      if (mutation.destination.before !== null && !destination.some((ref) => ref.kind === mutation.destination.before!.kind && ref.key === mutation.destination.before!.key)) throw draftError("invalid_mutation", "The placement target is not in the destination.");
      const next = setOrderedNodes(normalized, sourceParent, orderedNodes(normalized, sourceParent).filter((ref) => !(ref.kind === mutation.node.kind && ref.key === mutation.node.key)));
      const insertAt = mutation.destination.before === null ? destination.length : destination.findIndex((ref) => ref.kind === mutation.destination.before!.kind && ref.key === mutation.destination.before!.key);
      const placed = setOrderedNodes(next, destinationParent, [...destination.slice(0, insertAt), mutation.node, ...destination.slice(insertAt)]);
      const updated = mutation.node.kind === "section" ? { ...placed, sections: (placed.sections ?? []).map((section) => section.key !== mutation.node.key ? section : destinationParent === null ? (({ parentKey: _parentKey, ...root }) => root)(section) : { ...section, parentKey: destinationParent }) } : placed;
      if (maxSectionDepth(updated.sections ?? []) > MAX_DRAFT_SECTION_DEPTH) throw draftError("invalid_mutation", "The section hierarchy exceeds the maximum depth.");
      return updated;
    }
    case "remove_section": {
      const sections = draft.sections ?? [];
      const section = sections.find((entry) => entry.key === mutation.key);
      if (section === undefined) throw draftError("invalid_mutation", "The section does not exist.");
      const childCount = sections.filter((entry) => entry.parentKey === section.key).length;
      if (section.fieldKeys.length > 0 || childCount > 0) throw draftError("invalid_mutation", `The section contains ${section.fieldKeys.length} fields and ${childCount} subsections.`);
      const normalized = materializeOrders(draft);
      const parent = parentForNode(normalized, { kind: "section", key: section.key });
      return { ...setOrderedNodes(normalized, parent, orderedNodes(normalized, parent).filter((ref) => !(ref.kind === "section" && ref.key === section.key))), sections: sections.filter((entry) => entry.key !== section.key) };
    }
    case "set_value": {
      const field = assertDraftFieldExists(draft, mutation.key);
      if (field.locked) {
        throw draftError(
          "field_read_locked",
          `Draft field "${field.key}" is read-locked; unlock it before editing.`,
        );
      }
      assertValueMatchesField(field, mutation.value);
      const values = { ...draft.values, [field.key]: mutation.value };
      return {
        ...draft,
        values,
        characterName: mirrorCharacterName(
          field,
          mutation.value,
          draft.characterName,
        ),
      };
    }
    case "clear_value": {
      const field = assertDraftFieldExists(draft, mutation.key);
      if (field.locked) {
        throw draftError(
          "field_read_locked",
          `Draft field "${field.key}" is read-locked; unlock it before clearing.`,
        );
      }
      const values = { ...draft.values };
      delete values[field.key];
      return {
        ...draft,
        values,
        characterName:
          field.key === "character_name" ? null : draft.characterName,
      };
    }
    case "set_field_label": {
      const field = assertDraftFieldExists(draft, mutation.key);
      return {
        ...draft,
        fields: draft.fields.map((entry) =>
          entry.key === field.key ? { ...entry, label: mutation.label } : entry,
        ),
      };
    }
    case "set_field_type": {
      const current = assertDraftFieldExists(draft, mutation.field.key);
      const replacement = fieldForTypeChange(current, mutation.field);
      const values = { ...draft.values };
      const currentValue = values[current.key];
      if (
        currentValue !== undefined &&
        !valueMatchesType(currentValue, replacement)
      ) {
        delete values[current.key];
      }
      return {
        ...draft,
        fields: draft.fields.map((entry) =>
          entry.key === current.key ? replacement : entry,
        ),
        values,
      };
    }
    case "update_field": {
      const current = assertDraftFieldExists(draft, mutation.field.key);
      const replacement = fieldForTypeChange(current, mutation.field);
      const values = { ...draft.values };
      const currentValue = values[current.key];
      if (
        currentValue !== undefined &&
        !valueMatchesType(currentValue, replacement)
      ) {
        delete values[current.key];
      }
      return {
        ...draft,
        fields: draft.fields.map((entry) =>
          entry.key === current.key
            ? { ...replacement, label: mutation.field.label }
            : entry,
        ),
        values,
      };
    }
    case "add_section": {
      const sections = draft.sections ?? [];
      if (sections.some((section) => section.key === mutation.section.key)) {
        throw draftError(
          "invalid_mutation",
          `Draft section "${mutation.section.key}" already exists.`,
        );
      }
      return { ...draft, sections: [...sections, mutation.section] };
    }
    case "rename_section": {
      const sections = draft.sections ?? [];
      if (!sections.some((section) => section.key === mutation.key)) {
        throw draftError(
          "invalid_mutation",
          `Draft section "${mutation.key}" does not exist.`,
        );
      }
      return {
        ...draft,
        sections: sections.map((section) =>
          section.key === mutation.key
            ? { ...section, title: mutation.title }
            : section,
        ),
      };
    }
    case "move_field": {
      const field = assertDraftFieldExists(draft, mutation.key);
      const sections = draft.sections ?? [];
      if (
        mutation.sectionKey !== null &&
        !sections.some((section) => section.key === mutation.sectionKey)
      ) {
        throw draftError(
          "invalid_mutation",
          `Draft section "${mutation.sectionKey}" does not exist.`,
        );
      }
      return {
        ...draft,
        sections: sections.map((section) => ({
          ...section,
          fieldKeys:
            section.key === mutation.sectionKey
              ? [
                  ...section.fieldKeys.filter((key) => key !== field.key),
                  field.key,
                ]
              : section.fieldKeys.filter((key) => key !== field.key),
        })),
      };
    }
    case "place_field": {
      const field = assertDraftFieldExists(draft, mutation.key);
      const sections = draft.sections ?? [];
      if (
        mutation.sectionKey !== null &&
        !sections.some((section) => section.key === mutation.sectionKey)
      ) {
        throw draftError("invalid_mutation", "The destination section does not exist.");
      }
      const destination =
        mutation.sectionKey === null
          ? draft.fields.map((entry) => entry.key).filter((key) =>
              !sections.some((section) => section.fieldKeys.includes(key)),
            )
          : (sections.find((section) => section.key === mutation.sectionKey)?.fieldKeys ?? []);
      if (
        mutation.beforeFieldKey !== null &&
        !destination.includes(mutation.beforeFieldKey)
      ) {
        throw draftError("invalid_mutation", "The placement target is not in the destination.");
      }
      const nextKeys = insertBefore(
        destination.filter((key) => key !== field.key),
        field.key,
        mutation.beforeFieldKey,
      );
      if (mutation.sectionKey === null) {
        const assignedKeys = new Set(
          sections.flatMap((section) => section.fieldKeys),
        );
        return {
          ...draft,
          fields: [
            ...nextKeys.map((key) =>
              draft.fields.find((entry) => entry.key === key)!,
            ),
            ...draft.fields.filter((entry) => assignedKeys.has(entry.key)),
          ],
          sections: sections.map((section) => ({
            ...section,
            fieldKeys: section.fieldKeys.filter((key) => key !== field.key),
          })),
        };
      }
      return {
        ...draft,
        sections: sections.map((section) => ({
          ...section,
          fieldKeys:
            section.key === mutation.sectionKey
              ? nextKeys
              : section.fieldKeys.filter((key) => key !== field.key),
        })),
      };
    }
    case "reparent_section": {
      const sections = draft.sections ?? [];
      if (!sections.some((section) => section.key === mutation.key)) {
        throw draftError(
          "invalid_mutation",
          `Draft section "${mutation.key}" does not exist.`,
        );
      }
      if (
        mutation.parentKey !== null &&
        !sections.some((section) => section.key === mutation.parentKey)
      ) {
        throw draftError(
          "invalid_mutation",
          `Draft section "${mutation.parentKey}" does not exist.`,
        );
      }
      return {
        ...draft,
        sections: sections.map((section) => {
          if (section.key !== mutation.key) return section;
          if (mutation.parentKey === null) {
            const { parentKey: _parentKey, ...rootSection } = section;
            return rootSection;
          }
          return { ...section, parentKey: mutation.parentKey };
        }),
      };
    }
    case "place_section": {
      const sections = draft.sections ?? [];
      const section = sections.find((entry) => entry.key === mutation.key);
      if (section === undefined) throw draftError("invalid_mutation", "The section does not exist.");
      if (mutation.parentKey === mutation.key) throw draftError("invalid_mutation", "A section cannot contain itself.");
      const descendants = descendantSectionKeys(section.key, sections);
      if (mutation.parentKey !== null && descendants.has(mutation.parentKey)) {
        throw draftError("invalid_mutation", "A section cannot be moved into its descendant.");
      }
      const siblings = sections.filter((entry) => (entry.parentKey ?? null) === mutation.parentKey);
      if (mutation.beforeSectionKey !== null && !siblings.some((entry) => entry.key === mutation.beforeSectionKey)) {
        throw draftError("invalid_mutation", "The placement target is not a sibling.");
      }
      const reordered = insertBefore(
        sections.filter((entry) => entry.key !== section.key).map((entry) => entry.key),
        section.key,
        mutation.beforeSectionKey,
      );
      return {
        ...draft,
        sections: reordered.map((key) => {
          const entry = sections.find((candidate) => candidate.key === key)!;
          if (entry.key !== section.key) return entry;
          return mutation.parentKey === null
            ? (({ parentKey: _parentKey, ...root }) => root)(entry)
            : { ...entry, parentKey: mutation.parentKey };
        }),
      };
    }
    case "lock_field": {
      const field = assertDraftFieldExists(draft, mutation.key);
      return {
        ...draft,
        fields: draft.fields.map((entry) =>
          entry.key === field.key ? { ...entry, locked: true } : entry,
        ),
      };
    }
    case "unlock_field": {
      const field = assertDraftFieldExists(draft, mutation.key);
      return {
        ...draft,
        fields: draft.fields.map((entry) =>
          entry.key === field.key ? { ...entry, locked: false } : entry,
        ),
      };
    }
    case "add_field": {
      const existing = draft.fields.some(
        (entry) => entry.key === mutation.field.key,
      );
      if (existing) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${mutation.field.key}" already exists.`,
        );
      }
      if (draft.fields.length >= MAX_DRAFT_SURFACE_FIELDS) {
        throw draftError(
          "surface_out_of_bounds",
          `A draft surface may contain at most ${MAX_DRAFT_SURFACE_FIELDS} fields.`,
        );
      }
      const field = validateAddField(mutation.field);
      return {
        ...draft,
        fields: [...draft.fields, field],
      };
    }
    case "remove_field": {
      const field = assertDraftFieldExists(draft, mutation.key);
      if (draft.fields.length <= 1) {
        throw draftError(
          "surface_out_of_bounds",
          "A draft must retain at least one field.",
        );
      }
      const fields = draft.fields.filter((entry) => entry.key !== field.key);
      const values = { ...draft.values };
      delete values[field.key];
      return {
        ...draft,
        fields,
        sections: (draft.sections ?? []).map((section) => ({
          ...section,
          fieldKeys: section.fieldKeys.filter((key) => key !== field.key),
        })),
        values,
        characterName:
          field.key === "character_name" ? null : draft.characterName,
      };
    }
  }
}

function fieldForTypeChange(
  field: DraftField,
  change: z.infer<typeof DraftFieldTypeChangeSchema>,
): DraftField {
  const base = {
    key: field.key,
    label: field.label,
    type: change.type,
    locked: field.locked,
  } as const;
  if (change.type === "choice") {
    if (change.options === undefined) {
      throw draftError(
        "invalid_mutation",
        "A choice field needs at least one option.",
      );
    }
    return { ...base, options: change.options };
  }
  if (change.type === "number") {
    if (
      change.min !== undefined &&
      change.max !== undefined &&
      change.min > change.max
    ) {
      throw draftError(
        "invalid_mutation",
        "The minimum cannot exceed the maximum.",
      );
    }
    return {
      ...base,
      ...(change.min === undefined ? {} : { min: change.min }),
      ...(change.max === undefined ? {} : { max: change.max }),
    };
  }
  return base;
}

function insertBefore(
  keys: string[],
  key: string,
  beforeKey: string | null,
): string[] {
  if (beforeKey === null) return [...keys, key];
  const index = keys.indexOf(beforeKey);
  return [...keys.slice(0, index), key, ...keys.slice(index)];
}

function materializeOrders(draft: CharacterSheetDraft): CharacterSheetDraft {
  const sections = draft.sections ?? [];
  const assigned = new Set(sections.flatMap((section) => section.fieldKeys));
  const rootNodeOrder = draft.rootNodeOrder ?? [
    ...draft.fields.filter((field) => !assigned.has(field.key)).map((field) => ({ kind: "field" as const, key: field.key })),
    ...sections.filter((section) => section.parentKey === undefined).map((section) => ({ kind: "section" as const, key: section.key })),
  ];
  return {
    ...draft,
    rootNodeOrder,
    sections: sections.map((section) => ({
      ...section,
      nodeOrder: section.nodeOrder ?? [
        ...section.fieldKeys.map((key) => ({ kind: "field" as const, key })),
        ...sections.filter((child) => child.parentKey === section.key).map((child) => ({ kind: "section" as const, key: child.key })),
      ],
    })),
  };
}

function orderedNodes(draft: CharacterSheetDraft, parentKey: string | null): DraftNodeRef[] {
  if (parentKey === null) return draft.rootNodeOrder ?? [];
  return draft.sections?.find((section) => section.key === parentKey)?.nodeOrder ?? [];
}

function parentForNode(draft: CharacterSheetDraft, node: DraftNodeRef): string | null {
  if (node.kind === "section") return draft.sections?.find((section) => section.key === node.key)?.parentKey ?? null;
  const section = draft.sections?.find((entry) => entry.fieldKeys.includes(node.key));
  return section?.key ?? null;
}

function setOrderedNodes(draft: CharacterSheetDraft, parentKey: string | null, nodeOrder: DraftNodeRef[]): CharacterSheetDraft {
  if (parentKey === null) return { ...draft, rootNodeOrder: nodeOrder };
  return {
    ...draft,
    sections: (draft.sections ?? []).map((section) => section.key !== parentKey ? section : {
      ...section,
      nodeOrder,
      fieldKeys: nodeOrder.filter((ref) => ref.kind === "field").map((ref) => ref.key),
    }),
  };
}

function maxSectionDepth(sections: readonly DraftSection[]): number {
  return Math.max(0, ...sections.map((section) => {
    let depth = 1;
    let parentKey = section.parentKey;
    while (parentKey !== undefined) {
      depth += 1;
      parentKey = sections.find((candidate) => candidate.key === parentKey)?.parentKey;
    }
    return depth;
  }));
}

function descendantSectionKeys(
  sectionKey: string,
  sections: readonly DraftSection[],
): Set<string> {
  const descendants = new Set<string>();
  const pending = [sectionKey];
  while (pending.length > 0) {
    const parentKey = pending.pop();
    for (const section of sections) {
      if (section.parentKey === parentKey && !descendants.has(section.key)) {
        descendants.add(section.key);
        pending.push(section.key);
      }
    }
  }
  return descendants;
}

function valueMatchesType(value: DraftValue, field: DraftField): boolean {
  if (value === null) return true;
  if (
    field.type === "text" ||
    field.type === "textarea" ||
    field.type === "choice"
  )
    return typeof value === "string";
  if (field.type === "number") return typeof value === "number";
  if (field.type === "checkbox") return typeof value === "boolean";
  return Array.isArray(value);
}

function parseDraftMutation(input: unknown): DraftMutation {
  const result = DraftMutationSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw draftError(
      "invalid_mutation",
      first === undefined
        ? "The mutation is invalid."
        : `The mutation is invalid: ${first.message}`,
    );
  }
  return result.data;
}

function validateAddField(input: DraftAddField): DraftField {
  const result = DraftFieldSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw draftError(
      "invalid_mutation",
      first === undefined
        ? "The new field is invalid."
        : `The new field is invalid: ${first.message}`,
    );
  }
  return result.data;
}

function assertValueMatchesField(field: DraftField, value: DraftValue): void {
  if (value === null) {
    throw draftError(
      "invalid_mutation",
      "Use clear_value to blank a draft field.",
    );
  }
  switch (field.type) {
    case "text":
    case "textarea":
      if (typeof value !== "string") {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" expects a string value.`,
        );
      }
      return;
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" expects a finite number.`,
        );
      }
      if (field.min !== undefined && value < field.min) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" must be at least ${field.min}.`,
        );
      }
      if (field.max !== undefined && value > field.max) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" must be at most ${field.max}.`,
        );
      }
      return;
    }
    case "checkbox":
      if (typeof value !== "boolean") {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" expects a boolean value.`,
        );
      }
      return;
    case "choice":
      if (typeof value !== "string" || !field.options?.includes(value)) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" expects a declared option.`,
        );
      }
      return;
    case "list":
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      ) {
        throw draftError(
          "invalid_mutation",
          `Draft field "${field.key}" expects a list of text items.`,
        );
      }
      return;
  }
}

function mirrorCharacterName(
  field: DraftField,
  value: DraftValue,
  current: string | null,
): string | null {
  if (field.key !== "character_name") {
    return current;
  }
  return typeof value === "string" ? value : current;
}
