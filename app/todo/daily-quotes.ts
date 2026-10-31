export type DailyQuote = Readonly<{
  id: string;
  text: string;
  author: string;
  work: string;
  passage: string;
  sourceUrl: string;
  translated: boolean;
}>;

// Korean renderings are our own, not excerpts from a modern Korean edition.
// Source locations and editorial rules are recorded in docs/DAILY-QUOTES.md.
const sources = {
  laozi: { author: "노자", work: "도덕경", sourceUrl: "https://ctext.org/dao-de-jing/zh", translated: true },
  emerson: { author: "랠프 월도 에머슨", work: "자기 신뢰", sourceUrl: "https://www.gutenberg.org/files/16643/16643-h/16643-h.htm", translated: true },
  confucius: { author: "공자", work: "논어", sourceUrl: "https://ctext.org/analects", translated: true },
  thoreau: { author: "헨리 데이비드 소로", work: "월든", sourceUrl: "https://www.gutenberg.org/files/205/205-h/205-h.htm", translated: true },
  marcus: { author: "마르쿠스 아우렐리우스", work: "명상록", sourceUrl: "https://classics.mit.edu/Antoninus/meditations.html", translated: true },
  allen: { author: "제임스 앨런", work: "사람은 생각하는 대로 된다", sourceUrl: "https://www.gutenberg.org/files/4507/4507-h/4507-h.htm", translated: true },
  epictetus: { author: "에픽테토스", work: "엥케이리디온", sourceUrl: "https://www.gutenberg.org/cache/epub/45109/pg45109-images.html", translated: true },
  keller: { author: "헬렌 켈러", work: "낙관주의", sourceUrl: "https://www.gutenberg.org/files/31622/31622-h/31622-h.htm", translated: true },
  yoon: { author: "윤동주", work: "쉽게 씌어진 시", sourceUrl: "https://ko.wikisource.org/wiki/쉽게_씌어진_시", translated: false },
} as const;

function entry(id: string, text: string, source: keyof typeof sources, passage: string, sourceUrl?: string): DailyQuote {
  return { id, text, ...sources[source], passage, ...(sourceUrl ? { sourceUrl } : {}) };
}

// Interleave authors so consecutive days, including the cycle boundary, differ.
export const DAILY_QUOTES: readonly DailyQuote[] = [
  entry("laozi-step", "천 리의 길도 발밑의 한 걸음에서 시작된다.", "laozi", "64장"),
  entry("emerson-trust", "자신을 믿어라. 모든 마음은 그 믿음에 울린다.", "emerson", "자기 신뢰"),
  entry("confucius-practice", "배우고 때때로 익히면, 또한 기쁘지 않은가.", "confucius", "학이 1장", "https://ctext.org/analects/xue-er"),
  entry("thoreau-dream", "꿈꾸는 방향으로 자신 있게 나아가고, 상상한 삶을 살기 위해 힘써라.", "thoreau", "결론"),
  entry("marcus-obstacle", "길을 가로막는 것에서도, 앞으로 나아갈 도움을 찾을 수 있다.", "marcus", "5권 20절", "https://classics.mit.edu/Antoninus/meditations.5.five.html"),
  entry("allen-vision", "마음속에 그린 모습과 이상을 소중히 간직하라.", "allen", "Visions and Ideals"),
  entry("epictetus-control", "우리 뜻대로 할 수 있는 일과, 그럴 수 없는 일을 구별하라.", "epictetus", "1장"),
  entry("keller-hope", "낙관은 성취로 이끄는 믿음이다. 희망 없이는 아무것도 이룰 수 없다.", "keller", "제3부"),
  entry("laozi-small", "어려운 일은 쉬울 때 풀고, 큰일은 작은 데서 시작하라.", "laozi", "63장"),
  entry("emerson-peace", "내게 평온을 가져다줄 수 있는 사람은 나 자신이다.", "emerson", "자기 신뢰"),
  entry("confucius-reflect", "배우기만 하고 생각하지 않으면 막막하고, 생각만 하고 배우지 않으면 위태롭다.", "confucius", "위정 15장", "https://ctext.org/analects/wei-zheng"),
  entry("thoreau-pace", "남과 보조가 맞지 않더라도, 자신에게 들리는 박자에 맞춰 걸어가라.", "thoreau", "결론"),
  entry("marcus-be", "좋은 사람이 어떠해야 하는지 말하는 데 그치지 말고, 그런 사람이 되어라.", "marcus", "10권 16절", "https://classics.mit.edu/Antoninus/meditations.10.ten.html"),
  entry("allen-purpose", "생각이 목적과 이어질 때, 의미 있는 성취가 시작된다.", "allen", "Thought and Purpose"),
  entry("epictetus-judgment", "우리를 흔드는 것은 사건 자체보다, 그 사건을 바라보는 판단이다.", "epictetus", "5장"),
  entry("yoon-lamp", "등불을 밝혀 어둠을 조금 내몰고", "yoon", "시의 한 구절"),
  entry("laozi-self", "남을 이기는 데는 힘이 필요하지만, 자신을 이기는 사람이 강하다.", "laozi", "33장"),
  entry("emerson-work", "자신의 일을 하라. 그 일을 통해 스스로를 더 단단하게 만들 수 있다.", "emerson", "자기 신뢰"),
  entry("confucius-learn", "세 사람이 함께 길을 가면, 그 안에 반드시 내가 배울 스승이 있다.", "confucius", "술이 22장", "https://ctext.org/analects/shu-er"),
  entry("thoreau-awake", "우리가 깨어 있는 날에야 비로소 새벽이 밝아온다.", "thoreau", "결론"),
  entry("marcus-return", "모든 일을 뜻대로 하지 못했다고 낙담하지 말라. 다시 돌아와 시작하면 된다.", "marcus", "5권 9절", "https://classics.mit.edu/Antoninus/meditations.5.five.html"),
  entry("allen-calm", "마음의 평정은 지혜가 지닌 아름다운 보석 가운데 하나다.", "allen", "Serenity"),
  entry("epictetus-consider", "무슨 일이든 앞서 필요한 것과 뒤따를 결과를 살핀 다음 시작하라.", "epictetus", "29장"),
  entry("laozi-finish", "마무리할 때도 처음처럼 신중하라.", "laozi", "64장"),
  entry("emerson-original", "자기 자신으로 서라. 남을 흉내 내지 말라.", "emerson", "자기 신뢰"),
  entry("confucius-correct", "잘못하고도 고치지 않는 것, 그것이 잘못이다.", "confucius", "위령공 30장", "https://ctext.org/analects/wei-ling-gong/zh"),
  entry("thoreau-truth", "사랑보다, 돈보다, 명성보다, 나에게 진실을 달라.", "thoreau", "결론"),
  entry("marcus-within", "안으로 눈을 돌려라. 좋은 것의 샘은 네 안에 있다.", "marcus", "7권 59절", "https://classics.mit.edu/Antoninus/meditations.7.seven.html"),
  entry("allen-strength", "자기 절제는 힘이고, 바른 생각은 다스림이며, 평정은 능력이다.", "allen", "Serenity"),
  entry("epictetus-accept", "모든 일이 내 뜻대로 되기를 바라기보다, 일어나는 일을 받아들이는 법을 배워라.", "epictetus", "8장"),
];

/** The caller supplies the actual Seoul day, never the selected planning date. */
export function quoteForDate(date: string): DailyQuote | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return null;
  const instant = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return null;
  const day = Math.floor(instant.getTime() / 86_400_000);
  return DAILY_QUOTES[((day % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length];
}
