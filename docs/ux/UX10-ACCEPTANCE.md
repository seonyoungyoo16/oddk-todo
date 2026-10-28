# UX10 인수 진행 기록

상태: UX10 소프트웨어 QA·CI/Pages 운영 배포 검증 완료(PR28/c361c3d). 실제 OAuth·물리 권한/수신·실기기 인수는 전체 작업 마지막 목록에 유지하며 UX11로 진행한다. 아래 과거 체크포인트의 미완료 표기는 작성 당시 상태이며 마지막 운영 게이트 절이 최신 결과다.

## 공통 계약과 실제 서버

- `repeat-calendar` 6개, `recurrence` 12개 공통 시험: 날짜 간격/요일/없는 월일·윤일·연말, 안정 발생 ID, 개별 날짜 이동, 건너뛰기, 이후/전체 수정·중단, 완료 기록/개별 예외, 기존 분류·목표·분할·시간 이동·undo 보존. 부분 생성·ID/제목 충돌·한도 초과는 원본을 보존해 거부한다.
- 기존 회귀와 계정별 before-v6 쓰기 순서/실패 시험 포함 Node153·Deno94, 타입/린트/정적빌드 통과(반복 UI 추가 전 기준). V5 일반 사용은 유지하며 첫 반복/리마인더 설정 때 V6로 전환한다.
- `plan-sync` v11 ACTIVE, SHA `35a2a230e2c11b35d038c068b1dffe660e0fa7b4438b7ebaf6005cc21b5cb6bf`, 배포 소스11개 확인. 무인증401·허용 preflight204·다른 Origin403·GET405. 기존 getUser 인증·CORS·RLS·OAuth 설정을 유지했다.
- 격리한 시험 계정2개로 전체 통합시험11개 통과. 새 V6 시험은 ID/자정/여유/목표/알림분 JSONB 왕복, 구 V1~5 쓰기426, invalid400·stale409 시 전체plan/version 불변, 예외/건너뛰기/이후 변경/완료 보존/중단/종합undo·계정 격리다. signOut·세션/사용자 정리 후 `test_users_remaining=0`, 인증 fixture·SQL·생성 모듈 제거.

## 실제 브라우저에서 확인한 반복 수정

| 시나리오 | 결과 |
|---|---|
| 10/28~30 매일·09~10시·여유10·시작 시각 알림 | 적용 전 기존1개/V5 유지, 범위 확인은 추가2/수정1. 승인 후 V6 3개, 기존 ID/이후 날짜 ID·작업50/여유10·알림0 저장 |
| 설정 중 빈 간격·매주·종료일 → 새로고침 | 수정창과 미완성 초안 복원, 빈 간격은 저장 거부·입력 유지 |
| 계획 쓰기 quota 모사 → 승인 | 기존1개와 입력/변경안 유지. 해제 후 재입력 없이 동일 확인으로3개 저장 |
| 변경안 확인 중 다른 항목 추가/StorageEvent 모사 | ‘변경 범위 다시 확인’으로 전환. 첫 클릭은 새 미리보기만 준비하고 재승인으로 외부 항목도 보존 |
| 28일 완료·30일 개별 제목 변경·29일 이후 제목 변경 | 28일 완료 원문 유지,29일만 새 제목,30일 개별 수정 원문 유지. 규칙 구간은28/29일로 분리 |
| 29일 이번만 건너뛰기 | 삭제1/완료1 유지 확인 후 해당 발생만 제거·skippedDates에29일 기록. undo로 업무·규칙·예외 복구 |
| 전체 중단 | 삭제2/완료1 유지. 미완료 개별 예외도 취소하고 완료28일은 보존. undo로 세 날짜와 각 상태 복구 |
| 390px 프레임·다크 | 문서375=scroll375, 수정창341px. 중단 범위·확인·저장 접근, 확인 제목으로 포커스 이동 |

수정하고 재시험한 결함:

- 범위 변경을 페이지 공통 저장이 다시 ‘개별 수정’으로 분류하던 문제: 검증된 반복 변경안은 재분류하지 않도록 분리. 동일 범위 재설정 후 원래 발생에 예외가 생기지 않음을 새 fixture로 확인했다.
- 실행 취소 역시 개별 수정으로 분류되던 문제: undo의 재분류를 제거. 원래 발생에 예외를 만들지 않고 복구되는지 확인했다.
- 변경 없는 저장은 기존 실행 취소 기록을 지우지 않도록 했다. 기존 저장·동기화 검증과 최신 계획 대조는 유지한다.

장애·외부 변경은 해당 로컬 프레임에만 주입한 모사다. 실제 계정 CAS/JSONB와 구분한다. 기본 QA 종료 때 원래 계획 JSON 전체 일치·V5·업무0, 원래 목표/초안/테마 복원 후 도구 탭과 임시 HTML을 정리했다. 실제 OAuth·권한 요청은 하지 않았다.

## 브라우저 반복 발생 준비

- 오늘부터31일과 선택한 날짜/주 범위의 누락 발생만 추가한다. 기존 완료·이동·건너뛰기·개별 수정은 재작성하지 않는다. 데이터·계정 scope가 바뀌면 준비 작업을 취소하고, 실패 시 기존 계획 보존과 재시도를 제공한다.
- 별도 `localhost:3200` 저장소의 단일 QA 발생 → 실제 앱에서31개 준비(10/28~11/27). 계획 쓰기 실패를 켜고 2027/02/01 선택 → 오류·재시도 표시, 기존31개 raw가 이전과 동일. 해제·재시도 → 선택한 날짜1개만 더해32개. 새 앱 탭·새로고침 후32개/raw 동일, 중복 없음, console warn/error0.
- 별도 origin은 원래 raw가 없었으며, 종료 시 원래 raw/초안 상태 일치 복원 후 도구 탭과 임시 HTML을 제거했다. 기본 `127.0.0.1:3200` 저장소와 분리했다.
- 이 브라우저 준비는 앱이 닫힌 상태의 서버 준비·푸시 전달 증거가 아니다. 서버 준비의 후속 증거는 아래 절에 따로 기록한다. 푸시 전달 구현과 인수는 남아 있다.

## 증거와 남은 인수

- [반복 변경안](evidence/UX10-repeat-confirm.jpg), [저장 실패](evidence/UX10-repeat-save-failure.jpg), [390px 다크](evidence/UX10-mobile-dark-confirm.jpg), [발생 준비 실패](evidence/UX10-window-failure.jpg)
- 추가 `repeat-editor`6개·`repeat-window`3개, 전체 Node162개 통과. 전체 Deno·최종 타입/린트/빌드는 아래 단계에서 재확인한다.
- 미완료: 기기 구독·권한 상태 UI, 푸시 예약·변경/완료/삭제 취소·전달/재시도/중복 방지, 구독 소유권·계정 전환, 관련 실제 API/브라우저 회귀, CI·Pages·동일 SHA 운영 확인.
- 실제 단말 권한·OAuth·앱 종료 후 실물 푸시 전달·실제200%·독립 사용성은 최종 사용자 인수 목록에 유지한다. 코드만으로 전달을 확인했다고 기록하지 않는다.
## 서버 정기 반복 준비 인수 — 2026-10-28

- 배포: `task-maintenance` v1 ACTIVE, SHA `88e9304aa46f1291b60a380e696a7620b51d9303c10b3ecf6e2f18107f55c9b7`. 원격14개 소스와 로컬 내용 전체 일치. plan-sync11·travel-lookup2는 변경하지 않았다. 프런트 운영은 UX09이며 UX10 Pages 배포 완료를 뜻하지 않는다.
- 마이그레이션: `20261028044251_task_reminders`, `20261028044335_restrict_maintenance_network_queue`. pg_cron1.6.4/pg_net0.20.4 설치, 분 단위 Cron1 활성화. 상태 테이블은 RLS+브라우저 권한 없음, 관리 RPC의 PUBLIC/anon/authenticated 실행 권한0.
- 실제 DB 트랜잭션 시험: 잘못된/재사용 티켓, 틀린/만료 lease, V5 쓰기, stale CAS 거부. 유효 CAS는 계획과 버전을 함께 갱신. 임시7개를 더한8계정이5+3+0으로 순회하고 커서를 초기화했다. 비활성 작업 claim 거부. 전체 시험 변경/임시 계정은 롤백했다.
- 별도 격리 계정2개: 원래 발생2개(완료1·미래 날짜로 이동한 예외1), 아직 생성하지 않은 건너뛰기1, 목표·메모·알림10분을 저장했다. 앱 클라이언트의 발생 준비를 실행하지 않았다. DB 수동 dispatch의 request1이 서버에서32개 기대 계획 전체를 준비했고 버전은1만 증가했다. 다른 V5 계정은 전체 응답이 동일했다.
- 이어서 실제 Cron run6의 request2(04:48 UTC)는 끝의 빈 배치/커서 초기화, 다음 Cron의 request3(04:49 UTC)는1계정 unchanged1/prepared0이었다. 세 요청 모두200, timed_out=false/error=null. `verify-noop`에서 계획·버전·updated_at 모두 첫 검증과 동일했다. 자동 Cron 재실행 증거와 최초 수동 dispatch 생성 증거를 구분한다.
- 두 시험 계정 모두 모든 관리 RPC·상태 조회42501 거부. net 스키마는 비로그인/두 계정 모두406/PGRST106 거부. 무인증 외부 Edge 요청은 GET405/위조 티켓401/브라우저 Origin403. 티켓/인증 값/대기열 본문은 출력하지 않았다.
- pg_net ACL 회수 시도는 실제 권한이 바뀌지 않았다. Supabase 관리 소유 객체의 제약을 공식 KB와 현재 ACL로 확인해 설계에 기록했다. 이 마이그레이션을 차단 성공으로 판단하지 않는다. 지속 비밀 대신 단회2분 티켓, Data API 스키마 격리와 앱 소유 RPC 권한이 현재 경계다. 직접 DB 로그인 역할은 대기열을 볼 수 있다는 제약이 남는다.
- 서버 생성 시험 후 두 계정 signOut/세션·사용자 정리, 전체 시험 사용자0/기존 계획 수3 확인. 인증 fixture와 seed/cleanup SQL 제거. 기존 사용자 CSS SHA는 이전과 일치한다.
- 전체 Node170·CI와 같은 공통 Deno111·Edge3개 check·typecheck/lint·Pages 정적빌드 통과. 신규 handler 시험8개다. 보안 advisor는 의도한 서버 전용 RLS no-policy INFO3(신규 state1+기존 travel2), 기존 유출 비밀번호 보호 WARN1이며 신규 WARN/ERROR는 없다.

위 서버 준비 체크포인트 당시에는 구독 API를 포함한 알림 경로가 남아 있었다. 후속 구독 API 인수와 최신 잔여 범위는 아래 절에 기록한다. 실제 OAuth·기기 권한/실제 전달은 최종 사용자 인수로 분리한다. UX11에는 착수하지 않는다.

## 기기 구독·관리 API 인수 — 2026-10-28

- `push-subscriptions` v2 ACTIVE, SHA `4c5e78d570487e1c2fe6659c687ac4dfb791d61ea83e9cce0956cf665c60fa92`. 원격3개 소스와 로컬 전체 일치. migration `20261028050003_push_subscriptions`와 `20261028050412_push_device_management`. 기존 서버3개와 프런트 운영 버전은 유지했다.
- 공통 계약/HTTP 모사9개를 Node/Deno에서 검증했다. 공개 키·P-256 점·정규 base64url, 허용 endpoint, 임의 사용자ID/추가 필드 거부, Origin/메서드/본문/인증 순서, 상태/목록 응답의 비밀 필드 제거, 변경 버전·해제·개수 제한·저장 실패 안내를 포함한다.
- Deno의 off-curve 점 import 허용 차이를 발견해 ECDH 연산으로 검증을 보강했다. Node/Deno 단위 시험과 실제 배포 API의 잘못된 점400을 모두 확인했다. 자체 런타임 호환 검증 문제이며 Next 문제로 분류하지 않는다.
- 새로운 격리 계정2개의 실제 API 시험: 공개 설정을 동시에 읽어 같은 publicKey만 반환·정상 P-256 확인, 미등록 해제→늦은 등록 거부, 등록·동일 설정 no-op, 잘못된 deviceToken 거부, 증명을 가진 계정 전환과 이전 계정의 지연 요청 거부, 다른 설치의 동일 endpoint 탈취 거부, 동시 같은 revision 변경200/409를 확인했다.
- 내 기기 목록은 소유한 최소 필드만 반환한다. 다른 계정의 목록에는 없고 해당 기기 원격 해제도409다. 소유자의 해제는 revision 증가·비활성화, 반복 해제는 no-op, 예전 revision 재등록은409다.
- 활성4개에서 두 기기 동시 등록은 정확히200/429, 연결을 하나 끈 뒤 재등록은 성공했다. 최근 기록20개 상한429도 확인했다. 모든 기기는 합성 경로/실제 생성한 시험 키이며 실제 공급자 요청이나 단말 권한 요청은 없었다.
- 두 계정 모두 모든 push 관리 RPC·두 테이블 직접 조회42501 거부, 상태와 설정 응답에 endpoint/deviceToken/privateKey 미포함, 계정 계획·버전·updated_at 전체 불변을 확인했다. 새 시험의 독립 실행 후 새 fixture로 통합 runner12개 전체를 실제 API에 실행해 통과했다(exec49631 exit0). 동기화/CAS 반복 fixture는 생성한8일 범위에 종료일을 명시해 Cron의 자동 연장과 분리했다. 무기한31일 서버 준비·경합·no-op 인수는 앞 절의 실제 증거를 유지하며 시험 중 Cron을 끄지 않았다.
- 별도 실제 DB 롤백 시험은 비로그인용 임시2사용자·최근 비활성20개를 트랜잭션 안에서 만들었다.31일 된 자기 기록만 정리되고 다른 계정/최근 기록은 보존됨, 외부 소유자 원격 해제 거부, 해제 후 주소/키 NULL과 revision·stale 거부를 확인했다. 첫 SQL 시험은 변수/테이블명 충돌로 실패했으며 수정 후 자체 생성 fixture 방식으로 통과했고 전체 롤백했다.
- API 시험은 signOut·marker 정리 후 시험 사용자0/구독0/기존 계획 수3 확인, 인증/seed/cleanup 파일 제거. Vault의 VAPID 비밀은1개·유효 참조만 확인했고 값을 조회/출력하지 않았다. 기존 사용자 CSS 해시도 일치한다.
- 전체 Node179·CI 공통 Deno120·typecheck/lint/Pages 정적빌드 통과. 신규 Deno 진입점 check 성공·CI 목록에 추가했다. 보안 advisor는 서버 전용 테이블의 의도한 no-policy INFO2 증가(합5)와 기존 password WARN1이며 새 WARN/ERROR는 없다.

**남은 UX10:** 브라우저 알림 연결 UI/Service Worker/계정 전환 차단, 서버 예약·최신 계획 대조·푸시 전달·취소·만료/재시도/중복 방지, 최종 회귀·CI·Pages·운영 인수. 실제 OAuth·실기기 권한과 수신은 마지막 사용자 인수다. UX11 미착수.

## 예약·취소·재시도 대기열 인수 — 2026-10-28

- 마이그레이션20261028052818/20261028053138/20261028053923을 적용했다. 예약/전달 두 테이블, 계획/기기 트리거와 내부 RPC9개를 추가했으며 원격 최신 함수 본문과 로컬9개가 전체 일치했다. 공개/anon/authenticated push RPC 권한0, 실제 두 시험 계정의 새 RPC/테이블 조회42501도 확인했다. 기존 Edge4개·프런트·운영 Cron1은 바꾸지 않았다.
- 공통 reminderWindow/currentReminder4개: 한국 자정·알림0/5/60·유효 기한, 완료/요약/미설정 제외, 시간 변경/삭제/손상 계획/미래 형식/아직 이르거나 만료된 요청 거부, 제목만 바뀌면 현재 제목 선택을 Node/Deno에서 검증했다.
- 실제 DB 롤백 시험은 임시2사용자만 만들었다. 한국 시간/정수 소수 표기/잘못된 날짜·시간대 변경 시 해시 불변, 제목 변경 no-op, 단회 claim/lease와 최신 계획, 잘못된 수신/기기 증명 거부, 완료 후 조회/수신/완료 처리 차단, undo의 같은 예약 재활성화·이전 토큰 무효화를 확인했다.
- 재시도 backoff 중 중복 claim 없음, 불확실한 공급자 응답 뒤의 정상 수신 확인/표시 ACK, 중복 표시 식별, 계정 전환 후 예전 요청 차단과 새 소유자 보호, 재연결 시 이미 표시한 예약 제외, 최대4회 종료, 만료 구독의 키/주소 삭제, 업무 삭제/기한 만료/사용자 cascade를 확인했다. 테스트 SQL의 변수/컬럼명 충돌1건은 별칭으로 수정 후 전체 시험을 통과했다.
- 처음 MCP 병렬 요청은 실제 SQL 실행이 순차여서 동시성 증거로 인정하지 않았다. 보충 INSERT의 충돌 갱신이 기존 대기 행까지 잠글 수 있는 점을 검토해 선행 필터로 보완했다. 실제 Cron 두 세션(job2/3)은05:40:00.028702/00.034813 UTC 시작,05:40:00.040761/00.047954에 각5개 claim,05:40:06.044187/06.055065에 종료했다. 어느 세션도6초 잠금 해제를 기다리지 않았고10개 ID는 모두 달랐다. one-shot 작업은 자체 삭제되어 잔여0이다. verify SQL도 통과했다.
- 보완 후 전체 DB 수명주기 시험을 다시 통과했다. 실제 API 통합12개는 exec89061 exit0, Node183·공통 Deno124·typecheck/lint/Pages 정적빌드 통과다. 새 sender나 실제 푸시 전송은 아직 없다. 향후 sender가 활성화된 운영 큐에서는 race fixture를 실행하지 않는다.
- 시험 계정/구독/예약/전달0·기존 계획3·QA Cron0 확인, 인증/seed/cleanup/생성 store 모듈 제거. 의도적 서버 전용 RLS no-policy INFO2 증가(합7)·기존 password WARN1이며 새 WARN/ERROR는 없다. 운영 전송이나 브라우저 수신 성공으로 확대 해석하지 않는다.

**남은 UX10:** sender Edge·예약 호출 인증/운영 Cron·외부 암호화 전송/응답 분류, 제한된 수신 확인 HTTP API, 브라우저 SW/계정 전환/UI, 최종 CI/Pages/동일 SHA 운영 인수와 마지막 사용자 실제 권한/수신 인수. UX11은 시작하지 않는다.

## 암호화 전송·수신 확인 HTTP 인수 — 2026-10-28

- push-worker v2 ACTIVE/SHA `3f15ac16ab53fd3dea140e8d57dc67f725d50a615e4317d5b2a8d96ccf7a8198`, push-receipt v1 ACTIVE/SHA `183177512a9760c10e76a88788307303275af78b28a39506cc9cc40129bac061`. get_edge_function의 반환 소스16/15개가 로컬과 전체 일치했다. worker 배포 입력에는 deno.json/lock도 포함했다. migration20261028060414 적용, 서버 전용 gate/내부RPC·receipt 소유권 검증과 분 단위 Cron 활성.
- 전송은 단회2분 작업 티켓·45초 gate,5개 병렬/최대10배치/18초 작업예산,8초 공급자 timeout/redirect 금지다. 공급자404/410은 구독 만료,408/429/5xx/불확실 실패는 기한 내 제한 재시도, 긴 Retry-After는 조기 재시도하지 않는다. 본문은 암호화된 수신증명7필드만이며 제목·메모·전체계획은 보내지 않는다.
- web-push3.6.7 암호화 요청을 별도 RFC8291 복호화로 대조하고 VAPID 서명/audience·안정 topic·TTL을 검증했다. ECE_KEYLOG=1이면 의존성 import 전에 기동을 거부한다. 초기 hosted v1의 Deno.env.set 미지원 기동 실패를 실제 로그로 확인하고 읽기 전용 guard로 수정해 v2 GET405/위조티켓401을 실측했다. 플랫폼 환경 변경 우회는 하지 않았다.
- 실제 dispatch request86은200/available=true·처리0, 다음 request87은 합성 만료 FCM 경로1개를 처리해 gone1/200이었다. 이는 실제 공급자 만료 응답/연결 정리 증거이며 실제 단말 알림 수신 증거는 아니다. 이후 자동 Cron도 활성 상태다.
- 실제 receipt HTTP fixture: 서버 Date 기준으로 알림 시각 전 거부, 잘못된 계정·기기·revision·증명과 ACK 거부, 최소 최신 제목 응답, 표시 ACK/중복 식별, 완료·되돌리기·시각 변경·삭제·계정 재연결 차단, 다른 계정 계획 전체 불변을 통과했다. 수신용 lease는 격리 계정에 관리자 트랜잭션으로 준비했으며 물리 알림 권한을 요청하지 않았다.
- 최신 전체 Node197·공통 Deno138·실제 암호화2/안전한 import guard1, frozen 진입점 check/typecheck/lint/Pages 정적빌드 성공. 새 fixture의 실제 API 통합12개도 exit0(session33376), worker/receipt RPC·state의 두 계정 직접 접근42501 포함이다. 정리 후 시험 사용자0/구독·예약·전달0·기존계획3 확인, 인증/seed/cleanup/생성 store 모듈 제거. 서버 전용 no-policy INFO8·기존 password WARN1, 새 WARN/ERROR 없음.

**남은 UX10:** 브라우저 SW·기기 증명/계정 마커·알림 설정/해제·로그아웃 차단·수신/클릭 흐름, 최종 CI/Pages/동일 SHA 운영 검증. 실제 OAuth·물리 단말 권한/수신은 마지막 사용자 인수로 유지한다. UX11 미착수.

## 브라우저 수신·계정 연결 기본 인수 — 2026-10-28

- static SW/core, scope별 IndexedDB proof/epoch·최대500개 표시 이력, 계정/revision/기한+서버 receipt 확인, 표시 후 durable commit/ACK와 실패 시 닫기, 현재 계정만 내부 날짜 시간표로 이동하는 경로를 추가했다. 앱은 최초 조회 때 Worker나 구독을 자동 생성하지 않는다.
- Node 모사 수신6개: 서버 parser와 계약 일치·다른 계정/기기/revision/만료 거부·동시 중복 직렬화·최소 알림 데이터·표시 중 로그아웃·쓰기 실패 닫기·ACK 실패/재시작 중복 방지·클릭 자격·이력 상한. 브라우저 권한이나 실제 showNotification 성공을 뜻하지 않는다.
- Node 클라이언트6개: 사용자 동작 즉시 권한 요청, 거부/닫기 시 미등록, Pages scope·정규 subscription JSON 서버 parser 통과, 서버 승인 후 bind, 오프라인 로그아웃의 선행 차단, 계정 변경/지연 bind 차단, 원격 해제·권한 철회·계정 정렬을 확인했다. 추가 store 시험은 차단 실패 시 signOut 거부와 정리 중 다른 계정 보호를 확인했다.
- 실제 격리 scope의 SW/IndexedDB: transaction commit/abort·오래된 요청 거부·동시 bind 하나만 성공·proof 보존·새로고침 후 차단 복원. Worker/DB/marker 정리 완료. [저장 증거](evidence/UX10-push-storage.jpg). 사용자 권한·실제 구독·provider 요청 없음.
- 실제 전용 이메일 계정 프로필: 알림 꺼짐/켜기/조회/연결 기기0 UI, 초기 권한 요청·자동 Worker 등록 없음, 앱 로그아웃 후 SSO 복귀와 scope/Auth 제거.390×480 다크 프레임에서도 알림/로그아웃 접근·마지막에서 닫기로 키보드 순환. [프로필 증거](evidence/UX10-profile-reminders.jpg)는 시험 이메일/이름을 화면에서 마스킹했다. 원래 저장소 키/값 전체 바이트 일치 복원, iframe/임시HTML 제거.
- 첫 실제 로그인 시 로컬127.0.0.1:3200이 plan-sync CORS에 없어 실패했다. 이 정확한 개발 origin만 추가해 plan-sync v12 ACTIVE/SHA `4a5491f9ee3a1c73d8d56eddc9cbad4d2676a55ab463f9823fc818823a50835c`, 원격11개 소스 일치. 로컬 preflight204/허용 헤더, 임의 origin403/무인증401과 재시도 로그인 성공을 확인했다. 인증/소유권·CAS를 완화하지 않았다.
- 전체 Node210/typecheck/lint/Pages build 성공. 클라이언트 연결 후 실제 API 통합12개 exit0(session53041, plan-sync12 CORS 수정 전 v11); 그 뒤 v12는 위 실제 UI 로그인/로그아웃 및 CORS 인수 범위로 확인했다. fixture 사용자0/구독·예약·전달0·기존계획3, 인증·seed·cleanup·생성3모듈/임시HTML 정리.
- 서버 commit d786403의 CI40644144497/verify122668936215는 Node197/Deno138/암호화2+guard1/진입점check/type/lint/Pages build 성공, PR deploy는 정상 skipped다. 이번 클라이언트 변경을 검증한 CI로 재사용하지 않는다.

**남은 UX10:** 실제 브라우저에서 권한·구독을 모사한 켜기/끄기/실패·계정 전환과 알림 클릭 날짜/초안 보존 확인, client 최종 CI·Pages 동일 SHA 운영 인수. 물리 권한·실물 수신·OAuth는 마지막 사용자 체크리스트로 유지한다. UX11 미착수.

## 최종 브라우저 연결 흐름·배포 전 QA — 2026-10-28

- 실제 시험2계정/Auth/기기 API/Service Worker/IndexedDB를 사용했다. iframe의 Notification·PushManager만 모사하며 실제 부모 브라우저의 권한과 공급자 구독은 바꾸지 않았다. 테스트 계정에는 빈 계획만 사용해 공급자로 전송할 예약도 만들지 않았다.
- 최종 전체 흐름: 최초 꺼짐/자동 요청 없음 → 권한 거부 시 미등록 → 명시적 켜기/서버 승인 후 A bind → 끄기/서버 해제 → 오프라인 끄기 실패에도 로컬 차단·꺼짐 안내 → 기기 목록을 펼쳐 원격 해제 → 다시 켜기/앱 로그아웃 → B 로그인은 꺼짐/명시적 켜기 후 같은 설치 소유 이전 → 등록 HTTP 응답을 잡아둔 채 로그아웃 후 응답 해제/재연결 없음 → A 재로그인/입력 초안 작성/알림 날짜 URL 이동을 통과했다. [최종 결과](evidence/UX10-browser-flow.jpg).
- 실제 발견한 결함: 날짜 이동 effect가 SSR의 임시 익명 workspace에서 먼저 실행되어 저장된 계정 초안을 덮었다. useLocalDraft의 hydration 완료를 확인하고 실제 Auth 사용자·현재 scope·컴포넌트 scope가 같을 때만 적용하도록 고쳤다. 같은 전체 흐름을 고정된 소스로 재실행해 `2026-11-01`·rhythm·입력 초안 원문 보존을 확인했다. 순수 수신 클릭 정책 시험과 실제 날짜 URL 소비 시험을 구분하며 OS 알림 클릭 성공으로 확대하지 않는다.
- 시험 하네스가 React의 처리 중 상태 반영 전에 다음 기기를 누르던 문제도 보완했다. 최종 실행은 갱신 완료 피드백과 활성/표시 상태를 기다린 뒤 실제 사용자 순서로 조작했으며 전체 PASS였다. 제품 오류나 인수 조건 완화로 기록하지 않는다.
- 정리: Worker/해당 scope DB/iframe 제거·원래 저장소 키/값 원문 일치·부모 권한 불변 확인, 비밀을 포함한 임시 HTML 삭제. 새 계정으로 plan-sync v12와 최신 client store를 포함한 통합12개도 성공(session49760 exit0). 시험 사용자·구독·예약·전달0, 기존 계획3, 운영 Cron2 활성. fixture/seed/cleanup/생성3모듈 모두 정리했다.
- 홈 화면용 정적 manifest(standalone, 상대 URL), 기존 SVG에서 생성한192/512 PNG와 Apple 아이콘 metadata·한국어 문서 언어를 추가했다. Pages build 성공, `verify-push-export.mjs`로 local/Pages scope·아이콘 크기·실제 HTML 링크·SW 소스 일치·시험 파일/계정의 export 미포함 확인. CI에서도 업로드 전 검사한다. 실제 iOS 설치/수신은 사용자 인수로 남긴다.
- 최신 Node210·typecheck/lint/Pages build 성공. 서버 advisor는 의도적 서버 전용 no-policy INFO8/기존 password WARN1, 신규 WARN/ERROR 없음.

남은 개발 게이트는 최신 커밋 CI·Pages 배포와 같은 SHA의 운영 화면/정적 자산/서버 예약 확인이다. 이를 확인한 뒤 UX11로 진행한다. 실제 OAuth·물리 권한/수신·실기기 사용성은 전체 작업 마지막 사용자 인수로 유지한다.

## UX10 운영 배포 게이트 완료 — 2026-10-28

- PR28 최종 head `1e13b91f7d932db9c7cf723de3e25e0636d32557`, CI40705972616/verify122878063576 성공. Node210/Deno138/실제 암호화2+위험 환경 guard1·Edge 진입점check/type/lint/Pages build/export 검증 로그를 확인했다.
- 병합 SHA `c361c3d6d53e1a6bce72b0cb9cfa491c2bc316df`. master run40706275653의 verify122879150828·deploy122879810333 모두 success. deployment7388172986도 같은 SHA의 success이며 환경 URL은 운영 `/oddk-todo/`다.
- 실제 운영 todo/manifest/SW/core/192·512 PNG 모두200. JS는 로컬 소스(LF 정규화)와 전체 일치, PNG는 원본 바이트 일치. manifest MIME application/manifest+json·standalone scope/start URL·HTML manifest/Apple 아이콘·ko 언어·양쪽 SSO를 확인했다. 실제 브라우저 Google/GitHub 버튼 enabled=true·기본 화면 렌더·warn/error0. [운영 화면](evidence/UX10-deployed.jpg). 사용자 데이터/권한/OAuth를 조작하지 않았다.
- 운영 task-maintenance·push-worker Cron2 활성, worker/maintenance 최신 HTTP200·timeout=false/error=null, worker 처리0·실패0. 시험 자료0·기존 계획3, primary 소스도 같은 병합 상태로 fast-forward했고 사용자 CSS SHA256 `36ABC08A32269D3ED013C372DD10C07BB718C28489AABF0806C5FC2CC4FBAC83` 및 미커밋 로고/별도 계획을 보존했다.
- 이로써 UX10의 소프트웨어 완료 조건·QA·단계별 배포 게이트를 완료했다. 실제 OAuth/물리 권한·전달/실기기·독립 사용성은 사용자 요청대로 [최종 사용자 목록](FINAL-USER-CHECKS.md)에 남기며 이번 단계의 모사 결과로 통과 처리하지 않는다. 다음은 UX11 실제 시간 기록이다.
