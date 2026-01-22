import React, { useMemo, useState, useEffect } from "react";
import PartySelector from "./PartySelector";
import OptionGrid from "./OptionGrid";

const pretty = (v) => String(v).replace(/_/g, " ");

export default function StepForm({
  enums,
  value,
  onChange,
  onDone,
  onBackToResponse,
}) {
  // value = draft fields object (party/support/likelihood/issue/notes)
  const [step, setStep] = useState(0);

  // Reset wizard position when the address changes / new draft starts
  useEffect(() => {
    setStep(0);
  }, []);

  const steps = useMemo(
    () => [
      {
        key: "party",
        title: "Political Party",
        render: () => (
          <PartySelector
            options={enums.party}
            value={value.party || null}
            onChange={(party) => onChange({ ...value, party })}
          />
        ),
        canNext: !!value.party,
      },
      {
        key: "support",
        title: "Strength of Support",
        render: () => (
          <OptionGrid
            options={enums.support}
            selected={value.support || null}
            onSelect={(support) => onChange({ ...value, support })}
          />
        ),
        canNext: !!value.support,
      },
      {
        key: "likelihood",
        title: "Likelihood to Vote",
        render: () => (
          <OptionGrid
            options={enums.likelihood}
            selected={value.likelihood || null}
            onSelect={(likelihood) => onChange({ ...value, likelihood })}
          />
        ),
        canNext: !!value.likelihood,
      },
      {
        key: "issue",
        title: "Most Important Issue",
        render: () => (
          <OptionGrid
            options={enums.issue}
            selected={value.issue || null}
            onSelect={(issue) => onChange({ ...value, issue })}
          />
        ),
        canNext: !!value.issue,
      },
      {
        key: "notes",
        title: "Notes",
        render: () => (
          <textarea
            rows={5}
            value={value.notes || ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            style={{ width: "100%", fontSize: 16, padding: 10 }}
            placeholder="Optional notes…"
          />
        ),
        canNext: true,
      },
    ],
    [enums, value, onChange]
  );

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 10 }}>{current.title}</h3>

      <div style={{ marginBottom: 16 }}>{current.render()}</div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => {
            if (step === 0) {
              onBackToResponse?.();
              return;
            }
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          ← Previous
        </button>

        {!isLast && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            disabled={!current.canNext}
          >
            Next →
          </button>
        )}

        {isLast && (
          <button type="button" onClick={onDone}>
            Save Response
          </button>
        )}
      </div>

      <div style={{ marginTop: 10, opacity: 0.6 }}>
        Step {step + 1} of {steps.length}
      </div>
    </div>
  );
}