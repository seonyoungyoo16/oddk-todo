# 오늘의 한 문장

대시보드 상단에 동기부여를 주는 짧은 한글 문장 하나와 저자·작품명·원문 링크를 표시한다. 애니메이션이나 새 문장 뽑기 버튼은 두지 않는다.

## 날짜와 선택

- 실제 한국 날짜(`koreanToday`)를 사용한다. 선택한 계획 날짜나 계정 데이터에는 연결하지 않는다.
- 같은 날에는 새로고침하거나 기기를 바꾸어도 같은 문장이 나온다. 현재 앱의 날짜 구독은 매분과 탭 복귀 시 갱신한다.
- UTC 기준 날짜의 일련번호로 30개 문장을 순환한다. 30일 동안 중복이 없고, 다음 순환 경계에서도 같은 저자가 연달아 나오지 않는다.
- 빈 서버 날짜에는 표시하지 않아 서버/브라우저의 첫 렌더를 일치시킨다. 외부 API 요청, API 키, 저장소 쓰기 또는 새 동기화 필드는 없다. 문장은 오프라인에서도 읽을 수 있다.
- 현재 로컬 화면의 `dashboard` 및 기존 공개 화면의 `alpen`/`stats`에서 표시한다. 다른 화면에서는 렌더하지 않는다. 최신 로컬 대시보드의 미커밋 개편은 이 변경에 포함하지 않는다.

## 원문과 편집 기준

2026-10-31에 아래 원문에서 구절과 위치를 대조했다. 출처가 불분명한 인터넷 명언은 사용하지 않는다. 현대 한국어 번역서의 문장을 복제하지 않고, 외국 문장은 짧게 새로 옮겨 UI에 **원문 의역**으로 표시한다. 윤동주의 한 구절은 한국어 원문 그대로다. 저자·작품명 링크의 접근성 이름에는 권·장·절도 포함한다.

| 저자 | 원문 | 사용 위치 |
| --- | --- | --- |
| 노자 | [도덕경](https://ctext.org/dao-de-jing/zh) | 33장, 63장, 64장 |
| 공자 | [논어 학이](https://ctext.org/analects/xue-er), [위정](https://ctext.org/analects/wei-zheng), [술이](https://ctext.org/analects/shu-er), [위령공](https://ctext.org/analects/wei-ling-gong/zh) | 1.1, 2.15, 7.22, 15.30 |
| 랠프 월도 에머슨 | [Essays — Self Reliance](https://www.gutenberg.org/files/16643/16643-h/16643-h.htm) | 자기 신뢰, 자기 일, 평온, 모방에 관한 단락 |
| 헨리 데이비드 소로 | [Walden — Conclusion](https://www.gutenberg.org/files/205/205-h/205-h.htm) | 꿈, 자신만의 박자, 깨어 있음, 진실에 관한 단락 |
| 마르쿠스 아우렐리우스 | [명상록 5권](https://classics.mit.edu/Antoninus/meditations.5.five.html), [7권](https://classics.mit.edu/Antoninus/meditations.7.seven.html), [10권](https://classics.mit.edu/Antoninus/meditations.10.ten.html), George Long 번역 | 5.9, 5.20, 7.59, 10.16 |
| 제임스 앨런 | [As a Man Thinketh](https://www.gutenberg.org/files/4507/4507-h/4507-h.htm) | Thought and Purpose, Visions and Ideals, Serenity |
| 에픽테토스 | [The Enchiridion](https://www.gutenberg.org/cache/epub/45109/pg45109-images.html) | 1장, 5장, 8장, 29장 |
| 헬렌 켈러 | [Optimism](https://www.gutenberg.org/files/31622/31622-h/31622-h.htm) | 제3부, 낙관과 희망에 관한 짧은 한 문장 |
| 윤동주 | [쉽게 씌어진 시](https://ko.wikisource.org/wiki/쉽게_씌어진_시) | 등불에 관한 한 행 |

문장을 추가·수정할 때는 원문과 정확한 위치를 확인하고, 번역/원문 여부를 유지하며, 일일 순환·중복 방지 테스트를 갱신한다.
