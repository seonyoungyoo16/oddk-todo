# 단계별 검증·배포 기록

요청: T00부터 순차적으로 실행하며 각 단계의 배포 정상 확인 후 다음 단계로 진행한다. 앱 기능·DB/Function·Pages 배포 증거를 구분한다. 기존 사용자 작업 폴더는 보존하며 격리 체크아웃에서 작업한다.

## T00 완료

- PR #2 병합: `175dd7d271a78c3980d3cc146bf33f898b785473`.
- Pages Actions [40414424508](https://github.com/seonyoungyoo16/oddk-todo/actions/runs/40414424508) 성공, deployment `7345394484`의 SHA 일치.
- 배포 후 새로고침: 다섯 보기·SSO 버튼·빈 목록 정상, 콘솔 오류 0. 앱 코드는 바꾸지 않았다.
- 상세 기준선은 `BASELINE.md`. 이후 발견/해결한 항목은 이 기록에 누적한다.

## T01 구현·배포 전 검증

- 공통 `Priority/Task/Plan/Mandala`와 시간·시작 시각·계획 검증을 순수 TypeScript 모듈로 추출했다. Next/Node/Deno가 같은 모듈을 사용한다. Edge `validPlan`은 재수출 어댑터다.
- 편집 문자열 파싱은 유지하고, 저장 직전 및 저장소 진입점에서 공통 검증을 실행한다. 시간 표시의 유효성 판단도 공통 함수를 사용한다.
- 구형 읽기 어댑터와 저장 형식은 유지했다. 원문 보존·복구와 스키마 이전은 T04이며, 이번 배포에서 읽기 조건을 강화하여 기존 목록을 초기 목록으로 바꾸지 않는다.
- Node 24: `node --test tests/task-time.test.mjs tests/plan-validation.test.mjs` — 11개 통과.
- Deno 2.9.6: `npx.cmd --yes deno check supabase/functions/plan-sync/validate.ts`, `npx.cmd --yes deno test tests/plan-validation.test.mjs` — 타입 검사 및 5개 통과. 단순 `deno run`의 종료 코드를 시험 통과로 사용하지 않았다.
- `npm.cmd run lint`, `npx.cmd next typegen`, `npx.cmd tsc --noEmit`, `GITHUB_PAGES=true npm.cmd run build` — 통과. Windows에서는 PowerShell 환경 변수 설정 후 빌드하고 해제했다.
- 로컬 격리 포트 3100 브라우저: 제목만 추가 → 편집 작업 25/여유 5 → 총 30 확인 → 저장 → 새로고침 → 작업25/수행30 유지.
- 합성 자료로 모순된 25/30, 부분 설정, 0·음수·소수·241, 시작 시각 단독, 제목 길이·중복ID·우선순위·만다라트 제한을 검증했다. 실제 사용자 데이터나 인증정보를 시험에 사용하지 않았다.
- ALPEN: 집중 예산 90분, 예비 30분. T00 배포 확인 후 시작. 실행 시각·배포 SHA·최종 결과는 배포 후 기록에 보완한다. B02(DB 직접 쓰기)는 아직 미해결이며 T03 범위다.
