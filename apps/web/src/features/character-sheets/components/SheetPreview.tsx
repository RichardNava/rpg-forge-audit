import { useMemo } from "react";
import {
  projectDraftToSpec,
  type CharacterSheetDraft,
} from "@repo/character-sheet-draft";
import { getChildren, getParent, walkStructure } from "@repo/character-sheet-draft";
import { previewValue } from "./FieldEditor";

interface SheetPreviewProps {
  draft: CharacterSheetDraft;
}

/**
 * Live read-only preview of the editable draft. The draft is validated through
 * the genuine `projectDraftToSpec` projection so the preview only renders when
 * an export would also succeed; field rendering then reads from the draft
 * surface, which is exactly the single-flow projection an export produces.
 */
export function SheetPreview({ draft }: SheetPreviewProps) {
  const spec = useMemo(() => {
    try {
      return projectDraftToSpec(draft);
    } catch {
      return null;
    }
  }, [draft]);

  if (spec === null) {
    return (
      <div className="character-workshop__panel">
        <div className="character-workshop__panel-title">Preview</div>
        <div className="character-workshop__preview-value character-workshop__preview-value--empty">
          Preview unavailable for this draft.
        </div>
      </div>
    );
  }

  return (
    <div className="character-workshop__sheet" aria-label="Sheet preview">
      <div className="character-workshop__sheet-header">
        <h2 className="character-workshop__sheet-title">
          {spec.metadata.title}
        </h2>
      </div>
      <div className="character-workshop__sheet-body">
        <PreviewGroups draft={draft} />
      </div>
    </div>
  );
}

function PreviewGroups({ draft }: { draft: CharacterSheetDraft }) {
  const rootPlacements = draft.structure.filter((p) => p.parentKey === null);
  
  if (rootPlacements.length === 0) {
    return draft.fields.map((field) => (
      <PreviewField key={field.key} draft={draft} fieldKey={field.key} />
    ));
  }

  return (
    <>
      {rootPlacements
        .filter((p) => p.kind === "section")
        .map((sectionPlacement) => (
          <PreviewSection
            key={sectionPlacement.key}
            sectionKey={sectionPlacement.key}
            draft={draft}
            depth={0}
          />
        ))}
      {rootPlacements
        .filter((p) => p.kind === "field")
        .map((fieldPlacement) => (
          <PreviewField key={fieldPlacement.key} draft={draft} fieldKey={fieldPlacement.key} />
        ))}
    </>
  );
}

function PreviewSection({
  sectionKey,
  draft,
  depth,
}: {
  sectionKey: string;
  draft: CharacterSheetDraft;
  depth: number;
}) {
  const section = draft.sections?.find((entry) => entry.key === sectionKey);
  if (section === undefined) return null;
  
  const children = getChildren(draft, sectionKey);
  
  return (
    <section
      className="character-workshop__preview-section"
      data-depth={depth}
      aria-labelledby={`preview-section-${section.key}`}
    >
      <h3
        id={`preview-section-${section.key}`}
        className="character-workshop__preview-section-title"
      >
        {section.title}
      </h3>
      <div className="character-workshop__preview-section-fields">
        {children
          .filter((p) => p.kind === "field")
          .map((fieldPlacement) => (
            <PreviewField key={fieldPlacement.key} draft={draft} fieldKey={fieldPlacement.key} />
          ))}
      </div>
      {children
        .filter((p) => p.kind === "section")
        .map((childPlacement) => (
          <PreviewSection
            key={childPlacement.key}
            sectionKey={childPlacement.key}
            draft={draft}
            depth={depth + 1}
          />
        ))}
    </section>
  );
}

function PreviewField({
  draft,
  fieldKey,
}: {
  draft: CharacterSheetDraft;
  fieldKey: string;
}) {
  const field = draft.fields.find((entry) => entry.key === fieldKey);
  if (field === undefined) {
    return null;
  }
  const rendered = previewValue(field, draft.values[fieldKey] ?? null);
  return (
    <div className="character-workshop__preview-field">
      <span className="character-workshop__preview-label">{field.label}</span>
      <span
        className={
          rendered === ""
            ? "character-workshop__preview-value character-workshop__preview-value--empty"
            : "character-workshop__preview-value"
        }
      >
        {rendered === "" ? "—" : rendered}
      </span>
    </div>
  );
}