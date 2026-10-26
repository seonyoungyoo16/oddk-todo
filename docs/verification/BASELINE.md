# T00 — 실제 소스와 검증 기준선

상태: **완료 — 기능 변경 없이 기준선과 기존 보완점 기록**

- 관측일: 2026-10-27, 시간대 Asia/Seoul. 아래 실행 시각은 모두 KST(+09:00).
- 명세: 원본 작업 폴더의 `docs/CODEX-TASKS.md`, T00. 이 명세는 관측 당시 미추적 파일이었다.
- 코드 기준: `22eae98672e178c0626e8cd4254f8e0cb6cd96e1` (`origin/master`).
- 문서 작업 브랜치: `codex/t00-baseline`. PR에는 이 문서만 포함한다.
- 이 기록은 날짜 기능 구현이나 전체 기능 인수시험 완료를 뜻하지 않는다.

## 1. 저장소·실행·배포 구분

| 구분 | 확인한 값 |
|---|---|
| 실제 앱 저장소/실행 소스 | `C:\workspace\study\todo` |
| 원본 작업 폴더 HEAD/브랜치 | `522a4bb0f005d0118c62cf7bc26afdccec28ad3c` / `master` |
| 원격 master 및 현재 배포 코드 | `22eae98672e178c0626e8cd4254f8e0cb6cd96e1` |
| 격리 검증 체크아웃 | `C:\workspace\study\todo-t00-baseline` |
| 검증 체크아웃 HEAD/브랜치 | `22eae98672e178c0626e8cd4254f8e0cb6cd96e1` / `codex/t00-baseline` |
| 앱 URL | `http://localhost:3000/todo` |
| 포트 3000 소유 프로세스 | PID 19404, Node의 `next/dist/server/lib/start-server.js` |
| 부모 개발 서버 | PID 30552, `C:\workspace\study\todo\node_modules\.bin\..\next\dist\bin\next dev` |
| 원격 저장소 | <https://github.com/seonyoungyoo16/oddk-todo> |
| GitHub Pages | <https://seonyoungyoo16.github.io/oddk-todo/todo/> |
| 배포 성공 증거 | [Actions 40401606608](https://github.com/seonyoungyoo16/oddk-todo/actions/runs/40401606608), head SHA `22eae98672e178c0626e8cd4254f8e0cb6cd96e1` |
| Pages deployment | ID 7343605351, environment `github-pages`, state `success`, 동일 SHA |
| Node / npm | v24.22.0 / 11.19.1 |
| Next / React | 16.4.3 / 19.3.0, lockfile의 버전 사용 |

`C:\workspace\react_todo\todo`는 이번 검증·수정 대상으로 사용하지 않았다. 원본 개발 서버를 중지하거나 원본 `.next`에서 production build를 실행하지 않았다. 깨끗한 별도 체크아웃에서 의존성을 설치하고 검사했다.

## 2. 기존 변경 보존과 로컬/배포 차이

시작 시 원본 폴더의 미커밋 파일:

```text
 M app/todo/task-editor.css
?? app/logo.ico
?? docs/CODEX-TASKS.md
?? public/logo.jpg
?? public/logo.svg
?? public/oddk-logo-check.png
?? public/oddk-logo-v2.png
?? public/oddk-logo.png
```

- 원격 `22eae98`은 수정 팝업의 글자 크기·배경·다크 모드 삭제 동작 스타일과 AGENTS.md 피드백 지침을 포함한다.
- 원본 `task-editor.css`의 미커밋 내용에는 원격에 반영된 스타일이 이미 들어 있다. 원격과 남은 차이는 선택자 줄바꿈 및 마지막 빈 줄이다. PostCSS로 파싱한 뒤 공백·주석을 정규화한 트리를 비교한 결과 동일했다. 이는 CSS 의미 비교이며 픽셀 단위 동일성 시험은 아니다.
- 원본의 `page.tsx`, `sync-store.ts`, `task-editor.css` 해시는 관측 시작과 주요 검사 종료 시 동일했다. 관측 중 세 파일의 추가 변경은 없었다. 타 채팅의 진행 상태까지 보증하지 않으므로 T01 착수 시 다시 확인한다.
- 원본의 미커밋 변경과 미추적 자료는 수정·초기화·스테이징하지 않았다. 이 문서만 문서 PR로 제출한다.

| 원본 파일 | 보존 확인 SHA-256 |
|---|---|
| `app/todo/page.tsx` | `6A9FFA4EEDA5776EFBE306D7BC8A9DE0AAFD29CDCBB2F826AF292682A32821FF` |
| `app/todo/sync-store.ts` | `269CF9CBBCBBB2E16A721F0814DC557558ECD8F8ED32B27F63535DBEA77FDB89` |
| `app/todo/task-editor.css` | `8EB5A5A1BBA324A2B5DF2613318153A3FE478E54DC03447CAAFBFFE7B68396CB` |

## 3. 이번에 실행한 검사

실행 위치: `C:\workspace\study\todo-t00-baseline`, 코드 기준 SHA는 위 표와 동일하다.

| 명령 | 시작 / 종료(KST) | 종료 코드 | 관측 결과 |
|---|---|---:|---|
| `npm.cmd ci` | 07:07:59 / 07:08:14 | 0 | 370개 설치, audit 0 vulnerabilities |
| `npm.cmd run lint` | 07:08:41 / 07:08:45 | 0 | ESLint 통과 |
| `node tests/task-time.test.mjs` | 07:08:41 / 07:08:42 | 0 | 6개 통과, 실패 0 |
| `npx.cmd next typegen` 후 `npx.cmd tsc --noEmit` | 07:09:10 / 07:09:13 | 0 | Next 생성 타입을 만든 뒤 타입 검사 통과 |
| `$env:GITHUB_PAGES='true'; npm.cmd run build` | 07:09:19 / 07:09:26 | 0 | 정적 export 통과. `/`, `/_not-found`, `/todo` 생성 |

- build 뒤 `GITHUB_PAGES` 환경 변수를 해제했다. 생성 파일은 직접 작성하거나 커밋하지 않았다.
- `package.json`에는 `test`, `typecheck`, `test:integration` 스크립트가 아직 없다. 없는 스크립트를 통과했다고 기록하지 않았다.
- Next CLI 지침 `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`의 typegen 순서와 정적 export 가이드를 확인했다.
- 비차단 경고: npm의 ESLint 지원 종료 안내, `unrs-resolver` 설치 스크립트 승인 안내, Node의 `MODULE_TYPELESS_PACKAGE_JSON` 안내. T00에서는 의존성이나 모듈 형식을 바꾸지 않았다.

07:10:33 HTTP HEAD 관측:

| 경로 | 상태 | Content-Type |
|---|---:|---|
| 로컬 `/todo` | 200 | text/html |
| 배포 `/oddk-todo/` | 200 | text/html |
| 배포 `/oddk-todo/todo/` | 200 | text/html |
| 배포 `/oddk-todo/logo.png` | 200 | image/png |

새 비로그인 배포 탭과 기존 비로그인 로컬 탭에서 다섯 보기 메뉴와 Google/GitHub 로그인 버튼을 확인했다. 기존에 열린 배포 탭은 이전 번들 상태였으므로 최신 화면의 증거로 사용하지 않았다. 새 탭의 콘솔 오류/경고는 각각 0개였고, 로컬 탭의 기준선 관측 시작 이후 오류는 0개였다. 이는 화면 진입 관찰이며 팝업 조작·OAuth·동기화 전체 시나리오 재시험은 아니다.

## 4. 현재 구현과 원격 구성

| 영역 | 현재 상태와 근거 | T00에서 남긴 한계 |
|---|---|---|
| 할 일/수정 팝업 | 빠른 추가, 목록 탭, 작업+여유 입력, 만다라트 연결, 알펜 이동, scoped task-editor CSS가 소스에 존재 | 이번에는 데이터 변경을 포함한 CRUD 인수시험을 하지 않음 |
| 내 정보/로그아웃 | SSO 로고·이름, 읽기 전용 정보 카드, 이 기기 로그아웃 구현 | 실제 사용자로 로그인/로그아웃 재시험하지 않음 |
| 계정 동기화 | PKCE 로그인, 계정별 캐시, 5초 확인, 오프라인 dirty 상태, CAS409, 충돌 선택 전 백업 구현 | 두 브라우저 프로필/인증 만료/기기 간 전체 시험은 T09 |
| OAuth 제공자 | 공개 Auth settings 조회에서 Google=true, GitHub=true | 설정 flag만 확인. 실제 로그인 시작→콜백 성공의 이번 증거가 아님. Google 게시/테스트 사용자 제한도 이번에 재확인하지 않음 |
| 날짜별 계획 | `plannedDate`, `schemaVersion:2`, `reviewsByDate` 미구현 | T04 이후 구현. 현재 시간표/통계를 날짜별 계획으로 간주하지 않음 |

원격 구성은 읽기 전용으로 확인했다. 계정 데이터 행을 조회·수정하지 않았고, OAuth·DB·Edge 설정도 변경하지 않았다.

- 프로젝트 `oddk-todo-sync`, ref `synxmskamifpovuziecx`, 서울 리전, 상태 `ACTIVE_HEALTHY`.
- Edge Function `plan-sync`: ACTIVE, **version 2**, entrypoint `account.ts`.
- `verify_jwt=false`이지만 함수 본문은 Supabase Auth `getUser(token)`으로 요청자를 검증하고, 조회/저장에 검증된 user ID를 사용한다. Gateway flag만으로 익명 저장 허용이라고 판단하지 않는다.
- 마이그레이션: `20261026201933 create_private_sync_workspaces`, `20261026202958 create_owned_account_plans`, `20261026203712 remove_unused_code_sync_tables`.
- `account_plans`의 SELECT/INSERT/UPDATE 소유자 RLS 정책이 존재한다. 메타데이터 조회에서 authenticated의 SELECT/INSERT/UPDATE뿐 아니라 DELETE/TRUNCATE/REFERENCES/TRIGGER grant도 확인했다. 정책·grant 존재 확인과 실제 권한 우회 시험은 구분한다.

## 5. 기존 보완점 — 이번에 만든 결함과 구분

다음은 기준 SHA에 이미 존재하는 내용이다. T00에서 앱 동작을 바꾸지 않았으므로 이번 작업으로 새로 만든 앱 결함은 없다.

| ID | 관측/분류 | 영향과 후속 작업 |
|---|---|---|
| B01 | 서버 `validPlan`은 시간 두 값의 상호 관계와 시작 시각의 시간 의존성을 검사하지 않는다. 순수 모듈에 합성 입력을 넣어 `minutes=25, bufferMinutes=30` 및 시간 null+시작 시각만 있는 계획이 각각 true임을 확인 | 화면/저장소/서버 검증 통합은 T01, API 400 및 DB 불변 검증은 T03. 이 합성 시험을 원격 API 시험으로 표현하지 않음 |
| B02 | 원격 authenticated INSERT/UPDATE grant와 소유자 정책이 있고, 소스도 이를 허용 | 본인 행 직접 쓰기가 Edge 검증·CAS를 우회할 수 있는 경로. 타 계정 접근 성공을 뜻하지 않음. T03에서 쓰기 경로 제한 및 격리 계정 시험 |
| B03 | CI는 push/master의 설치·lint·build·배포만 실행. 별도 PR 검사와 단위시험 실행 단계가 없음 | T02에서 오프라인 단위시험/타입 검사/PR 검사를 명령으로 연결 |
| B04 | 읽기 경계가 잘못된 저장 JSON에서 초기 계획으로 fallback하고, 공통 검증·형식 버전·이전 모듈이 없음 | 실제 데이터 손실을 이번에 관측한 것은 아님. T04/T08에서 원문·마지막 유효값 보존과 버전 호환 구현 |
| B05 | 통합시험은 커밋하지 않는 인증 fixture에 의존 | T00에서는 통합시험 미실행. T02/T09에서 격리 계정 및 fixture 준비/정리와 재현 절차 확정 |

B01/B02는 T01/T03에서 해결할 선행 보완점이다. T00 문서 작성은 완료할 수 있으나, 이를 해결했다고 간주해 날짜 통합 배포나 전체 인수시험을 통과 처리해서는 안 된다.

## 6. ALPEN 점검과 다음 작업

- A: T00의 소스/프로세스/배포 확인, 네 가지 필수 검사, 기존 결함 분류, 문서 PR을 처리했다.
- L: 명세의 집중 예산 30분. 주요 검증 관측 구간은 07:06:26~07:12:16(5분 50초)이며 문서 작성·PR 정리는 별도다. 이는 관측 경과이며 정밀한 집중 시간 계측은 아니다.
- P: 30분 집중에 예비 10분을 별도 배정하는 40분 타임블록 기준. 이번에는 외부 계정 설정 대기가 없었다.
- E: 다음 실행 단위는 T01. 공통 타입과 시간 불변식부터 통합하고 T02/T03으로 진행한다. 기존 팝업과 동기화는 재작성하지 않는다.
- N: 모든 필수 기준선 검사는 통과했다. OAuth/계정 동기화 전체 재시험 및 날짜 기능은 미검증/미구현으로 남겼다. 후속 작업 전 원본 미커밋 변경과 원격 최신 SHA를 다시 확인한다.

보고: 앱 소스·의존성·원격 구성의 기능 변경 없음. 문서 PR의 base는 위 코드 기준 SHA이며, 문서 병합 자체가 앱 기능 배포 완료를 뜻하지 않는다.
