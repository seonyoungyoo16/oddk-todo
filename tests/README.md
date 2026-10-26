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

DB 직접 쓰기 권한 강화에 따른 기대값 및 잘못된 JSON/400/413/409 불변성 시험은 T03에서 갱신한다. OAuth/두 프로필 전체 인수시험은 T09이며 `npm test` 결과로 대체하지 않는다.
