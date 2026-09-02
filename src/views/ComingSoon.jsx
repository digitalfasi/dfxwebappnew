import { Card } from "../components/ui/card";

export default function ComingSoon({ name }) {
  return (
    <div className="mx-auto max-w-[600px] pt-16">
      <Card className="p-14 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h12l4 6-10 12L2 9l4-6z" /><path d="M2 9h20" />
          </svg>
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">{name}</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm text-muted">
          This module is part of the full Aurum suite. Wire it to your backend service when the API is ready.
        </p>
      </Card>
    </div>
  );
}
