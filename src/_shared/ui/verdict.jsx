/** The profit/loss WORD, and the one place its wording lives.
 *
 *  Shared because two screens must never disagree about it. New Sale shows it
 *  while the bill is being priced; Sales History shows it on the finished
 *  invoice. They are the same judgement about the same bill, and a second copy
 *  of this map would drift the way the two tunch readers once did.
 *
 *  This is what a STAFF user sees where an Admin sees rupees. Whether a bill
 *  makes or loses money is something the person raising it has to know; what
 *  the store earns on it is not theirs to see.
 */
export const VERDICT = {
  // No percentage in these notes. They were welded at 11, which is only this
  // shop's floor on a 4% tunch lot - the floors move with the lot and with the
  // store's running cost. Staff are not shown the bands at all, so a number
  // here could not be checked against anything.
  PROFIT:     { word: "PROFIT",     line: "border-emerald-200 bg-emerald-50",   text: "text-emerald-700", note: "Gold profit intact" },
  BREAK_EVEN: { word: "BREAK EVEN", line: "border-amber-200 bg-amber-50",       text: "text-amber-700",   note: "Margin being eaten" },
  LOSS:       { word: "LOSS",       line: "border-danger-line bg-danger-soft",  text: "text-danger",      note: "Costs not recovered" },
};

export const PnlWordCard = ({ label, verdict }) => {
  const v = VERDICT[verdict] || VERDICT.BREAK_EVEN;
  return (
    <div className={`rounded-xl border p-3 text-center ${v.line}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider opacity-70 ${v.text}`}>{label}</div>
      <div className={`mt-0.5 text-base font-extrabold ${v.text}`}>{v.word}</div>
      <div className={`text-[10px] font-semibold opacity-80 ${v.text}`}>{v.note}</div>
    </div>
  );
};
