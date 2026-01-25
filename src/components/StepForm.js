import { useState } from "react";
import OptionGrid from "./OptionGrid";
import PartySelector from "./PartySelector";

export default function StepForm({
  enums,
  value,
  onChange,
  onBackToResponse,
  onDone,
}) {
  const steps = [
    "party",
    "support",
    "likelihood",
    "issue",
    "notes",
  ];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  function next() {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onDone();
    }
  }

  function prev() {
    if (stepIndex === 0) {
      onBackToResponse();
    } else {
      setStepIndex(stepIndex - 1);
    }
  }

  return (
    <div>
      {step === "party" && (
        <PartySelector
          options={enums.party}
          value={value.party}
          onChange={(v) => onChange({ party: v })}
        />
      )}

      {step === "support" && (
        <OptionGrid
          title="Strength of Support"
          options={enums.support}
          selected={value.support}
          onSelect={(v) => onChange({ support: v })}
        />
      )}

      {step === "likelihood" && (
        <OptionGrid
          title="Likelihood to Vote"
          options={enums.likelihood}
          selected={value.likelihood}
          onSelect={(v) => onChange({ likelihood: v })}
        />
      )}

      {step === "issue" && (
        <OptionGrid
          title="Most Important Issue"
          options={enums.issue}
          selected={value.issue}
          onSelect={(v) => onChange({ issue: v })}
        />
      )}

      {step === "notes" && (
        <div>
          <h3>Notes</h3>
          <textarea
            rows={4}
            value={value.notes || ""}
            onChange={(e) => onChange({ notes: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button onClick={prev}>← Previous</button>{" "}
        <button onClick={next}>
          {stepIndex === steps.length - 1 ? "Save" : "Next →"}
        </button>
      </div>
    </div>
  );
}