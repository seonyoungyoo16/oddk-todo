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

현재 시험은 계정 계획을 쓰므로 반드시 전용 계정에서만 실행한다. 계정 시험은 빈 계정에서 시작하고 두 번째 계정의 격리를 확인한다. 완료 후 테스트 사용자의 세션을 종료하고 해당 테스트 계획과 테스트 계정을 정리한 뒤 fixture와 이번 시험이 생성한 seed/cleanup SQL·런타임 모듈만 제거한다. `.sync-test-runtime/` 안의 기존 증거와 사용자 백업은 보존한다. 테스트 계정의 ID와 비밀번호·토큰·실제 업무 내용은 커밋/로그/스크린샷에 넣지 않는다.

`account-sync`는 직접 INSERT/UPDATE 차단, 소유자 SELECT, JSON/시간 오류 400, 용량 413, 동시 저장 409와 plan/version/updated_at 불변성을 검사한다. OAuth/두 프로필 전체 인수시험은 T09이며 `npm test` 결과로 대체하지 않는다.

분리 검증은 `ODDK_TEST_EDGE_FUNCTION=plan-sync-t03-verification`, `ODDK_TEST_TABLE=account_plans_t03_verification` 환경 변수를 사용한다. 같은 프로젝트 안의 별도 테이블/Function 환경이므로 운영과 별도 프로젝트라고 표현하지 않는다. 기본값은 운영 함수/테이블이지만 대상 행은 fixture의 전용 테스트 사용자 두 개뿐이다. 시험 전 해당 fixture 사용자에게 남은 테스트 계획만 정리하고, 다른 사용자의 계획은 조회/수정하지 않는다.

재현용 fixture 준비: `node tests/prepare-account-fixture.mjs`는 무작위 계정 정보와 `.sync-test-runtime/seed-accounts.sql`, `cleanup-accounts.sql`을 로컬에 생성한다. 비밀값을 출력하지 않으며 기존 fixture를 덮지 않는다. 신뢰한 DB 관리 연결로 seed SQL을 실행한 뒤 통합시험을 수행하고, cleanup SQL로 이번 marker에 해당하는 세션/사용자만 정리한다. 정리 후 남은 사용자 수0을 확인하고 생성 파일을 삭제한다. SQL은 현재 Auth 스키마를 먼저 확인한 격리 시험용이며 운영 사용자 등록 기능으로 사용하지 않는다.

UX02 이후 통합시험은4개다. account-store의 이전 대상은V3이며 account-v3는 메모 왕복과V1/V2쓰기426·2001자400·CAS409의원본보존을확인한다. 일반 단위시험은 초안 격리·손상/실패 보존, 메모 이전, 변경 충돌을 보호하는 실행 취소도 포함한다.

UX04 통합시험은5개다. account-store는 V1~V3를V4로 이전하며 account-v3는 기존 메모/undo 회귀를 V4에서 유지한다. account-v4는 명시적 종료·활동/고정휴식 왕복, 불일치400, V3쓰기426, 자정·CAS 보존을 검사한다. Node단위 외 Deno에서도 V4/시간계산/입력 파서를 실행한다. 실제 OAuth와 실제 단말 알림 권한은 별도 인수 항목이다.

UX05 통합시험은6개다. account-classification은 V4 선택 분류·태그의 실제 JSONB 왕복, 없는 참조/중복/색상/상한400 원본 보존, 이름 변경, 삭제·실행 취소 참조 복원과 stale CAS409를 검사한다. UI의 필터는 계정별 로컬 초안이며 동기화되는 정의/Task 연결과 구분한다. Node86개와 CI의 명시 파일 목록 Deno34개를 실행한다. Windows에서는 Deno에 wildcard 대신 명시 경로를 전달한다.
