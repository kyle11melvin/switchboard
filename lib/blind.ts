// Blind judging.
//
// A judge that can see which answer is its own tends to favor it. So the judge gets the answers in a
// shuffled order, labelled only "Answer A", "Answer B"… and the real names are put back afterwards,
// before the verdict is shown.

export interface JudgedAnswer { label: string; text: string; citations?: string[] }

const LETTERS = "ABCDEFGH";
// "ChatGPT (gpt-5)" -> "ChatGPT"
export const shortName = (label: string) => label.replace(/\s*\(.*\)\s*$/, "").trim() || label;

export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function blind(answers: JudgedAnswer[], random?: () => number) {
  const order = shuffle(answers.slice(0, LETTERS.length), random);
  const names: Record<string, string> = {};
  const blinded = order.map((a, i) => {
    names[LETTERS[i]] = shortName(a.label);
    return { letter: LETTERS[i], text: scrub(a.text, shortName(a.label)), citations: a.citations };
  });
  return { blinded, names };
}

// An answer that introduces itself ("As Claude, I…") would give the game away.
function scrub(text: string, name: string) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b(as|I am|I'm|this is)\\s+${n}\\b`, "gi"), "$1 this model");
}

// Put the real names back: "Answer B", "Answers A and C", "Answers A, B, and C".
export function unblind(verdict: string, names: Record<string, string>): string {
  const letters = Object.keys(names).join("");
  if (!letters) return verdict;
  const one = `[${letters}]`;
  const list = new RegExp(`\\bAnswers?\\s+(${one}(?:\\s*(?:,\\s*and|,|and|&|/)\\s*${one})*)(?![A-Za-z0-9])`, "g");
  return verdict.replace(list, (_m, group: string) => group.replace(new RegExp(`${one}(?![a-z])`, "g"), (l) => names[l] ?? l));
}
