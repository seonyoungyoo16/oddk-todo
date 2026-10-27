# oddk

Next.js + React로 만든 할 일·하루 계획 앱입니다. [배포 화면](https://seonyoungyoo16.github.io/oddk-todo/todo/)

할 일 리스트, 오늘의 리듬, 만다라트, ALPEN, 일일 시간통계를 연결합니다. 시간통계는 **입력한 계획 시간**이며 실제 측정 시간이 아닙니다.

## 실행과 검사

검증 환경: Node24.22.0 / npm11.19.1. package-lock.json을 사용합니다.

~~~powershell
npm.cmd ci
npm.cmd run dev
# http://localhost:3000/todo
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
~~~

## 데이터 규칙

현재 계획 형식은 V3입니다. V1·V2는 원문 백업 후 날짜·시간·목표·점검을 보존해 이전합니다. 제목120자·상세 메모2000자, 여러 줄 자동 확장, 최근 변경 실행 취소를 지원합니다. 초안과 실행 취소 기록은 브라우저의 계정 범위별로 보관합니다.

- 제목만으로 추가하고 목록을 눌러 날짜·시간·우선순위·목표를 설정합니다.
- 작업 + 여유 = 수행 시간. 시간 설정 시 작업·여유는 양의 정수이며 수행은 최대240분입니다.
- 날짜는 선택 사항입니다. 날짜 없는 업무는 일별 집계에서 제외됩니다. 오늘은 Asia/Seoul 기준입니다.
- 자정이 넘어도 시작 날짜에 한 번 집계합니다. 완료 업무는 통계에 남고 시간표에서 빠집니다.
- 지난 미완료 업무는 사용자가 재계획할 때만 이동합니다. ID·시간·목표는 유지하고 시작 시간을 해제합니다.
- ALPEN은 무엇을 얼마나 할지, 오늘의 리듬은 언제 할지 정합니다. 점검은 날짜별로 저장합니다.

새 브라우저에는 app/todo/initial-plan.json의 초기 목표만 제공하며 시험 업무를 넣지 않습니다. 비로그인 데이터는 해당 브라우저 localStorage에 저장됩니다.

**Google·GitHub 로그인으로 기기 간 동기화를 사용할 수 있습니다.** 기존 로그인 세션의 동기화·로그아웃은 유지합니다. 기존 계정은 서버 계획을 불러오고 새 계정은 로컬 계획을 가져옵니다. 로그인 전 계획과 계정 캐시는 분리됩니다. 계정 변경 시 미저장 화면 초안은 초기화되며 저장된 계획·미전송 변경은 유지됩니다.

## 시험·배포·복구

- [작업 명세](docs/CODEX-TASKS.md), [진행 기록](docs/verification/PROGRESS.md)
- [브라우저 시험](docs/verification/ACCEPTANCE.md), [동기화 시험과 미검증 범위](docs/verification/SYNC-ACCEPTANCE.md)
- [배포·복구 절차](docs/RELEASE.md), [배포 인수 결과](docs/verification/RELEASE-ACCEPTANCE.md)

master 반영 시 GitHub Actions가 lint·타입·단위시험·Deno 검증·정적 빌드 후 Pages에 배포합니다. 산출물은 out/, 경로는 /oddk-todo입니다. Supabase Edge/DB는 별도로 배포·확인합니다.
