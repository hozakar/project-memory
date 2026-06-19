/**
 * Validates that a memory record ID is safe to use as a filesystem path segment.
 * Uses an allow-list (not deny-list) to reject anything outside the known ID shape.
 *
 * Valid IDs: phase-YYYYMMDD-slug, DECISION-YYYY-MM-DD-slug, DISCUSSION-*, INSTRUCTION-*, ASSIGNMENT-*
 * Allowed chars: A-Z a-z 0-9 . _ -
 *
 * @param id    The ID string to validate.
 * @param label Optional label used in error messages (e.g. "phaseId", "decisionId").
 */
export function validateMemoryId(id: string, label?: string): void {
  if (!id || typeof id !== "string") {
    throw new Error(`Invalid memory ID: must be a non-empty string, got ${JSON.stringify(id)}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    const tag = label ? `${label} "${id}"` : `"${id}"`;
    throw new Error(
      `Invalid memory ID ${tag}: only alphanumeric characters, dots, underscores, and hyphens are allowed`
    );
  }
}
