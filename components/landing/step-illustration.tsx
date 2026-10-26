import { Icon } from "@/components/ui/icon";

export type StepVariant = "collect" | "choose" | "complete";

export function StepIllustration({ variant }: { variant: StepVariant }) {
  return (
    <div className={`step-art step-art-${variant}`} aria-hidden="true">
      {variant === "collect" && (
        <div className="step-art-stack">
          {[0, 1, 2].map((row) => (
            <div className="step-art-row" key={row}>
              <span className="step-art-dot" />
              <span className="step-art-lines">
                <i />
                <i />
              </span>
            </div>
          ))}
          <span className="step-art-add">
            <Icon name="plus" />
          </span>
        </div>
      )}
      {variant === "choose" && (
        <div className="step-art-selection">
          {[0, 1, 2].map((row) => (
            <div
              className={`step-art-row${row === 1 ? " selected" : ""}`}
              key={row}
            >
              <span className="step-art-dot">
                {row === 1 && <Icon name="check" />}
              </span>
              <span className="step-art-lines">
                <i />
                <i />
              </span>
            </div>
          ))}
          <svg className="step-art-cursor" viewBox="0 0 32 36">
            <path
              d="M5 3 27 22l-11 1-5 10Z"
              fill="#1d1d1f"
              stroke="white"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {variant === "complete" && (
        <div className="step-art-completion">
          <svg className="step-art-ring" viewBox="0 0 144 144">
            <circle
              cx="72"
              cy="72"
              r="62"
              fill="none"
              stroke="#e1e8f4"
              strokeWidth="2"
            />
            <circle
              cx="72"
              cy="72"
              r="62"
              fill="none"
              stroke="#84adeb"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="290 390"
              transform="rotate(-90 72 72)"
            />
          </svg>
          <span className="step-art-done">
            <Icon name="check" />
          </span>
          <span className="step-art-spark spark-one" />
          <span className="step-art-spark spark-two" />
        </div>
      )}
    </div>
  );
}
