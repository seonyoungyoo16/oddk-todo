# UX11 실제 시간 기록 인수

상태: 소프트웨어 인수 통과, 최종 CI/Pages 동일 SHA 운영 검증 대기. UX12에 착수하지 않는다.

## 제공 범위

- 목록에서 작업 시작, 현재 기록에서 일시정지·작업 재개·명시적 휴식·종료. 다른 업무는 확인 후 기존 종료+새 시작을 함께 저장한다. 시간 기록 종료와 할 일 완료를 구분한다.
- 계획 작업/여유/수행 값과 시작 당시 제목·계획 날짜를 보존한다. 실제 작업/휴식은 수행 날짜의 한국 자정으로 나누며 일시정지 공백은 합산하지 않는다. 일별 계획은 업무당 한 번, 실적은 전체 기간 기록을 합산한다.
- 계정은 별도 서버 테이블/RPC/인증 Edge, 비로그인은 별도 IndexedDB의 commit 완료 후 확정한다. 계정 전환은 작업 공간·실적을 분리하고 이전 응답으로 새 계정 UI를 덮지 않는다.
- 수동 입력/보정은 구간·변경 전후 합계와 확인을 거친다. 보정창을 열 때의 revision을 고정하고 입력 중 정기 조회를 멈춘다. 다른 기기 변경은 저장 시 CAS로 거부하며 입력/서버 기록을 보존하고 최신 상태로 다시 확인하게 한다.
- 별도 실적 백업, 종료 기록만 가져오기, 계정 할 일과 명시적 연결. 진행 중 기록은 가져오지 않고 기존 ID/시간을 덮지 않는다. 계정으로 가져올 때 현재 연결 대상의 계획 snapshot을 사용하는 사실을 미리 설명하고 원본 백업을 받는다. 계획 복구로 타이머를 덮지 않는다.

## 요구사항 → 시험 → 결과

| 범위 | 검증 | 결과/증거 |
|---|---|---|
| Q26 전환·합계·계획 불변 | 공통 모델9/명령7/로컬6/입력2개, 정확한 ms·자정·일시정지·64구간·24시간 cap·시계 역행 | Node/Deno 통과, `tests/unit/execution*.test.mjs` |
| 서버 구조·소유권 | strict JSON 검증44개 Node↔실제 SQL, user 복합키·단일 open·active 포인터·RLS/ACL | 차이0, 실제 rollback SQL PASS |
| 실제 저장·경합 | 두 계정 HTTP13그룹. 동시에 in-flight 시작1성공1충돌, operation 재실행·변경 hash 거부·CAS/no-op·수동 보정/겹침 실패 원복 | `tests/account-execution.test.mjs` PASS. DB 세션 실행 시각의 동시성으로 과장하지 않음 |
| 완료·삭제·undo | 실제 plan-sync 완료/삭제 시 열린 기록 종료, undo는 재시작하지 않음, 이력 유지 | 실제 API·rollback SQL PASS |
| 로컬 실제 저장 | native IDB readwrite 동시 시작 한 건, transaction abort 원문 보존, 실제 UI 시작/정지/휴식·새로고침·전환 취소/확정 | `UX11-browser-flow.png` |
| 입력·실패 복구 | 수동 입력 닫기/재열기, 미래 보정 거부·정상 보정·재열기, native put 실패/abort·같은 요청 재시도, 완료 후 undo | 전체 로컬 브라우저 PASS. 재로딩 하네스는 새 URL의 DOM 로드를 기다리도록 보완 |
| 원격 변경·실적 복구 | 보정 중 별도 저장소 조작의 revision 변경 거부/초안·새 기록 보존, 실제 File 입력 미리보기/확인 후 native 복구, 같은 ID 다른 내용 원복 | 최종 로컬 브라우저 전체 PASS, `UX11-browser-flow.png` |
| 계정·오프라인·이전 응답 | 실제 Auth/API/DB에서 A 응답 보류→같은 문서 logout/B 로그인→이전 응답 반환. B 비노출·A 복귀 일시정지 보존. 오프라인 미확정 후 명시적 재시도 | `UX11-account-browser.png` PASS. 전송 실패만 iframe fetch로 모사; 실제 OAuth 아님 |
| 계정 가져오기 | 합성 File 입력→명시적 닫힌 기록/대상 확인→실제 서버 저장. actual 구간 유지·현재 대상 snapshot·열린 기록 제외·익명 IDB 원문 불변 | 실제 브라우저/API PASS. 초기 하네스의 JSONB 키 순서 비교를 구조 비교로 수정 후 새 fixture 전체 재시험 |
| Q29/Q30 | 데스크톱·390px·다크 보정창, 시작/종료/구간 조작, Shift+Tab 마지막 버튼/Tab 닫기 순환, 닫기 후 초점 복귀 | `UX11-local-history.png`, `UX11-mobile-dark-editor.png`; 모바일 client375=scroll375, 팝업 client324=scroll324 |
| Q28/Q32 회귀 | 최신 계획·목표·분류·시간표·여행·반복·알림+실적 실제 API13개 파일, 이전 형식/잘못된 값/충돌·계정 격리 | 새 fixture 전체 integration exit0. Node240/type/lint 성공. 최종 빌드/CI는 아래 갱신 |

## 서버/배포

- execution_records migration20261028151545, execution_commands20261028152946, conflict_status20261028153728. 변경 RPC는 계획 행→state 순서로 잠그며 기록 조작이 계획/version/updated_at을 바꾸지 않는다.
- execution v2 ACTIVE/hash87c71442e57ae772ef9c16f00ca0c46485440c203a0e26606f28b6c493ab6df5, 원격16파일=로컬. getUser/CORS/bounded JSON/no-store, 브라우저 직접 테이블/RPC42501.
- 초기 SQLSTATE40001의 PostgREST 재시도 문제는 공식 안내의 PT409로 교정했다. 수정 후 실제 HTTP13그룹 재시험 통과, 반복 실행 backend0.
- 서버 단계 db8dafc PR29 CI40718241291/verify122921703939 성공: Node232, Deno/Edge/암호화·type/lint/Pages/export. 이후 UI 변경의 최종 CI와 운영 배포는 별도 기록한다.
- 시험 사용자/세션·구독/알림·실적을 marker 범위로 정리, execution3표 각0/시험사용자0/기존계획3. 원래 localStorage/익명 IDB 보존, private 시험 경로/credentials는 빌드 전 제거한다.
- 최종 파일 복구 시험 뒤 별도 읽기 전용 페이지로 localhost QA 계획 없음/localStorage0/IDB revision0·record0·operation0을 대조했다(`UX11-cleanup.png`). 진단 페이지도 제거했다.

## 남은 게이트와 사용자 인수

- [x] 보정 revision 고정 최종 소스: 열린 입력창 뒤 다른 기록 버전 저장→이전 revision 저장 거부, 입력/새 실제 구간 보존, 원문 백업 후 최신 기록 재확인. 수동 입력 시각은 서버 시각+monotonic 경과로 갱신한다.
- [ ] 최종 CI·정적 export QA 자료 미포함·동일 SHA Pages 운영 화면/서버·Cron 확인.
- [ ] 200% 확대/전체 공통 회귀를 UX13 체크리스트에 합쳐 확인.
- 실제 OAuth·물리 두 기기·OS 백그라운드/시계·보조기술·독립 사용자 인수는 `FINAL-USER-CHECKS.md`에 모아 전체 작업 마지막에 요청한다. 실물 시험을 소프트웨어 모사로 통과 표시하지 않는다.

ALPEN: 저장/소유권→실제 상태 전환→입력/실패 복구→배포 순으로 집중 블록을 나누고, 각 블록 후 여유 시간을 재검증에 사용한다. 일정 추정과 실제 기록은 혼동하지 않으며 외부 CI/네트워크 대기는 별도로 본다.
