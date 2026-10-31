# 오늘의 개발 명언

대시보드 상단에 **개발 관련 문장만** 표시한다. 가독성·설계·테스트·오류 처리·개선·개척에 관한 짧은 한글 문장과 저자·작품명·원문 링크를 함께 보여준다. 일반 인생 명언은 섞지 않는다. 애니메이션이나 새 문장 뽑기 버튼은 두지 않는다.

## 날짜와 선택

- 실제 한국 날짜(`koreanToday`)를 사용한다. 선택한 계획 날짜나 계정 데이터에는 연결하지 않는다.
- 같은 날에는 새로고침하거나 기기를 바꾸어도 같은 문장이 나온다. 현재 앱의 날짜 구독은 매분과 탭 복귀 시 갱신한다.
- UTC 기준 날짜의 일련번호로 30개 문장을 순환한다. 30일 동안 중복이 없고, 다음 순환 경계에서도 같은 저자가 연달아 나오지 않는다.
- 빈 서버 날짜에는 표시하지 않아 서버/브라우저의 첫 렌더를 일치시킨다. 외부 API 요청, API 키, 저장소 쓰기 또는 새 동기화 필드는 없다. 문장은 오프라인에서도 읽을 수 있다.
- 현재 로컬 화면의 `dashboard` 및 기존 공개 화면의 `alpen`/`stats`에서 표시한다. 다른 화면에서는 렌더하지 않는다. 최신 로컬 대시보드의 미커밋 개편은 이 변경에 포함하지 않는다.

## 원문과 편집 기준

2026-10-31에 아래 원문에서 구절과 위치를 대조했다. 개발자의 글, 원 논문, 공식 언어 문서, 출판사가 공개한 발췌문과 인터뷰 기록을 사용한다. 현대 한국어 번역서의 문장을 복제하지 않고 짧게 새로 옮겨 UI에 **원문 의역**으로 표시한다. 저자·작품명 링크의 접근성 이름에는 원문 위치도 포함한다. 논문 원문을 옮겨 놓은 대학·아카이브·전사본도 원 논문을 직접 대조하는 자료로 사용했다.

| 저자 | 원문 | 사용 위치 |
| --- | --- | --- |
| 팀 피터스 | [PEP 20 — The Zen of Python](https://peps.python.org/pep-0020/) | 가독성, 명시성, 단순성, 오류, 모호함에 관한 짧은 원칙 |
| 롭 파이크 | [Go Proverbs](https://go-proverbs.github.io/) | 명확함, 작은 복제와 의존성, 오류 값, 오류 처리 |
| 데이비드 토머스·앤드루 헌트 | [실용주의 프로그래머 공식 팁](https://pragprog.com/tips/) | 팁 1, 2, 5, 15, 16 |
| 에츠허르 다익스트라 | [EWD498](https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD498.html), [EWD273](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD273.html) | 도구가 사고에 미치는 영향, 테스트의 한계 |
| 샌디 메츠 | [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) | 잘못된 추상화와 중복에 관한 핵심 명제 |
| 앨런 펄리스 | [Epigrams in Programming](https://www.cs.yale.edu/homes/perlis-alan/quotes.html) | 경구 31, 58 |
| 토니 호어 | [The Emperor’s Old Clothes](https://noncombatant.org/hoare-emperors-old-clothes-turing-award/) | 신뢰성의 대가와 설계의 두 가지 방법 중 첫째 |
| 에릭 S. 레이먼드 | [유닉스 프로그래밍의 기술 1.6](https://www.catb.org/esr/writings/taoup/html/ch01s06.html) | 모듈성의 규칙, 복구의 규칙. 본문 페이지가 일시적으로 지연되어 원문 검색 색인과 같은 책의 공개 목차/규칙 목록도 대조했다. |
| 로버트 C. 마틴 | [Software Craftsmanship Is About…](https://blog.cleancoder.com/uncle-bob/2011/01/17/software-craftsmanship-is-about.html) | 일정을 지키는 방법에 관한 항목 |
| 앨런 튜링 | [Computing Machinery and Intelligence](https://www.cs.sfu.ca/~vaughan/teaching/889/papers/turing1950.html) | 1950년 논문의 마지막 문장 |
| 마거릿 해밀턴 | [MIT News 아폴로 소프트웨어 회고](https://news.mit.edu/2016/scene-at-mit-margaret-hamilton-apollo-code-0817) | 2009년 회고를 인용한 2016년 기록, 개척자에 관한 발언 |
| 조엘 스폴스키 | [Things You Should Never Do, Part I](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) | 기존 코드를 읽는 어려움에 관한 문장 |
| 비야네 스트로스트루프 | [저자가 확인한 발언 모음](https://www.stroustrup.com/quotes.html) | 미래를 위한 개발에 관한 발언. 저자가 직접 확인한 형태를 사용한다. |
| 도널드 크누스 | [Structured Programming with go to Statements](https://gwern.net/doc/cs/algorithm/1974-knuth.pdf#page=8) | 1974년 논문 268쪽. 성급한 최적화에 관한 문장만 옮기며, 중요 경로의 측정과 개선까지 부정하는 해설을 덧붙이지 않는다. |
| 해럴드 애벌슨·제럴드 제이 서스먼·줄리 서스먼 | [프로그램의 구조와 해석](https://web.mit.edu/6.001/6.037/sicp.pdf#page=22) | 초판 서문 |

문장을 추가·수정할 때는 원문과 정확한 위치를 확인하고, 개발 주제·의역 표시를 유지하며, 일일 순환·중복 방지 테스트를 갱신한다. 흔한 오인용을 그대로 가져오지 않는다. 예를 들어 EWD498에 없는 것으로 확인된 ‘단순함과 신뢰성’ 문장은 사용하지 않고, 실제로 확인되는 도구와 사고에 관한 문장을 골랐다.
