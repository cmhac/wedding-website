"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/actions/shared";
import type { SetupStepView, SetupView } from "@/lib/setup/view";
import { Alert, Field } from "./primitives";
import { ActionForm } from "./forms/ActionForm";

/**
 * The admin setup guide (specs/007-admin-setup-guide): a banner while required
 * steps are open, a compact reminder after the person leaves, and a panel that
 * walks the steps. A native dialog gives the keyboard and screen-reader
 * behaviour (focus moves in, Escape closes, focus returns). The server decides
 * what is done; this only shows it.
 */

type GuideAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export type SetupActions = {
  leave: GuideAction;
  resume: GuideAction;
  skip: GuideAction;
  restart: GuideAction;
  recordPosition: GuideAction;
  confirm: GuideAction;
  unconfirm: GuideAction;
  checkAgain: GuideAction;
  saveValue: GuideAction;
  saveSmsSwitch: GuideAction;
};

function nextOpenAfter(
  steps: SetupStepView[],
  key: string | null,
): string | null {
  const from = key ? steps.findIndex((s) => s.key === key) : -1;
  const open = (s: SetupStepView) => s.status === "open";
  return steps.slice(from + 1).find(open)?.key ?? steps.find(open)?.key ?? null;
}

function Marker({ step }: { step: SetupStepView }) {
  if (step.status === "done") {
    return (
      <span className="setup-dot setup-dot-done" aria-hidden="true">
        ✓
      </span>
    );
  }
  return (
    <span
      className={`setup-dot ${step.skipped ? "setup-dot-skipped" : "setup-dot-open"}`}
      aria-hidden="true"
    />
  );
}

function statusWord(step: SetupStepView): string {
  if (step.status === "done") return "Done";
  return step.skipped ? "Skipped" : "Open";
}

export function SetupGuide({
  view,
  actions,
}: {
  view: SetupView | null;
  actions: SetupActions;
}) {
  const params = useSearchParams();
  const wantsOpen = params.get("setup") === "1";
  const [open, setOpen] = useState(wantsOpen);
  const [current, setCurrent] = useState<string | null>(
    view?.resumeKey ?? null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previous = useRef<Record<string, string>>({});

  // A link such as the navigation's "Setup guide" opens it with ?setup=1.
  // Adjusted while rendering, which React prefers to an effect for this.
  const [seenParam, setSeenParam] = useState(wantsOpen);
  if (wantsOpen !== seenParam) {
    setSeenParam(wantsOpen);
    if (wantsOpen) setOpen(true);
  }

  // Native dialog: modal where supported, a plain open attribute where not.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      closeRef.current?.focus();
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  // When the step being viewed becomes done, say so and move to the next one.
  useEffect(() => {
    if (!view) return;
    const before = previous.current;
    const now: Record<string, string> = {};
    for (const s of view.steps) now[s.key] = s.status;
    previous.current = now;
    if (!current) return;
    const step = view.steps.find((s) => s.key === current);
    if (step && step.status === "done" && before[current] === "open") {
      const next = nextOpenAfter(view.steps, current);
      setAnnouncement(
        next
          ? `${step.label} is done. Next: ${view.steps.find((s) => s.key === next)?.label}.`
          : `${step.label} is done. Setup is complete.`,
      );
      setCurrent(next);
    }
  }, [view, current]);

  if (!view) return null;

  const run = (action: GuideAction, entries: Record<string, string> = {}) =>
    startTransition(async () => {
      const data = new FormData();
      for (const [k, v] of Object.entries(entries)) data.append(k, v);
      await action(null, data);
    });

  const openRequired = view.steps
    .filter((s) => s.group === "required" && s.status === "open")
    .map((s) => s.key);

  const stopParam = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("setup")) {
      url.searchParams.delete("setup");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  };

  const openGuide = (opener?: HTMLElement | null) => {
    if (opener) openerRef.current = opener;
    if (view.mode === "compact") run(actions.resume);
    setCurrent(view.resumeKey);
    setOpen(true);
  };

  const leave = () => {
    run(actions.leave, {
      step: current ?? "",
      seen: openRequired.join(","),
    });
    setOpen(false);
    stopParam();
    openerRef.current?.focus();
  };

  const step = current ? view.steps.find((s) => s.key === current) : undefined;
  const done = view.requiredTotal - view.requiredOpen;
  const progress = `${done} of ${view.requiredTotal} required steps done`;

  const select = (key: string) => {
    setCurrent(key);
    run(actions.recordPosition, { step: key });
  };

  return (
    <>
      {view.mode === "full" ? (
        <section
          className="setup-banner alert alert-warn"
          role="status"
          aria-label="Setup"
        >
          <div className="setup-banner-text">
            <p className="setup-title">Setup isn’t finished: {progress}</p>
            <p>
              Until the rest are set, some features will not work. The guide
              walks you through each step.
            </p>
            <Segments view={view} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={(e) => openGuide(e.currentTarget)}
          >
            Start setup
          </button>
        </section>
      ) : null}
      {view.mode === "compact" ? (
        <section
          className="setup-compact alert alert-warn"
          role="status"
          aria-label="Setup"
        >
          <span className="setup-title">Setup paused</span>
          <span>
            {progress}
            {view.skippedCount > 0 ? `, ${view.skippedCount} skipped` : ""}
          </span>
          <span className="setup-compact-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => run(actions.restart)}
            >
              Restart
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={(e) => openGuide(e.currentTarget)}
            >
              Resume setup
            </button>
          </span>
        </section>
      ) : null}

      <dialog
        ref={dialogRef}
        className="setup-panel"
        aria-labelledby="setup-title"
        onCancel={(e) => {
          e.preventDefault();
          leave();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            leave();
          }
        }}
      >
        <div className="setup-head">
          <div>
            <h2 id="setup-title" className="setup-heading">
              Setup guide
            </h2>
            <p className="muted">
              {view.requiredOpen === 0
                ? `All ${view.requiredTotal} required steps done`
                : progress}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-quiet setup-close"
            aria-label="Close setup guide"
            onClick={leave}
          >
            ✕
          </button>
        </div>
        <Segments view={view} />

        {view.requiredOpen === 0 ? (
          <p className="alert alert-ok" role="status">
            <strong>Setup complete.</strong> Every required step is done.
            {view.recommendedOpen > 0
              ? ` ${view.recommendedOpen} recommended ${view.recommendedOpen === 1 ? "step is" : "steps are"} optional.`
              : ""}
          </p>
        ) : null}

        {(["required", "recommended"] as const).map((group) => (
          <div key={group}>
            <p className="setup-group">
              {group === "required" ? "Required" : "Recommended"}
            </p>
            <ol className="setup-steps">
              {view.steps
                .filter((s) => s.group === group)
                .map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      className="setup-step"
                      aria-current={s.key === current ? "step" : undefined}
                      onClick={() => select(s.key)}
                    >
                      <Marker step={s} />
                      <span className="setup-step-label">{s.label}</span>
                      <span className="setup-tag">{statusWord(s)}</span>
                    </button>
                  </li>
                ))}
            </ol>
          </div>
        ))}

        {step ? (
          <StepDetail
            key={step.key}
            step={step}
            view={view}
            actions={actions}
            run={run}
            onSkip={() => {
              run(actions.skip, { step: step.key });
              setCurrent(nextOpenAfter(view.steps, step.key));
            }}
          />
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        <div className="setup-foot">
          <button
            type="button"
            className="btn"
            onClick={() => run(actions.restart)}
          >
            Restart setup
          </button>
          <button type="button" className="btn" onClick={leave}>
            {view.requiredOpen === 0 ? "Close" : "Not now"}
          </button>
          <span className="muted small">Esc closes. Your place is saved.</span>
        </div>
      </dialog>
    </>
  );
}

function Segments({ view }: { view: SetupView }) {
  const required = view.steps.filter((s) => s.group === "required");
  return (
    <div className="setup-segments" aria-hidden="true">
      {required.map((s) => (
        <i
          key={s.key}
          className={
            s.status === "done" ? "setup-seg setup-seg-done" : "setup-seg"
          }
        />
      ))}
    </div>
  );
}

function StepDetail({
  step,
  view,
  actions,
  run,
  onSkip,
}: {
  step: SetupStepView;
  view: SetupView;
  actions: SetupActions;
  run: (action: GuideAction, entries?: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const isDone = step.status === "done";
  return (
    <section className="setup-detail" aria-labelledby={`step-${step.key}`}>
      <h3 id={`step-${step.key}`} className="setup-detail-title">
        {step.label}
      </h3>
      <p>{step.purpose}</p>
      {!isDone ? (
        <p className="setup-note">
          <strong>If you leave this unset:</strong> {step.ifUnset}
        </p>
      ) : null}

      {step.kind === "console" && step.form ? (
        <ConsoleForm step={step} view={view} actions={actions} />
      ) : null}

      {step.kind === "outside" ? (
        <Outside step={step} view={view} actions={actions} run={run} />
      ) : null}

      {step.kind === "manual" ? (
        <div className="setup-actions">
          {isDone ? (
            <>
              <p className="alert alert-ok">A staff member confirmed this.</p>
              <button
                type="button"
                className="btn"
                onClick={() => run(actions.unconfirm, { step: step.key })}
              >
                Undo
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => run(actions.confirm, { step: step.key })}
            >
              I’ve done this
            </button>
          )}
        </div>
      ) : null}

      {!isDone ? (
        <button type="button" className="btn btn-quiet" onClick={onSkip}>
          Skip this step
        </button>
      ) : null}
    </section>
  );
}

function ConsoleForm({
  step,
  view,
  actions,
}: {
  step: SetupStepView;
  view: SetupView;
  actions: SetupActions;
}) {
  const isDone = step.status === "done";
  const label = isDone ? "Change" : "Save and continue";
  const v = view.values;
  if (step.form === "event") {
    return view.events.length === 0 ? (
      <p className="alert alert-info">
        There are no events yet. Add the wedding on the Events page, then come
        back.
      </p>
    ) : (
      <ActionForm action={actions.saveValue} submitLabel={label}>
        {({ fieldErrors }) => (
          <>
            <input type="hidden" name="step" value="wedding_event" />
            <Field
              id="setup-event"
              label="Wedding event"
              error={fieldErrors.wedding_event_id}
            >
              <select
                id="setup-event"
                name="wedding_event_id"
                defaultValue={v.eventId}
              >
                <option value="" disabled>
                  Choose an event
                </option>
                {view.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.date ? `, ${e.date}` : " (no date yet)"}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </ActionForm>
    );
  }
  if (step.form === "card") {
    return (
      <ActionForm action={actions.saveValue} submitLabel={label}>
        {({ fieldErrors }) => (
          <>
            <input type="hidden" name="step" value="card_details" />
            <Field
              id="setup-place"
              label="Place line"
              error={fieldErrors.save_the_date_place}
            >
              <input
                id="setup-place"
                name="save_the_date_place"
                defaultValue={v.place}
                maxLength={200}
              />
            </Field>
            <Field
              id="setup-note"
              label="Note (optional)"
              error={fieldErrors.save_the_date_note}
            >
              <input
                id="setup-note"
                name="save_the_date_note"
                defaultValue={v.note}
                maxLength={300}
              />
            </Field>
          </>
        )}
      </ActionForm>
    );
  }
  if (step.form === "deadline") {
    return (
      <ActionForm action={actions.saveValue} submitLabel={label}>
        {({ fieldErrors }) => (
          <>
            <input type="hidden" name="step" value="rsvp_deadline" />
            <Field
              id="setup-deadline"
              label="Default RSVP deadline (Pacific time)"
              error={fieldErrors.default_rsvp_deadline}
            >
              <input
                id="setup-deadline"
                name="default_rsvp_deadline"
                type="datetime-local"
                defaultValue={v.deadline}
              />
            </Field>
          </>
        )}
      </ActionForm>
    );
  }
  return step.status === "done" ? (
    <p className="alert alert-ok">
      The RSVP is closed. Reopen it on the Settings page when invitations go
      out.
    </p>
  ) : (
    <ActionForm action={actions.saveValue} submitLabel="Close the RSVP">
      <input type="hidden" name="step" value="rsvp_closed" />
    </ActionForm>
  );
}

function Outside({
  step,
  view,
  actions,
  run,
}: {
  step: SetupStepView;
  view: SetupView;
  actions: SetupActions;
  run: (action: GuideAction, entries?: Record<string, string>) => void;
}) {
  const isDone = step.status === "done";
  const showSwitch = step.form === "sms" && view.values.smsConfigured;
  return (
    <>
      {!isDone && !showSwitch ? (
        <>
          <ol className="setup-how">
            <li>
              Open <strong>{step.where}</strong>. Nothing is typed into this
              page, so a secret never passes through it.
            </li>
            <li>
              Set{" "}
              {(step.envNames ?? []).map((name, i) => (
                <span key={name}>
                  {i > 0 ? ", " : ""}
                  <code>{name}</code>
                </span>
              ))}
              .
            </li>
            <li>
              Redeploy the site, then choose <strong>Check again</strong>.
            </li>
          </ol>
          {step.reason ? (
            <p className="alert alert-warn" role="status">
              {step.reason} Hosting changes only show after a redeploy. The full
              steps are in docs/manual-setup.md.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => run(actions.checkAgain)}
          >
            Check again
          </button>
        </>
      ) : null}
      {isDone && !showSwitch ? (
        <div className="setup-actions">
          <p className="alert alert-ok">This is set.</p>
          <button
            type="button"
            className="btn"
            onClick={() => run(actions.checkAgain)}
          >
            Check
          </button>
        </div>
      ) : null}
      {showSwitch ? (
        <ActionForm action={actions.saveSmsSwitch} submitLabel="Save">
          {() => (
            <label className="check">
              <input
                type="checkbox"
                name="sms_enabled"
                defaultChecked={view.values.smsEnabled}
                disabled={!step.canChange}
              />{" "}
              <span>
                <strong>Texting is on</strong>
                <br />
                <span className="muted">
                  {step.canChange
                    ? "Turning this on texts nobody by itself."
                    : "Only the couple can change this."}
                </span>
              </span>
            </label>
          )}
        </ActionForm>
      ) : null}
      {step.canChange || showSwitch ? null : (
        <Alert variant="info">Only the couple can change this step.</Alert>
      )}
    </>
  );
}
