import type {
  CharacterSheetDraft,
  DraftField,
  DraftPlacement,
  DraftSection,
  DraftValue,
} from "./draft-schema";
import {
  MAX_DRAFT_SURFACE_FIELDS,
  MAX_DRAFT_VALUES_FIELDS,
} from "./draft-schema";
import { draftError } from "./errors";

/** Ordered canonical keys of the draft surface. */
export function surfaceKeys(draft: CharacterSheetDraft): string[] {
  return draft.fields.map((field) => field.key);
}

export function mustBeWithinDraftSurface(
  draft: CharacterSheetDraft,
  key: string,
): boolean {
  return draft.fields.some((field) => field.key === key);
}

export function findDraftField(
  draft: CharacterSheetDraft,
  key: string,
): DraftField | undefined {
  return draft.fields.find((field) => field.key === key);
}

export function assertDraftFieldExists(
  draft: CharacterSheetDraft,
  key: string,
): DraftField {
  const field = findDraftField(draft, key);
  if (field === undefined) {
    throw draftError(
      "surface_out_of_bounds",
      `Draft field "${key}" is outside the editable surface.`,
    );
  }
  return field;
}

export function countDraftValues(draft: CharacterSheetDraft): number {
  return Object.keys(draft.values).length;
}

/**
 * Load-time safety net: returns a copy of the draft whose values reference
 * only surface keys, bounded to the values budget. It never repairs values or
 * drops in-bounds entries that fail per-field typing; typed edits are enforced
 * at mutation time and normalized storage corruption surfaces as
 * `corrupt_draft` on read instead.
 */
export function pruneSurfaceToDraftBounds(
  draft: CharacterSheetDraft,
): CharacterSheetDraft {
  const fieldKeys = new Set(surfaceKeys(draft));
  const values: Record<string, DraftValue> = {};
  for (const [key, value] of Object.entries(draft.values)) {
    if (
      fieldKeys.has(key) &&
      Object.keys(values).length < MAX_DRAFT_VALUES_FIELDS
    ) {
      values[key] = value;
    }
  }
  return { ...draft, values };
}

export function assertDraftWithinBounds(draft: CharacterSheetDraft): void {
  if (draft.fields.length > MAX_DRAFT_SURFACE_FIELDS) {
    throw draftError(
      "surface_out_of_bounds",
      `A draft surface may contain at most ${MAX_DRAFT_SURFACE_FIELDS} fields.`,
    );
  }
  if (Object.keys(draft.values).length > MAX_DRAFT_VALUES_FIELDS) {
    throw draftError(
      "surface_out_of_bounds",
      `A draft may carry at most ${MAX_DRAFT_VALUES_FIELDS} values.`,
    );
  }
  for (const key of Object.keys(draft.values)) {
    if (!mustBeWithinDraftSurface(draft, key)) {
      throw draftError(
        "surface_out_of_bounds",
        `Draft value "${key}" is outside the editable surface.`,
      );
    }
  }
}

/**
 * Derived in-memory structural index for a V2 draft.
 * Computed on-demand, never persisted, never a structural authority.
 */
export interface DraftStructuralIndex {
  /** O(1) lookup of placement by kind+key */
  placementByKey: Map<string, DraftPlacement>;
  /** Children grouped by parent, in structure[] order */
  childrenByParent: Map<string | null, DraftPlacement[]>;
  /** Parent key for each node */
  parentByKey: Map<string, string | null>;
  /** Depth of each node (root = 0) */
  depthByKey: Map<string, number>;
  /** Subtree range [start, end) in structure[] for each section */
  subtreeRange: Map<string, { start: number; end: number }>;
}

/**
 * Builds a structural index from a V2 draft's structure array.
 * O(n) single pass. Derived, never persisted, never a structural authority.
 */
export function buildDraftStructuralIndex(draft: CharacterSheetDraft): DraftStructuralIndex {
  const structure = draft.structure ?? [];
  const placementByKey = new Map<string, DraftPlacement>();
  const childrenByParent = new Map<string | null, DraftPlacement[]>();
  const parentByKey = new Map<string, string | null>();
  const depthByKey = new Map<string, number>();
  const subtreeRange = new Map<string, { start: number; end: number }>();

  const keyOf = (p: DraftPlacement) => `${p.kind}:${p.key}`;

  // Build basic maps
  for (const p of structure) {
    const key = keyOf(p);
    placementByKey.set(key, p);
    parentByKey.set(p.key, p.parentKey);

    const parentKey = p.parentKey ?? null;
    if (!childrenByParent.has(parentKey)) {
      childrenByParent.set(parentKey, []);
    }
    childrenByParent.get(parentKey)!.push(p);
  }

  // Compute depth and subtree ranges via DFS
  function dfs(key: string, depth: number): { end: number } {
    depthByKey.set(key, depth);
    const start = structure.findIndex(p => keyOf(p) === key);
    let maxEnd = start + 1;
    const children = childrenByParent.get(key) ?? [];
    for (const child of children) {
      const childResult = dfs(keyOf(child), depth + 1);
      maxEnd = Math.max(maxEnd, childResult.end);
    }
    subtreeRange.set(key, { start, end: maxEnd });
    return { end: maxEnd };
  }

  // Find root sections (parentKey === null)
  const rootSections = structure.filter(p => p.parentKey === null && p.kind === "section");
  for (const root of rootSections) {
    dfs(keyOf(root), 0);
  }

  // Also handle root-level fields (they have no children)
  const rootFields = structure.filter(p => p.parentKey === null && p.kind === "field");
  for (const field of rootFields) {
    const key = keyOf(field);
    if (!depthByKey.has(key)) {
      depthByKey.set(key, 0);
      const start = structure.findIndex(p => keyOf(p) === key);
      subtreeRange.set(key, { start, end: start + 1 });
    }
  }

  return {
    placementByKey,
    childrenByParent,
    parentByKey,
    depthByKey,
    subtreeRange,
  };
}

/**
 * Returns children of a node in structure[] order.
 */
export function getChildren(draft: CharacterSheetDraft, parentKey: string | null): DraftPlacement[] {
  const index = buildDraftStructuralIndex(draft);
  return index.childrenByParent.get(parentKey) ?? [];
}

/**
 * Returns the parent key of a node, or null for root.
 */
export function getParent(draft: CharacterSheetDraft, key: string): string | null {
  const index = buildDraftStructuralIndex(draft);
  return index.parentByKey.get(key) ?? null;
}

/**
 * Returns the depth of a node (root = 0).
 */
export function getDepth(draft: CharacterSheetDraft, key: string): number {
  const index = buildDraftStructuralIndex(draft);
  return index.depthByKey.get(key) ?? 0;
}

/**
 * Returns the subtree range [start, end) in structure[] for a section.
 */
export function getSubtreeRange(draft: CharacterSheetDraft, sectionKey: string): { start: number; end: number } | null {
  const index = buildDraftStructuralIndex(draft);
  return index.subtreeRange.get(sectionKey) ?? null;
}

/**
 * Walks the structure in canonical preorder, yielding each node with its depth.
 */
export function* walkStructure(draft: CharacterSheetDraft): Generator<{ placement: DraftPlacement; depth: number }> {
  const index = buildDraftStructuralIndex(draft);
  
  function* visit(key: string, depth: number): Generator<{ placement: DraftPlacement; depth: number }> {
    const placement = index.placementByKey.get(key);
    if (!placement) return;
    yield { placement, depth };
    if (placement.kind === "section") {
      const children = index.childrenByParent.get(key) ?? [];
      for (const child of children) {
        yield* visit(keyOf(child), depth + 1);
      }
    }
  }

  const keyOf = (p: DraftPlacement) => `${p.kind}:${p.key}`;
  
  for (const root of draft.structure.filter(p => p.parentKey === null)) {
    yield* visit(keyOf(root), 0);
  }
}

/**
 * Returns all descendants of a section in preorder.
 */
export function getDescendants(draft: CharacterSheetDraft, sectionKey: string): DraftPlacement[] {
  const result: DraftPlacement[] = [];
  const index = buildDraftStructuralIndex(draft);
  const children = index.childrenByParent.get(sectionKey) ?? [];
  for (const child of children) {
    result.push(child);
    if (child.kind === "section") {
      result.push(...getDescendants(draft, child.key));
    }
  }
  return result;
}