/**
 * Glasses Inc. 2026
 * Minimal tagged logger for the CustomLocations package.
 * Keeps the package dependency-free (no Utilities.lspkg import).
 */
export class Logger {
  /**
   * @param tag - Prefix for every line
   * @param enabled - When false only errors are printed
   * @param _useColors - Accepted for API compatibility with Utilities.lspkg's Logger; ignored
   */
  constructor(
    private readonly tag: string,
    private enabled: boolean = true,
    _useColors: boolean = true
  ) {}

  /** Alias of setEnabled (Utilities.lspkg Logger API). */
  setDebugEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /** Success messages print as INFO. */
  success(message: string): void {
    this.write("INFO", message)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  info(message: string): void {
    this.write("INFO", message)
  }

  debug(message: string): void {
    this.write("DEBUG", message)
  }

  warn(message: string): void {
    this.write("WARN", message)
  }

  /** Errors are always printed, even when the logger is disabled. */
  error(message: string): void {
    print(`${this.tag} | ERROR | ${message}`)
  }

  private write(level: string, message: string): void {
    if (!this.enabled) return
    print(`${this.tag} | ${level} | ${message}`)
  }
}
