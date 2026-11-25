import { useId, type ReactNode } from "react";

export function InfoButton({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <>
      <button className={`info ${className}`} type="button" popoverTarget={id} aria-label={`About ${label}`}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="4.6" r="1" fill="currentColor" />
        </svg>
      </button>
      <div className="def" id={id} popover="auto">{children}</div>
    </>
  );
}

// A stat name that opens its definition, for strips and tables.
export function DefButton({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <button className="def-name" type="button" popoverTarget={id}>{label}</button>
      <div className="def" id={id} popover="auto">{children}</div>
    </>
  );
}

export function SectionHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="head">
      <h2 id={id}>{title}</h2>
      <InfoButton label={title}>{children}</InfoButton>
    </div>
  );
}
