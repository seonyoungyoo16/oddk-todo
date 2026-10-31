// These signals only require user review; they never split or rewrite the text.
export function shouldReviewTaskSplit(source: string, titles: string[]) {
  return titles.length !== 1 || /하고|그리고|한\s*뒤|한\s*후|\r?\n|[;•]/.test(source.trim());
}
