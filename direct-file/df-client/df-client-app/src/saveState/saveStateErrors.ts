/**
 * Errors raised while reading or writing a save file / device save.
 *
 * Messages carry a code only. They never include fact values, file contents or the passphrase, so they are safe to
 * show in the UI or to surface in an error boundary.
 */
export type SaveStateErrorCode =
  | `invalid-file`
  | `unsupported-version`
  | `invalid-facts`
  | `passphrase-required`
  | `passphrase-too-short`
  | `decrypt-failed`
  | `unsupported-encryption`
  | `crypto-unavailable`
  | `storage-unavailable`
  | `no-device-save`;

export class SaveStateError extends Error {
  readonly code: SaveStateErrorCode;

  constructor(code: SaveStateErrorCode) {
    super(`save-state: ${code}`);
    this.name = `SaveStateError`;
    this.code = code;
  }
}
