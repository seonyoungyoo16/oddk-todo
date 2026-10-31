export type DailyQuote = Readonly<{
  id: string;
  text: string;
  author: string;
  work: string;
  passage: string;
  sourceUrl: string;
  translated: boolean;
  topic: "development";
}>;

// Short Korean renderings of verified software-development source passages.
// Do not mix general inspiration into this development-only collection.
const sources = {
  peters: { author: "팀 피터스", work: "The Zen of Python", sourceUrl: "https://peps.python.org/pep-0020/" },
  pike: { author: "롭 파이크", work: "Go Proverbs", sourceUrl: "https://go-proverbs.github.io/" },
  pragmatic: { author: "데이비드 토머스 · 앤드루 헌트", work: "실용주의 프로그래머", sourceUrl: "https://pragprog.com/tips/" },
  dijkstra: { author: "에츠허르 다익스트라", work: "EWD498", sourceUrl: "https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD498.html" },
  metz: { author: "샌디 메츠", work: "The Wrong Abstraction", sourceUrl: "https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction" },
  perlis: { author: "앨런 펄리스", work: "Epigrams in Programming", sourceUrl: "https://www.cs.yale.edu/homes/perlis-alan/quotes.html" },
  hoare: { author: "토니 호어", work: "The Emperor’s Old Clothes", sourceUrl: "https://noncombatant.org/hoare-emperors-old-clothes-turing-award/" },
  raymond: { author: "에릭 S. 레이먼드", work: "유닉스 프로그래밍의 기술", sourceUrl: "https://www.catb.org/esr/writings/taoup/html/ch01s06.html" },
  martin: { author: "로버트 C. 마틴", work: "Software Craftsmanship Is About…", sourceUrl: "https://blog.cleancoder.com/uncle-bob/2011/01/17/software-craftsmanship-is-about.html" },
  turing: { author: "앨런 튜링", work: "계산 기계와 지능", sourceUrl: "https://www.cs.sfu.ca/~vaughan/teaching/889/papers/turing1950.html" },
  hamilton: { author: "마거릿 해밀턴", work: "MIT News 아폴로 소프트웨어 회고", sourceUrl: "https://news.mit.edu/2016/scene-at-mit-margaret-hamilton-apollo-code-0817" },
  spolsky: { author: "조엘 스폴스키", work: "Things You Should Never Do, Part I", sourceUrl: "https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/" },
  stroustrup: { author: "비야네 스트로스트루프", work: "Bjarne Stroustrup Quotes", sourceUrl: "https://www.stroustrup.com/quotes.html" },
  knuth: { author: "도널드 크누스", work: "Structured Programming with go to Statements", sourceUrl: "https://gwern.net/doc/cs/algorithm/1974-knuth.pdf#page=8" },
  sicp: { author: "해럴드 애벌슨 · 제럴드 제이 서스먼 · 줄리 서스먼", work: "프로그램의 구조와 해석", sourceUrl: "https://web.mit.edu/6.001/6.037/sicp.pdf#page=22" },
} as const;

function entry(id: string, text: string, source: keyof typeof sources, passage: string, override?: { work: string; sourceUrl: string }): DailyQuote {
  return { id, text, ...sources[source], passage, ...override, translated: true, topic: "development" };
}

// Interleave authors so consecutive days, including the cycle boundary, differ.
export const DAILY_QUOTES: readonly DailyQuote[] = [
  entry("peters-readable", "가독성은 중요하다.", "peters", "가독성에 관한 원칙"),
  entry("pike-clear", "기교보다 명확함이 낫다.", "pike", "명확함에 관한 잠언"),
  entry("pragmatic-craft", "자신의 기술에 애정을 가져라.", "pragmatic", "팁 1"),
  entry("dijkstra-tools", "우리가 쓰는 도구는 사고 습관과 사고 능력에 깊은 영향을 준다.", "dijkstra", "도구와 사고에 관한 단락"),
  entry("metz-abstraction", "중복은 잘못된 추상화보다 훨씬 저렴하다.", "metz", "글의 핵심 명제"),
  entry("perlis-remove", "복잡함을 무시하는 사람도, 견디는 사람도 있다. 뛰어난 사람은 그것을 없앤다.", "perlis", "경구 58"),
  entry("peters-explicit", "명시적인 것이 암시적인 것보다 낫다.", "peters", "명시성에 관한 원칙"),
  entry("hoare-reliability", "신뢰성을 얻으려면 단순함을 끝까지 추구해야 한다.", "hoare", "신뢰성의 대가에 관한 단락"),
  entry("pragmatic-think", "자신이 하는 일을 생각하라.", "pragmatic", "팁 2"),
  entry("raymond-modular", "명확한 인터페이스로 연결되는 단순한 부품을 만들어라.", "raymond", "모듈성의 규칙"),
  entry("martin-fast", "빠르게 가는 유일한 방법은 제대로 가는 것이다.", "martin", "일정을 지키는 방법에 관한 항목"),
  entry("pike-copy", "작은 복제는 작은 의존성보다 낫다.", "pike", "복제와 의존성에 관한 잠언"),
  entry("turing-ahead", "멀리 내다볼 수는 없어도, 눈앞에 해야 할 일이 많다는 것은 알 수 있다.", "turing", "논문의 마지막 문장"),
  entry("pragmatic-reuse", "재사용하기 쉽게 만들어라.", "pragmatic", "팁 16"),
  entry("peters-simple", "단순한 것이 복잡한 것보다 낫다.", "peters", "단순성에 관한 원칙"),
  entry("hamilton-pioneer", "우리에게는 개척자가 되는 것 외에 다른 선택이 없었다.", "hamilton", "아폴로 개발 경험을 회고한 발언"),
  entry("spolsky-read", "코드는 쓰는 것보다 읽는 것이 더 어렵다.", "spolsky", "기존 코드 재작성에 관한 글"),
  entry("stroustrup-future", "미래를 위해 만들어라. 그 안에서 살아가야 하니까.", "stroustrup", "미래를 위한 교육과 개발에 관한 발언"),
  entry("perlis-simplicity", "단순함은 복잡함에 앞서 오지 않는다. 복잡함을 거친 뒤에 온다.", "perlis", "경구 31"),
  entry("pike-error-value", "오류도 값이다.", "pike", "오류에 관한 잠언"),
  entry("pragmatic-windows", "깨진 창문을 방치하지 말라.", "pragmatic", "팁 5"),
  entry("dijkstra-testing", "테스트로 버그가 있음을 보여줄 수는 있지만, 없음을 증명할 수는 없다.", "dijkstra", "프로그램 테스트에 관한 단락", { work: "EWD273", sourceUrl: "https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD273.html" }),
  entry("peters-errors", "오류를 조용히 넘기지 말라.", "peters", "오류 처리에 관한 원칙"),
  entry("raymond-repair", "실패해야 한다면, 가능한 한 빨리 분명하게 실패하라.", "raymond", "복구의 규칙"),
  entry("pragmatic-dry", "같은 것을 반복하지 말라.", "pragmatic", "팁 15, DRY"),
  entry("hoare-design", "결함이 없다는 것이 분명할 만큼 단순하게 설계하라.", "hoare", "소프트웨어 설계의 두 가지 방법 중 첫째"),
  entry("knuth-optimization", "성급한 최적화는 모든 악의 근원이다.", "knuth", "1974년 논문 268쪽, 효율성에 관한 단락"),
  entry("sicp-readers", "프로그램은 사람이 읽도록 써야 하며, 컴퓨터의 실행은 부차적인 목적이다.", "sicp", "초판 서문"),
  entry("peters-ambiguity", "모호하다면, 추측하려는 유혹을 거부하라.", "peters", "모호함에 관한 원칙"),
  entry("pike-handle", "오류를 확인하는 데 그치지 말고, 제대로 처리하라.", "pike", "오류 처리에 관한 잠언"),
];

/** The caller supplies the actual Seoul day, never the selected planning date. */
export function quoteForDate(date: string): DailyQuote | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return null;
  const instant = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return null;
  const day = Math.floor(instant.getTime() / 86_400_000);
  return DAILY_QUOTES[((day % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length];
}
