import { useEffect, useState } from "react";
import { GripVertical, Plus, Settings2, Move, Trash2 } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type {
  CharacterSheetDraft,
  DraftMutation,
  DraftNodeRef,
  DraftSection,
  DraftValue,
} from "@repo/character-sheet-draft";
import {
  getRootNodeOrder,
  getOrderedNodes,
  getFieldParentKey,
  getSectionParentKey,
  isDescendant,
} from "@repo/character-sheet-draft";
import { FieldEditor } from "./FieldEditor";

export interface WorkshopSidebarCallbacks {
  onSetValue(key: string, value: DraftValue): void;
  onClearValue(key: string): void;
  onRemoveField(key: string): void;
  onUpdateField(
    field: Extract<DraftMutation, { op: "update_field" }>["field"],
  ): void;
  onAddSection(
    section: Extract<DraftMutation, { op: "add_section" }>["section"],
  ): void;
  onRenameSection(key: string, title: string): void;
  onPlaceNode(
    node: { kind: "field" | "section"; key: string },
    destination: {
      parent: { kind: "root" } | { kind: "section"; key: string };
      before: { kind: "field" | "section"; key: string } | null;
    },
  ): void;
  onRemoveSection(key: string): void;
  onAddField(): void;
  onOpenAddSection?(): void;
}

interface WorkshopSidebarProps {
  draft: CharacterSheetDraft;
  callbacks: WorkshopSidebarCallbacks;
  disabled: boolean;
}

interface DragData {
  kind: "field" | "section";
  key: string;
  label: string;
}

interface DropTargetData {
  kind: "before" | "after" | "inside";
  nodeRef: DraftNodeRef;
  parentKey: string | null;
  parentIsRoot: boolean;
}

interface RootDropTargetData {
  kind: "before" | "after";
  targetKey: string | null;
  targetKind: "field" | "section" | null;
}

type DestinationParent =
  | { kind: "root" }
  | { kind: "section"; key: string };

type Destination = {
  parent: DestinationParent;
  before: { kind: "field" | "section"; key: string } | null;
};

type DropTarget = DropTargetData | RootDropTargetData | undefined;

function isDropTargetData(target: DropTarget): target is DropTargetData {
  return target !== undefined && target.kind !== undefined && "nodeRef" in target;
}

function isRootDropTargetData(target: DropTarget): target is RootDropTargetData {
  return target !== undefined && "targetKey" in target;
}

function getDropIntent(
  source: { kind: "field" | "section"; key: string; label: string },
  target: DropTarget,
  draft: CharacterSheetDraft,
): { intent: "before" | "after" | "inside" | "invalid"; destination: Destination } | null {
  if (!target) return null;

  const sections = draft.sections ?? [];

  if (isDropTargetData(target) && (target.kind === "before" || target.kind === "after")) {
    const parentKey = target.parentKey;
    const parentIsRoot = target.parentIsRoot;
    const beforeNode: { kind: "field" | "section"; key: string } = { kind: target.nodeRef.kind, key: target.nodeRef.key };

    if (source.kind === "field") {
      if (parentIsRoot) {
        return {
          intent: target.kind,
          destination: { parent: { kind: "root" }, before: beforeNode },
        };
      }
      return {
        intent: target.kind,
        destination: { parent: { kind: "section", key: parentKey! }, before: beforeNode },
      };
    }

    if (source.kind === "section") {
      if (parentIsRoot) {
        if (target.kind === "after" && target.nodeRef.key === source.key) return null;
        return {
          intent: target.kind,
          destination: { parent: { kind: "root" }, before: beforeNode },
        };
      }
      if (isDescendant(sections, source.key, parentKey!)) return null;
      if (target.kind === "after" && target.nodeRef.key === source.key) return null;
      return {
        intent: target.kind,
        destination: { parent: { kind: "section", key: parentKey! }, before: beforeNode },
      };
    }
  }

  if (isDropTargetData(target) && target.kind === "inside") {
    if (source.kind === "section") return null;
    return {
      intent: "inside",
      destination: { parent: { kind: "section", key: target.nodeRef.key }, before: null },
    };
  }

  if (isRootDropTargetData(target)) {
    const { targetKey, targetKind } = target;

    if (source.kind === "field") {
      if (targetKind === "field" && targetKey === source.key) return null;
      const beforeNode: { kind: "field" | "section"; key: string } | null = targetKey
        ? { kind: targetKind!, key: targetKey }
        : null;
      return {
        intent: "before",
        destination: { parent: { kind: "root" }, before: beforeNode },
      };
    }

    if (source.kind === "section") {
      if (targetKind === "section" && targetKey === source.key) return null;
      const beforeNode: { kind: "field" | "section"; key: string } | null = targetKey
        ? { kind: targetKind!, key: targetKey }
        : null;
      return {
        intent: "before",
        destination: { parent: { kind: "root" }, before: beforeNode },
      };
    }
  }

  return null;
}

export function WorkshopSidebar({
  draft,
  callbacks,
  disabled,
}: WorkshopSidebarProps) {
  return (
    <section
      className="character-workshop__panel character-workshop__editor"
      aria-label={`Fields (${draft.fields.length})`}
    >
      <header className="character-workshop__editor-header">
        <div>
          <h2 className="character-workshop__panel-title">Sheet fields</h2>
          <p>{draft.fields.length} of 192 fields</p>
        </div>
        {!disabled && callbacks.onOpenAddSection !== undefined && (
          <div className="character-workshop__editor-actions">
            <button
              type="button"
              className="character-workshop__btn character-workshop__btn--secondary"
              onClick={callbacks.onOpenAddSection}
            >
              <Plus aria-hidden="true" />
              Add section
            </button>
          </div>
        )}
      </header>
      <div className="character-workshop__field-list">
        <GroupedFields
          draft={draft}
          callbacks={callbacks}
          disabled={disabled}
        />
      </div>
    </section>
  );
}

function GroupedFields({ draft, callbacks, disabled }: WorkshopSidebarProps) {
  const sections = draft.sections ?? [];
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeIntent, setActiveIntent] = useState<{ kind: string; message: string } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const assigned = new Set(sections.flatMap((section) => section.fieldKeys));

  function handleDragStart(event: DragEndEvent) {
    const sourceData = event.active.data.current as DragData | undefined;
    setActiveLabel(sourceData?.label ?? "item");
  }

  function handleDragOver(event: DragEndEvent) {
    const source = event.active.data.current as DragData | undefined;
    const target = event.over?.data.current as DropTarget | undefined;
    if (!source || !target) {
      setActiveIntent(null);
      return;
    }
    const intent = getDropIntent(source, target, draft);
    if (intent) {
      const nodeLabel = source.label;
      const beforeLabel = intent.destination.before
        ? (draft.sections?.find((s) => s.key === intent.destination.before!.key)?.title ??
          draft.fields.find((f) => f.key === intent.destination.before!.key)?.label ??
          intent.destination.before!.key)
        : "end";
      const parentLabel = intent.destination.parent.kind === "root"
        ? "Root"
        : (draft.sections?.find((s) => s.key === (intent.destination.parent as { kind: "section"; key: string }).key)?.title ?? (intent.destination.parent as { kind: "section"; key: string }).key);
      const action = intent.intent === "inside" ? "into" : intent.intent === "before" ? "before" : "after";
      setActiveIntent({
        kind: intent.intent,
        message: `Move ${source.kind} "${nodeLabel}" ${action} "${beforeLabel}" in ${parentLabel}`,
      });
    } else {
      setActiveIntent({ kind: "invalid", message: "Invalid drop target" });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const source = event.active.data.current;
    const target = event.over?.data.current as DropTarget | undefined;
    setActiveLabel(null);
    setActiveIntent(null);

    const sourceData = source as DragData | undefined;
    const targetData = target as DropTarget | undefined;
    if (!sourceData || !targetData) return;

    const intent = getDropIntent(sourceData, targetData, draft);
    if (!intent || intent.intent === "invalid") return;

    callbacks.onPlaceNode(
      { kind: sourceData.kind, key: sourceData.key },
      intent.destination,
    );
  }

  const rootNodeOrder = getRootNodeOrder(draft);

  const content = (
    <>
      <RootDropZone
        draft={draft}
        rootNodeOrder={rootNodeOrder}
        disabled={disabled}
        callbacks={callbacks}
      />
      {sections
        .filter((section) => section.parentKey === undefined)
        .map((section) => (
          <SectionWithDropZones
            key={section.key}
            section={section}
            sections={sections}
            draft={draft}
            callbacks={callbacks}
            disabled={disabled}
            depth={0}
          />
        ))}
      {draft.fields.some((field) => !assigned.has(field.key)) && (
        <section className="character-workshop__field-group">
          <h3 className="character-workshop__field-group-title">
            Other fields
          </h3>
          <FieldCards
            draft={draft}
            fieldKeys={draft.fields
              .filter((field) => !assigned.has(field.key))
              .map((field) => field.key)}
            callbacks={callbacks}
            disabled={disabled}
            sectionKey={null}
          />
        </section>
      )}
    </>
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveLabel(null);
        setActiveIntent(null);
      }}
    >
      {content}
      <DragOverlay>
        {activeLabel === null ? null : (
          <span className="character-workshop__drag-overlay">
            <Move className="character-workshop__drag-icon" aria-hidden="true" />
            Moving {activeLabel}
            {activeIntent && (
              <span className="character-workshop__drag-intent">
                → {activeIntent.message}
              </span>
            )}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function RootDropZone({
  draft,
  rootNodeOrder,
  disabled,
  callbacks,
}: {
  draft: CharacterSheetDraft;
  rootNodeOrder: DraftNodeRef[];
  disabled: boolean;
  callbacks: WorkshopSidebarCallbacks;
}) {
  if (rootNodeOrder.length === 0) return null;

  return (
    <section className="character-workshop__field-group character-workshop__root-group" data-depth={0}>
      <h3 className="character-workshop__field-group-title">Root</h3>
      <div className="character-workshop__node-list">
        {rootNodeOrder.map((nodeRef, index) => (
          <RootDropTarget
            key={nodeRef.key}
            nodeRef={nodeRef}
            index={index}
            draft={draft}
            disabled={disabled}
            callbacks={callbacks}
            isLast={index === rootNodeOrder.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function RootDropTarget({
  nodeRef,
  index,
  draft,
  disabled,
  callbacks,
  isLast,
}: {
  nodeRef: DraftNodeRef;
  index: number;
  draft: CharacterSheetDraft;
  disabled: boolean;
  callbacks: WorkshopSidebarCallbacks;
  isLast: boolean;
}) {
  const beforeRef = useDroppable({
    id: `root-before-${nodeRef.key}`,
    data: {
      kind: "before",
      nodeRef,
      parentKey: null,
      parentIsRoot: true,
    } as DropTargetData,
  });
  const afterRef = useDroppable({
    id: `root-after-${nodeRef.key}`,
    data: {
      kind: "after",
      nodeRef,
      parentKey: null,
      parentIsRoot: true,
    } as DropTargetData,
  });

  const isSection = nodeRef.kind === "section";
  const label = isSection
    ? draft.sections?.find((s) => s.key === nodeRef.key)?.title ?? nodeRef.key
    : draft.fields.find((f) => f.key === nodeRef.key)?.label ?? nodeRef.key;

  return (
    <div className="character-workshop__root-node" data-node-type={nodeRef.kind}>
      <div
        ref={beforeRef.setNodeRef}
        className={`character-workshop__drop-indicator character-workshop__drop-indicator--before ${beforeRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
        data-intent="before"
      />
      <DraggableNode
        nodeRef={nodeRef}
        label={label}
        disabled={disabled}
        callbacks={callbacks}
        depth={0}
        isSection={isSection}
        draft={draft}
      />
      <div
        ref={afterRef.setNodeRef}
        className={`character-workshop__drop-indicator character-workshop__drop-indicator--after ${afterRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
        data-intent="after"
      />
    </div>
  );
}

function SectionWithDropZones({
  section,
  sections,
  draft,
  callbacks,
  disabled,
  depth,
}: {
  section: DraftSection;
  sections: DraftSection[];
  draft: CharacterSheetDraft;
  callbacks: WorkshopSidebarCallbacks;
  disabled: boolean;
  depth: number;
}) {
  const title = section.title;
  const nodeRef: DraftNodeRef = { kind: "section", key: section.key };
  const parentKey = section.parentKey ?? null;
  const parentIsRoot = parentKey === null;

  const beforeRef = useDroppable({
    id: `section-before-${section.key}`,
    data: {
      kind: "before",
      nodeRef,
      parentKey,
      parentIsRoot,
    } as DropTargetData,
  });
  const afterRef = useDroppable({
    id: `section-after-${section.key}`,
    data: {
      kind: "after",
      nodeRef,
      parentKey,
      parentIsRoot,
    } as DropTargetData,
  });
  const insideRef = useDroppable({
    id: `section-inside-${section.key}`,
    data: {
      kind: "inside",
      nodeRef,
      parentKey,
      parentIsRoot,
    } as DropTargetData,
  });

  const children = sections.filter((s) => s.parentKey === section.key);
  const nodeOrder = getOrderedNodes(draft, section.key);
  const childNodeOrder = nodeOrder.filter(
    (ref) => ref.kind === "section" ? sections.find((s) => s.key === ref.key)?.parentKey === section.key : section.fieldKeys.includes(ref.key),
  );

  return (
    <section
      className="character-workshop__field-group"
      data-depth={depth}
      aria-labelledby={`section-${section.key}`}
      ref={insideRef.setNodeRef}
    >
      <div className="character-workshop__section-header">
        <div
          ref={beforeRef.setNodeRef}
          className={`character-workshop__drop-indicator character-workshop__drop-indicator--before ${beforeRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
          data-intent="before"
        />
        <SectionHeader
          section={section}
          sections={sections}
          draft={draft}
          callbacks={callbacks}
          disabled={disabled}
          depth={depth}
          nodeRef={nodeRef}
        />
        <div
          ref={afterRef.setNodeRef}
          className={`character-workshop__drop-indicator character-workshop__drop-indicator--after ${afterRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
          data-intent="after"
        />
      </div>
      <div className="character-workshop__section-content">
        {childNodeOrder.map((childRef, idx) => {
          const isSectionChild = childRef.kind === "section";
          const childSection = isSectionChild ? sections.find((s) => s.key === childRef.key) : null;
          const childField = !isSectionChild ? draft.fields.find((f) => f.key === childRef.key) : null;
          if (isSectionChild && childSection) {
            return (
              <SectionWithDropZones
                key={childRef.key}
                section={childSection}
                sections={sections}
                draft={draft}
                callbacks={callbacks}
                disabled={disabled}
                depth={depth + 1}
              />
            );
          }
          if (childField) {
            return (
              <DraggableField
                key={childRef.key}
                field={childField}
                draft={draft}
                callbacks={callbacks}
                disabled={disabled}
                sectionKey={section.key}
                nodeRef={childRef}
              />
            );
          }
          return null;
        })}
        {children.length === 0 && section.fieldKeys.length === 0 && (
          <div
            ref={insideRef.setNodeRef}
            className={`character-workshop__drop-zone character-workshop__drop-zone--inside ${insideRef.isOver ? "character-workshop__drop-zone--active" : ""}`}
            data-intent="inside"
          >
            Drop fields or sections here
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHeader({
  section,
  sections,
  draft,
  callbacks,
  disabled,
  depth,
  nodeRef,
}: {
  section: DraftSection;
  sections: DraftSection[];
  draft: CharacterSheetDraft;
  callbacks: WorkshopSidebarCallbacks;
  disabled: boolean;
  depth: number;
  nodeRef: DraftNodeRef;
}) {
  const [title, setTitle] = useState(section.title);
  const descendants = descendantKeys(section.key, sections);
  useEffect(() => setTitle(section.title), [section.title]);
  const draggable = useDraggable({
    id: `section:${section.key}`,
    disabled,
    data: { kind: "section", key: section.key, label: section.title },
  });

  function commitTitle() {
    const next = title.trim();
    if (next === "") setTitle(section.title);
    else if (next !== section.title)
      callbacks.onRenameSection(section.key, next);
  }

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
      }}
      className="character-workshop__section-heading"
    >
      <h3
        id={`section-${section.key}`}
        className="character-workshop__field-group-title"
      >
        {section.title}
      </h3>
      {!disabled && (
        <button
          type="button"
          className="character-workshop__drag-handle"
          aria-label={`Move section ${section.title}`}
          title={`Move section ${section.title}`}
          ref={draggable.setActivatorNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
        >
          <GripVertical aria-hidden="true" />
        </button>
      )}
      {!disabled && (
        <details className="character-workshop__section-settings">
          <summary>
            <Settings2 aria-hidden="true" />
            Section settings
            <span className="character-workshop__sr-only">
              {" "}
              for {section.title}
            </span>
          </summary>
          <div>
            <label className="character-workshop__form-field">
              <span>Section title</span>
              <input
                aria-label={`Title for ${section.title}`}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <label className="character-workshop__form-field">
              <span>Parent section</span>
              <select
                aria-label={`Parent section for ${section.title}`}
                value={section.parentKey ?? ""}
                onChange={(event) =>
                  callbacks.onPlaceNode(
                    { kind: "section", key: section.key },
                    {
                      parent: event.currentTarget.value === "" ? { kind: "root" } : { kind: "section", key: event.currentTarget.value },
                      before: null,
                    },
                  )
                }
              >
                <option value="">Root (top level)</option>
                {sections
                  .filter(
                    (candidate) =>
                      candidate.key !== section.key &&
                      !descendants.has(candidate.key),
                  )
                  .map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>
                      {candidate.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </details>
      )}
    </div>
  );
}

function DraggableNode({
  nodeRef,
  label,
  disabled,
  callbacks,
  depth,
  isSection,
  draft,
}: {
  nodeRef: DraftNodeRef;
  label: string;
  disabled: boolean;
  callbacks: WorkshopSidebarCallbacks;
  depth: number;
  isSection: boolean;
  draft: CharacterSheetDraft;
}) {
  const draggable = useDraggable({
    id: `${nodeRef.kind}:${nodeRef.key}`,
    disabled,
    data: { kind: nodeRef.kind, key: nodeRef.key, label },
  });

  if (isSection) {
    return (
      <DraggableSection
        {...{ nodeRef, label, disabled, callbacks, depth, draft, draggable }}
      />
    );
  }
  return (
    <DraggableField
      {...{ nodeRef, field: draft.fields.find((f) => f.key === nodeRef.key)!, disabled, callbacks, draft, sectionKey: getFieldParentKey(draft, nodeRef.key) }}
    />
  );
}

function DraggableSection({
  nodeRef,
  label,
  disabled,
  callbacks,
  depth,
  draft,
  draggable,
}: {
  nodeRef: DraftNodeRef;
  label: string;
  disabled: boolean;
  callbacks: WorkshopSidebarCallbacks;
  depth: number;
  draft: CharacterSheetDraft;
  draggable: ReturnType<typeof useDraggable>;
}) {
  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
      }}
      className="character-workshop__draggable-section"
    >
      <button
        type="button"
        className="character-workshop__drag-handle"
        aria-label={`Move section ${label}`}
        title={`Move section ${label}`}
        ref={draggable.setActivatorNodeRef}
        {...draggable.listeners}
        {...draggable.attributes}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <span className="character-workshop__section-label">{label}</span>
      {!disabled && (
        <details className="character-workshop__section-settings-inline">
          <summary>
            <Settings2 aria-hidden="true" />
          </summary>
          <div className="character-workshop__section-actions">
            <button
              type="button"
              className="character-workshop__btn character-workshop__btn--secondary character-workshop__btn--small"
              onClick={() => callbacks.onRemoveSection(nodeRef.key)}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

function DraggableField({
  nodeRef,
  field,
  draft,
  callbacks,
  disabled,
  sectionKey,
}: {
  nodeRef: DraftNodeRef;
  field: CharacterSheetDraft["fields"][number];
  draft: CharacterSheetDraft;
  callbacks: WorkshopSidebarCallbacks;
  disabled: boolean;
  sectionKey: string | null;
}) {
  const draggable = useDraggable({
    id: `field:${field.key}`,
    disabled,
    data: { kind: "field", key: field.key, label: field.label },
  });
  const beforeRef = useDroppable({
    id: `field-before-${field.key}`,
    data: {
      kind: "before",
      nodeRef: { kind: "field", key: field.key },
      parentKey: sectionKey,
      parentIsRoot: sectionKey === null,
    } as DropTargetData,
  });
  const afterRef = useDroppable({
    id: `field-after-${field.key}`,
    data: {
      kind: "after",
      nodeRef: { kind: "field", key: field.key },
      parentKey: sectionKey,
      parentIsRoot: sectionKey === null,
    } as DropTargetData,
  });

  return (
    <div className="character-workshop__draggable-field" ref={draggable.setNodeRef}>
      <div
        ref={beforeRef.setNodeRef}
        className={`character-workshop__drop-indicator character-workshop__drop-indicator--before ${beforeRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
        data-intent="before"
      />
      <div className="character-workshop__field-wrapper">
        <button
          type="button"
          className="character-workshop__drag-handle"
          aria-label={`Move ${field.label}`}
          title={`Move ${field.label}`}
          ref={draggable.setActivatorNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
        >
          <GripVertical aria-hidden="true" />
        </button>
        <FieldEditor
          field={field}
          draft={draft}
          callbacks={callbacks}
          disabled={disabled}
        />
      </div>
      <div
        ref={afterRef.setNodeRef}
        className={`character-workshop__drop-indicator character-workshop__drop-indicator--after ${afterRef.isOver ? "character-workshop__drop-indicator--active" : ""}`}
        data-intent="after"
      />
    </div>
  );
}

function FieldCards({
  draft,
  fieldKeys,
  callbacks,
  disabled,
  sectionKey,
}: {
  draft: CharacterSheetDraft;
  fieldKeys: string[];
  callbacks: WorkshopSidebarCallbacks;
  disabled: boolean;
  sectionKey: string | null;
}) {
  return (
    <div className="character-workshop__field-grid">
      {fieldKeys.flatMap((key) => {
        const field = draft.fields.find((entry) => entry.key === key);
        return field === undefined ? (
          []
        ) : (
          <DraggableField
            key={field.key}
            nodeRef={{ kind: "field", key: field.key }}
            field={field}
            draft={draft}
            callbacks={callbacks}
            disabled={disabled}
            sectionKey={sectionKey}
          />
        );
      })}
    </div>
  );
}

function descendantKeys(
  sectionKey: string,
  sections: DraftSection[],
): Set<string> {
  const descendants = new Set<string>();
  const pending = [sectionKey];
  while (pending.length > 0) {
    const parentKey = pending.pop();
    for (const section of sections)
      if (section.parentKey === parentKey && !descendants.has(section.key)) {
        descendants.add(section.key);
        pending.push(section.key);
      }
  }
  return descendants;
}