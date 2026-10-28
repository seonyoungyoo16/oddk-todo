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

UX06 통합시험은7개다. account-planning은 새 중요도/마감 왕복과 기존 priority 보존, 잘못된 메타데이터400 원본 보호, 정렬 비저장, 필터 내 수동순서/undo, 여러 날짜 완료·삭제·복구와CAS를 실제 전용 계정에서 검사한다. 현재 Node96·Deno44개, 선택/정렬/마감초안·일괄 확인의 취소/실패/동시수정 보호도 포함한다. 본 시험은 실제 OAuth 검증을 대체하지 않는다.

UX07 통합시험은8개다. 서버10은 V1~V5를 읽고 V5 저장 계정의 구버전 쓰기를426으로 막는다. account-goals는 별도 fixture 계정의 V4→V5 원문/8×8·중복·없는 연결 보존, 잘못된 목표/부모400,9번째 그룹·삭제/undo, 분할/요약/시간 보존·부모 삭제/복구·CAS를 확인한다. 이전 시험의 최신 읽기 기대값은5로 바꾸되 날짜/시간/분류/보존 검증은 유지한다. 단위109·공통Deno57개이며 실제 브라우저 V4 백업/목표 초안/가변 화면 인수는 별도다.

## UX08 공개 이동 조회 시험

`node tests/travel-lookup.test.mjs`는 실제 배포된 travel-lookup에 공개 베를린 관광지 검색·도보/자동차 경로를 요청하는 명시적 네트워크 시험이다. 기본 npm test/PR CI에 포함하지 않는다. 개인 여행지·주소·위치나 실제 계정은 사용하지 않는다. 공급자 한도429는 최대2회/2.1초 간격으로만 재시도한다. 결과는 .sync-test-runtime/UX08-live-example.json에 보관하며 비밀정보가 없다. 캐시 적중 시 최초 조회 시각을 유지하는지 확인한다. 이 시험만으로 브라우저 사용성 비교·일정 저장을 검증했다고 표시하지 않는다.

CI는 새 travel-lookup/index.ts를 Deno로 별도 검사하고, travel.test.mjs/travel-handler.test.mjs의 순수 계약·HTTP모사 시험을 실행한다. Next 타입 검사는 이 Deno 진입점만 정확히 제외하고 공유 모듈·handler·클라이언트는 검사한다. 기존 plan-sync 및 로그인 검증은 유지한다.
