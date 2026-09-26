import {
  applyDraftMutation,
  bumpDraftVersion,
  finalizeDraft,
  rerollLockedDraftValues,
  validateDraft,
  type CharacterSheetDraft,
  type DraftMutation,
} from "@repo/character-sheet-draft";
import type {
  SheetSession,
  SheetSessionView,
  SheetDraftRerollResponse,
} from "../api/sheet-api-types";
import type { SheetApiClientPort } from "../api/sheet-api-client";

export interface LocalSheetBackendOptions {
  /** Optional seed for the session's deterministic R2-like snapshot clock. */
  clock?: () => Date;
}

type LocalDraftHistory = Map<number, CharacterSheetDraft>;

/**
 * In-memory `SheetApiClientPort` used in development when no rules-worker /
 * Turnstile secret is available. It exercises the real domain rules (same
 * mutation, reroll and finalize functions the worker calls), but keeps the
 * snapshots in the browser tab instead of R2. Production wiring replaces this
 * with `SheetApiClient`; the store and UI are identical either way.
 */
export function createLocalSheetBackend(
  options: LocalSheetBackendOptions = {},
): SheetApiClientPort {
  const sessions = new Map<
    string,
    { sessionId: string; accessToken: string }
  >();
  const drafts = new Map<string, CharacterSheetDraft>();
  const draftHistories = new Map<string, LocalDraftHistory>();
  const now = options.clock ?? (() => new Date());

  function saveDraftHistory(draftId: string, draft: CharacterSheetDraft): void {
    let history = draftHistories.get(draftId);
    if (!history) {
      history = new Map();
      draftHistories.set(draftId, history);
    }
    history.set(draft.version, draft);
  }

  return {
    async createSession(): Promise<SheetSession> {
      const session: SheetSession = {
        sessionId: crypto.randomUUID(),
        accessToken: crypto.randomUUID(),
        expiresAt: new Date(now().getTime() + 120 * 60 * 1000).toISOString(),
      };
      sessions.set(session.sessionId, {
        sessionId: session.sessionId,
        accessToken: session.accessToken,
      });
      return session;
    },

    async getSession(
      sessionId: string,
      accessToken: string,
    ): Promise<SheetSessionView> {
      const session = sessions.get(sessionId);
      if (session === undefined || session.accessToken !== accessToken) {
        throw new Error("Session not found.");
      }
      return {
        sessionId,
        status: "ACTIVE",
        expiresAt: new Date(now().getTime() + 120 * 60 * 1000).toISOString(),
      };
    },

    async createDraft(
      _sessionId: string,
      _accessToken: string,
      snapshot: CharacterSheetDraft,
    ): Promise<CharacterSheetDraft> {
      const draft = validateDraft(snapshot);
      drafts.set(draft.draftId, draft);
      saveDraftHistory(draft.draftId, draft);
      return draft;
    },

    async getDraft(
      _sessionId: string,
      _accessToken: string,
      draftId: string,
    ): Promise<CharacterSheetDraft> {
      const draft = drafts.get(draftId);
      if (draft === undefined) {
        throw new Error("Draft not found.");
      }
      return draft;
    },

    async mutateDraft(
      _sessionId: string,
      _accessToken: string,
      draftId: string,
      mutation: DraftMutation,
    ): Promise<CharacterSheetDraft> {
      const current = drafts.get(draftId);
      if (current === undefined) {
        throw new Error("Draft not found.");
      }
      const mutated = applyDraftMutation(current, mutation);
      const committed = validateDraft(bumpDraftVersion(mutated));
      drafts.set(draftId, committed);
      saveDraftHistory(draftId, committed);
      return committed;
    },

    async rerollDraft(
      _sessionId: string,
      _accessToken: string,
      draftId: string,
      seed: string,
    ): Promise<SheetDraftRerollResponse> {
      const current = drafts.get(draftId);
      if (current === undefined) {
        throw new Error("Draft not found.");
      }
      const result = rerollLockedDraftValues(current, seed);
      const committed = validateDraft(bumpDraftVersion(result.draft));
      drafts.set(draftId, committed);
      saveDraftHistory(draftId, committed);
      return { draft: committed, rerolledKeys: result.rerolledKeys };
    },

    async confirmDraft(
      _sessionId: string,
      _accessToken: string,
      draftId: string,
    ): Promise<CharacterSheetDraft> {
      const current = drafts.get(draftId);
      if (current === undefined) {
        throw new Error("Draft not found.");
      }
      const confirmed = validateDraft(finalizeDraft(current));
      drafts.set(draftId, confirmed);
      saveDraftHistory(draftId, confirmed);
      return confirmed;
    },

    async undoDraft(
      _sessionId: string,
      _accessToken: string,
      draftId: string,
      expectedVersion: number,
    ): Promise<CharacterSheetDraft> {
      const current = drafts.get(draftId);
      if (current === undefined) {
        throw new Error("Draft not found.");
      }
      if (current.version !== expectedVersion) {
        throw new Error("The draft version does not match the expected version.");
      }
      if (current.confirmed === true) {
        throw new Error("The draft is already confirmed and is read-only.");
      }
      if (expectedVersion <= 1) {
        throw new Error("Cannot undo the initial draft version.");
      }

      const history = draftHistories.get(draftId);
      if (!history) {
        throw new Error("Draft history not found.");
      }
      const previousDraft = history.get(expectedVersion - 1);
      if (!previousDraft) {
        throw new Error("Previous draft version not found.");
      }

      const nextVersion = bumpDraftVersion(previousDraft);
      drafts.set(draftId, nextVersion);
      saveDraftHistory(draftId, nextVersion);
      return nextVersion;
    },
  };
}
