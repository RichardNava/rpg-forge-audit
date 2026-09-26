import {
  CharacterSheetSpecSchema,
  validateCharacterSheetSpecDomain,
  type CharacterSheetField,
  type CharacterSheetSpec,
} from "@repo/character-sheet-schema";
import type {
  CharacterSheetDraft,
  DraftField,
  DraftPlacement,
  DraftValue,
} from "../draft-schema";
import { MAX_DRAFT_TEXT_VALUE_CHARS } from "../draft-schema";
import { draftError } from "../errors";
import { surfaceKeys, walkStructure } from "../guided-edit";

const FIELD_PLACEMENT = {
  order: 0,
  columnStart: 1,
  columnSpan: 1,
  rowSpan: 1,
  breakBefore: false,
} as const;

/**
 * Deterministic, renderable `CharacterSheetSpec` projection of a draft
 * surface. It exists so a preview can render straight from the draft alone,
 * with no run artifact and no provider: one page, one flow section, default
 * theme, no source map. The projected spec is schema- and domain-validated
 * before it is returned.
 */
export function projectDraftToSpec(
  draft: CharacterSheetDraft,
): CharacterSheetSpec {
  const fieldIds = surfaceKeys(draft);
  const fields: CharacterSheetField[] = fieldIds.map((key) => {
    const field = draft.fields.find((entry) => entry.key === key);
    if (field === undefined) {
      throw draftError(
        "projection_invalid",
        `Draft surface references unknown key "${key}".`,
      );
    }
    return draftFieldToSpecField(field);
  });

  const values: Record<string, DraftValue> = {};
  for (const [key, value] of Object.entries(draft.values)) {
    if (fieldIds.includes(key)) {
      values[key] = value;
    }
  }

  // Build projected sections from the structure array
  const projectedSections = buildProjectedSections(draft);
  
  const spec: CharacterSheetSpec = {
    schemaVersion: "1",
    mode: draft.mode === "pc" ? "player" : "npc",
    metadata: {
      id: `sheet.draft.${draft.draftId}`,
      title: draft.characterName ?? "Untitled draft",
      description: null,
      locale: null,
    },
    rulesContextId: draft.rulesContextId,
    pages: [
      {
        id: "draft.page",
        layout: {
          orientation: "portrait",
          sizeIntent: null,
          sectionIds: projectedSections.map((section) => section.id),
        },
      },
    ],
    sections: projectedSections,
    fields,
    values,
    theme: {
      style: "minimal",
      typography: "serif",
      density: "standard",
      borderStyle: "none",
      decorationIntensity: "none",
      accentColor: "#332211",
      backgroundIntent: "none",
    },
    sourceMap: {},
  };

  return validateProjectedSpec(spec);
}

function buildProjectedSections(draft: CharacterSheetDraft): CharacterSheetSpec["sections"] {
  const sections: CharacterSheetSpec["sections"] = [];
  let sectionOrder = 0;

  // Walk the structure in preorder to build sections
  for (const { placement, depth } of walkStructure(draft)) {
    if (placement.kind === "section") {
      const section = draft.sections?.find((s) => s.key === placement.key);
      if (!section) continue;
      
      // Collect all field keys in this section's subtree
      const fieldIds = collectFieldIdsInSubtree(draft, placement.key);
      if (fieldIds.length === 0) continue;
      
      const title = depth === 0 
        ? section.title 
        : buildSectionTitle(draft, placement.key);
      
      sections.push({
        id: `draft.section.${section.key}`,
        title,
        layout: {
          mode: "flow" as const,
          columns: 1,
          order: sectionOrder++,
          emphasis: null,
        },
        fieldIds,
      });
    }
  }

  // Handle unassigned root fields (fields with parentKey: null that aren't in any section)
  const rootFieldIds = draft.structure
    .filter((p) => p.kind === "field" && p.parentKey === null)
    .map((p) => p.key);
  
  if (rootFieldIds.length > 0) {
    sections.push({
      id: sections.length === 0 ? "draft.section" : "draft.section.ungrouped",
      title: draft.mode === "npc" ? "NPC" : "Character",
      layout: {
        mode: "flow" as const,
        columns: 1,
        order: sectionOrder,
        emphasis: null,
      },
      fieldIds: rootFieldIds,
    });
  }

  return sections;
}

function collectFieldIdsInSubtree(draft: CharacterSheetDraft, sectionKey: string): string[] {
  const result: string[] = [];
  const children = draft.structure.filter((p) => p.parentKey === sectionKey);
  
  for (const child of children) {
    if (child.kind === "field") {
      result.push(child.key);
    } else {
      result.push(...collectFieldIdsInSubtree(draft, child.key));
    }
  }
  
  return result;
}

function buildSectionTitle(draft: CharacterSheetDraft, sectionKey: string): string {
  const section = draft.sections?.find((s) => s.key === sectionKey);
  if (!section) return sectionKey;
  
  const parentPlacement = draft.structure.find(
    (p) => p.kind === "section" && p.key === sectionKey
  );
  const parentKey = parentPlacement?.parentKey;
  
  if (!parentKey) return section.title;
  
  const parentTitle = buildSectionTitle(draft, parentKey);
  return `${parentTitle} · ${section.title}`;
}

function draftFieldToSpecField(field: DraftField): CharacterSheetField {
  switch (field.type) {
    case "text":
      return {
        type: "text",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
        maxLength: MAX_DRAFT_TEXT_VALUE_CHARS,
      };
    case "textarea":
      return {
        type: "textarea",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
      };
    case "number":
      return {
        type: "number",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case "checkbox":
      return {
        type: "checkbox",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
      };
    case "choice":
      return {
        type: "select",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
        options: (field.options ?? []).map((option) => ({
          value: option,
          label: option,
        })),
      };
    case "list":
      return {
        type: "list",
        id: field.key,
        label: field.label,
        requiredForPlayableNpc: false,
        placement: FIELD_PLACEMENT,
        itemLabel: field.label,
        maxItems: 100,
      };
  }
}

function validateProjectedSpec(spec: CharacterSheetSpec): CharacterSheetSpec {
  const parsed = CharacterSheetSpecSchema.safeParse(spec);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw draftError(
      "projection_invalid",
      first === undefined
        ? "The projected draft spec is invalid."
        : `The projected draft spec is invalid: ${first.message}`,
    );
  }
  const domain = validateCharacterSheetSpecDomain(parsed.data);
  if (!domain.valid) {
    throw draftError(
      "projection_invalid",
      `The projected draft spec fails domain validation: ${domain.issues
        .map((issue) => issue.code)
        .join(", ")}`,
    );
  }
  return parsed.data;
}