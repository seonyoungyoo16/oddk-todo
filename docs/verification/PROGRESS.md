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

### T01 배포 후 확인 — 완료

- 병합 PR #3, Pages 코드 SHA `7465ed30c3cc6cca092134850d7d8cec602ef285`.
- Pages [40415043746](https://github.com/seonyoungyoo16/oddk-todo/actions/runs/40415043746) 성공, deployment `7345477339` SHA 일치.
- 서버 `plan-sync` ACTIVE version 3 반영. 인증 없는 POST는 401. 본문 인증은 유지했고 DB 스키마/권한은 변경하지 않았다.
- 새 배포 화면에서 합성 할 일 추가 → 작업25+여유5 저장 → 새로고침 → 작업25/수행30 유지, 콘솔 오류 0. 증거: `evidence/T01-deployed.png`.
- 전체 OAuth/두 계정 시험은 T09 범위이며 이번 결과로 대체하지 않는다. T01 진행 관측 약 07:43~07:48 KST. 예산 90분 이내, 외부 인증 대기 없음.

## T02 구현 및 검사

- `npm test`는 tests/unit의 순수 시험만 실행한다. `typecheck`와 fixture가 필요한 `test:integration`을 분리했다.
- Next용 tsc는 공통 모듈을 포함하며 Deno 서버 진입점만 제외한다. CI에서 Deno 서버/상대 import와 공통 규칙 시험을 별도로 검사한다.
- 의도적 불변식 실패 확인: 초안 PR #4의 첫 커밋에서 25+5의 기대 총시간을 31로 변경. Actions [40415380326](https://github.com/seonyoungyoo16/oddk-todo/actions/runs/40415380326)의 npm test가 1개 실패로 종료 코드 1, 뒤의 빌드와 배포는 skipped. 운영 master에는 반영하지 않았다.
- 이 커밋에서 기대값을 30으로 복구했다. 로컬 정상본 시험 12개 및 타입 검사 통과. 인증 fixture 없는 통합 명령은 명시적 안내 후 종료 코드 1이며 시험 미실행이다.
- ALPEN: 집중 90분+예비30분. T01 배포 확인 후 T02 시작. 정상 CI와 배포 확인 후 다음 단계로 진행한다.

### T02 배포 후 확인 — 완료

- PR #4 병합, SHA `acf974e521bfed7c83b6725c1f701e74bff2865e`.
- master [40415626608](https://github.com/seonyoungyoo16/oddk-todo/actions/runs/40415626608)에서 검증 → 배포 순서로 성공. deployment `7345576593` 동일 SHA.
- 배포 화면 새로고침 후 합성 할 일·시간 표시 유지, 콘솔 오류 0. PR/배포 CI의 깨끗한 Node24 체크아웃에서 모든 검사를 실행했다.
- 관측 실행 구간 약 07:48~07:53 KST. 정밀 집중 시간 계측은 아니며 예산90분 이내. 외부 인증 대기 없음.

## T03 검증 환경 결과

- 잘못된 JSON/요청은400, UTF8 1,000,000바이트 초과는413. ensure와 push 모두 공통 Plan 검증을 먼저 통과한다. 사용자 ID는 검증된 Auth 사용자만 사용하며 version의 안전한 정수 범위를 검사한다.
- CLI 2.122.0 `supabase migration new restrict_account_plan_writes`로 마이그레이션 파일을 생성했다. owner SELECT/RLS를 유지하고 public/anon/authenticated의 직접 쓰기를 회수한다. service_role 서버 경로를 유지한다. 스키마 파일도 같은 모델로 갱신했다.
- Docker Desktop은 기존 런타임 소켓 접근 오류로 시작 실패. 컨테이너/VM 초기화나 삭제를 하지 않았고, 이 실행에서 시작한 Docker 프로세스만 종료했다. 런타임 소켓 폴더는 백업 이름으로 보존했다. 이 오류를 애플리케이션 결함으로 분류하지 않는다.
- 대안: 같은 Supabase 프로젝트의 별도 `account_plans_t03_verification` 테이블과 `plan-sync-t03-verification` 함수, 새로 만든 일회용 테스트 계정 두 개로 격리했다. 별도 프로젝트/로컬 Supabase 검증이라고 표현하지 않는다. 운영 사용자 행은 시험하지 않았다.
- 격리 환경에서 `npm run test:integration` 두 시험 모두 통과: ensure 동시 생성, 같은 계정의 태스크/만다라트 반영, 기존 서버 보존, 타 계정 격리, owner SELECT, 익명/로그인 직접 INSERT/UPDATE 거부, 400/413에서 plan/version/updated_at 불변, 동시 push 200+409, 본문 user_id 무시, 오프라인·충돌 선택/백업·로그아웃 분리.
- `npm test` 15개, lint/typecheck, Deno 진입점 검사 통과. PR에서 정적 빌드까지 재검사 후 운영 반영한다.
- 기존 보안 권고: 유출 비밀번호 보호가 비활성 상태라는 Auth advisor WARN 1개. 이번에 인증 설정을 낮추거나 변경하지 않았으며 [공식 조치 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)를 참조한다.
- ALPEN: 집중90분+예비30분. T02 배포 확인 뒤 시작, Docker 준비 오류를 기록하고 분리 검증으로 전환했다. 운영 반영 결과와 정리는 이후 기록에 보완한다.
