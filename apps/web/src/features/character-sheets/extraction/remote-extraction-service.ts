import {
  CharacterSheetDraftSchema,
  type CharacterSheetDraft,
} from "@repo/character-sheet-draft";
import { CHARACTER_SHEET_API_PREFIX } from "../api/sheet-api-types";
import { normalizeImageToJpeg, renderPdfPageImage } from "./pdf-page-images";
import type {
  ExtractSheetDocumentInput,
  SheetDocumentExtractionService,
} from "./extraction-service";

export interface RemoteSheetDocumentExtractionOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Same-origin transport adapter for the temporary Worker extraction endpoint.
 * It sends the original file as multipart data and validates the returned draft
 * before it can enter the authoring store.
 */
export function createRemoteSheetDocumentExtractionService(
  options: RemoteSheetDocumentExtractionOptions = {},
): SheetDocumentExtractionService {
  const baseUrl = options.baseUrl ?? CHARACTER_SHEET_API_PREFIX;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async extractSheetDocument({
      sessionId,
      accessToken,
      file,
    }): Promise<CharacterSheetDraft> {
      if (accessToken === undefined || file.blob === undefined) {
        throw new Error("The uploaded document cannot be sent for extraction.");
      }
      const form = new FormData();
      const page =
        file.mimeType === "application/pdf"
          ? await renderPdfPageImage(file.blob, file.sheetStartPage)
          : await normalizeImageToJpeg(file.blob);
      form.append("page", page, "character-sheet-page.jpg");
      const response = await fetchImpl(
        `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/extraction`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          body: form,
        },
      );
      if (!response.ok) {
        throw new Error(await extractionErrorMessage(response));
      }
      const parsed = CharacterSheetDraftSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error(
          "The extraction service returned an invalid character sheet.",
        );
      }
      return parsed.data;
    },
  };
}

async function extractionErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // Fall through to the user-safe generic message.
  }
  return "The document could not be extracted. Please try again.";
}
