# 검증 명령

Node 24에서 `npm ci` 후 실행한다.

| 명령 | 범위 | 외부 통신/인증정보 |
|---|---|---|
| `npm test` | 순수 시간/계획 규칙, 저장 전 검증 | 없음 |
| `npm run typecheck` | Next route typegen 후 tsc. 공통 모듈 포함 | 없음 |
| `deno check supabase/functions/plan-sync/account.ts` | Deno 서버 진입점 및 상대 import | 최초 npm 의존성 다운로드 |
| `deno test tests/unit/plan-validation.test.mjs` | 같은 공통 규칙의 Deno 실행 | 없음 |
| `npm run test:integration` | 실제 Auth/API/DB와 계정 캐시 통합 시험 | 격리 테스트 계정 필요 |

Pages 정적 빌드: PowerShell에서 `$env:GITHUB_PAGES='true'` 설정 → `npm run build` → 환경 변수 해제. PR CI는 설치·lint·typecheck·test·Deno 검사·정적 빌드를 수행하며 배포하지 않는다. master는 동일한 검사 후 Pages를 배포한다.

## 통합시험 준비/정리

실제 사용자의 계정을 사용하지 않는다. 운영 데이터가 없는 일회용 테스트 계정 두 개를 별도로 만들고, 저장소 루트의 무시된 `.sync-auth-fixture.json`에 `[{"id":"test-user-id", "email":"test-only-address", "password":"test-only-password"}, ...]` 형식으로 저장한다. Fixture가 없거나 잘못됐으면 명령은 설명과 함께 실패한다. 건너뛴 시험을 성공으로 표시하지 않는다.

현재 시험은 계정 계획을 쓰므로 반드시 전용 계정에서만 실행한다. 계정 시험은 빈 계정에서 시작하고 두 번째 계정의 격리를 확인한다. 완료 후 테스트 사용자의 세션을 종료하고 해당 테스트 계획과 테스트 계정을 정리한 뒤 fixture 및 `.sync-test-runtime/`을 제거한다. 테스트 계정의 ID와 비밀번호·토큰·실제 업무 내용은 커밋/로그/스크린샷에 넣지 않는다.

`account-sync`는 직접 INSERT/UPDATE 차단, 소유자 SELECT, JSON/시간 오류 400, 용량 413, 동시 저장 409와 plan/version/updated_at 불변성을 검사한다. OAuth/두 프로필 전체 인수시험은 T09이며 `npm test` 결과로 대체하지 않는다.

분리 검증은 `ODDK_TEST_EDGE_FUNCTION=plan-sync-t03-verification`, `ODDK_TEST_TABLE=account_plans_t03_verification` 환경 변수를 사용한다. 같은 프로젝트 안의 별도 테이블/Function 환경이므로 운영과 별도 프로젝트라고 표현하지 않는다. 기본값은 운영 함수/테이블이지만 대상 행은 fixture의 전용 테스트 사용자 두 개뿐이다. 시험 전 해당 fixture 사용자에게 남은 테스트 계획만 정리하고, 다른 사용자의 계획은 조회/수정하지 않는다.

재현용 fixture 준비: `node tests/prepare-account-fixture.mjs`는 무작위 계정 정보와 `.sync-test-runtime/seed-accounts.sql`, `cleanup-accounts.sql`을 로컬에 생성한다. 비밀값을 출력하지 않으며 기존 fixture를 덮지 않는다. 신뢰한 DB 관리 연결로 seed SQL을 실행한 뒤 통합시험을 수행하고, cleanup SQL로 이번 marker에 해당하는 세션/사용자만 정리한다. 정리 후 남은 사용자 수0을 확인하고 생성 파일을 삭제한다. SQL은 현재 Auth 스키마를 먼저 확인한 격리 시험용이며 운영 사용자 등록 기능으로 사용하지 않는다.
