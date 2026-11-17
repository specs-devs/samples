/**
 * SPECS Inc. 2027
 * APITested – checks every API / web service this project uses, once, on awake.
 *
 * Generated per project: it only tests what the project actually calls. Each check logs
 * "[APITested] PASS|FAIL|SKIP <check> – <detail>" and the summary goes to the optional Text.
 * Credentials are read from the components the project already uses for them.
 */

type Result = {check: string; status: "PASS" | "FAIL" | "SKIP"; detail: string}

@component
export class APITested extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">APITested – self-test of the API and web calls of this project</span><br/><span style="color: #94A3B8; font-size: 11px;">Runs once on awake; results in the Logger (and the optional Text). Turn off runOnAwake to keep it quiet.</span>')
  @ui.separator

  @input
  @hint("Run the checks when the Lens starts")
  runOnAwake: boolean = true

  @input
  @allowUndefined
  @hint("Optional Text that shows the summary")
  summaryText: Text

  @input
  @hint("Seconds before a check that hasn't answered counts as failed")
  timeout: number = 20

  private results: Result[] = []
  private pending = 0

  onAwake(): void {
    if (this.runOnAwake) {
      this.createEvent("OnStartEvent").bind(() => this.runAll())
    }
  }

  /** Runs every check again (also callable from a button). */
  public runAll(): void {
    this.results = []
    this.pending = 0
    print("[APITested] running checks for this project…")
    this.skip("No fixed endpoints", "this project connects to addresses you set in its inputs")
    this.finishIfDone()
  }

  // ── checks ────────────────────────────────────────────────────────────────
  // ── plumbing ──────────────────────────────────────────────────────────────
  private check(name: string, run: () => Promise<string>): void {
    this.pending++
    let done = false
    const timer = this.createEvent("DelayedCallbackEvent")
    timer.bind(() => {
      if (!done) {
        done = true
        this.record(name, "FAIL", "no answer after " + this.timeout + " s")
      }
    })
    timer.reset(this.timeout)
    run()
      .then((detail) => {
        if (!done) {
          done = true
          this.record(name, "PASS", detail)
        }
      })
      .catch((error) => {
        if (!done) {
          done = true
          this.record(name, "FAIL", "" + (error?.message || error))
        }
      })
  }

  private skip(name: string, why: string): void {
    this.record(name, "SKIP", why, false)
  }

  private record(check: string, status: "PASS" | "FAIL" | "SKIP", detail: string, async: boolean = true): void {
    this.results.push({check, status, detail})
    print(`[APITested] ${status} ${check} – ${detail}`)
    if (async && status !== "SKIP" && check !== "RSG tokens") {
      this.pending--
      this.finishIfDone()
    }
  }

  private finishIfDone(): void {
    if (this.pending > 0) return
    const failed = this.results.filter((r) => r.status === "FAIL").length
    const passed = this.results.filter((r) => r.status === "PASS").length
    const summary = `API self-test: ${passed} passed, ${failed} failed, ${this.results.length - passed - failed} skipped`
    print("[APITested] " + summary)
    if (this.summaryText) {
      this.summaryText.text = summary + "\n" + this.results.map((r) => r.status + "  " + r.check).join("\n")
    }
  }
}
