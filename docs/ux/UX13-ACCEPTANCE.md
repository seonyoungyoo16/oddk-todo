# UX13 출시 묶음 최종 인수

2026-10-29 · 상태: 소프트웨어 인수 완료, 이 문서 묶음의 최종 CI/Pages 게이트 대기. 실제 OAuth·물리 기기·독립 사용성은 사용자 인수 대기다. 모든 환경의 출시 검증 완료로 해석하지 않는다.

## 범위와 판단

UX00~UX12를 순서대로 각 단계의 구현·QA·같은 SHA 운영 배포 확인 뒤 진행했다. UX12 최종 운영은 `d5f20a84711a948cf381bf13093267cebeacc508` / PR30 / master40735948548 / deployment7392630187이다. 프런트 JS9개 전부 검증 빌드와 바이트 동일, 서버는 plan-sync13과 execution2다. UX13은 최종 통합 흐름·증거 대조·운영/복구 문서와 사용자 인수 목록을 정리한다.

새 차단/중대 소프트웨어 결함은 남아 있지 않다. 실제 OAuth·물리 전달·독립 사용성은 미실행 범위이며 성공으로 대신 표시하지 않는다. 각 단계의 과거 체크포인트는 당시 상태로 보존하고 최신 판정은 이 표와 각 문서의 마지막 운영 게이트를 따른다.

## QA 요구사항 → 시험 → 결과·증거

| ID | 인수 항목 | 소프트웨어 결과 / 근거 | 남은 범위 |
|---|---|---|---|
| Q01 | 비로그인 등록·재방문 | PASS: UX01, 최종 브라우저 새 한글 업무 ID/날짜·reload 보존 | 저장소 직접 삭제 시 보존 보장 아님 |
| Q02 | 날짜·필터·화면 이동 초안 | PASS: UX01/03/05, workspace/draft 시험 | 없음 |
| Q03 | 새로고침·종료/복귀 초안 | PASS: UX01 실제 탭 재생성, 최종 editor 닫기/reload 복원 | OS 강제종료는 H07 |
| Q04 | 계정/비로그인 격리 | PASS: sync-compatibility, 실제 UX10/11/12 A응답 hold→B로그인·원래 계정 복귀 | 실제 OAuth/두 기기 H01~03 |
| Q05 | quota·실패·재시도 | PASS: UX01/04/07/11/12 실제 저장 실패 주입·입력/원안 유지 | 저장 권한 실기기 H07 |
| Q06 | 긴 메모·한국어·줄바꿈 | PASS: UX02 자동높이·2000/2001자·브라우저 조합 이벤트, 최종 한글 메모 저장 | 물리 IME/보조기술 H07 |
| Q07 | 완료/삭제·undo | PASS: UX02/06/07/09/11, 최종 완료undo·계획/목표/메모 유지 | 없음 |
| Q08 | 일간·주간·전체 동일 ID | PASS: UX03, 최종 day/week/all + 미배정 제외 | 없음 |
| Q09 | 달력 경계 | PASS: calendar/date/plan 단위·UX03 연말 실제 날짜 이동 | 없음 |
| Q10 | 미배정·완료 집계 | PASS: day-selectors/task-period·최종 날짜 없음의 주간 제외 | 없음 |
| Q11 | 09~10/여유10 = 60/50/10 | PASS: schedule/editor·UX04·최종 V3이전/수정저장/시간표 | 없음 |
| Q12 | 부분·잘못된 시간·상한·자정 | PASS: 공통 Node/Deno·실제 account-v4·UX04 editor/이전·복구 | 실제 단말 입력 H07 |
| Q13 | 계획120/점유90·충돌 | PASS: schedule/availability·UX04 브라우저, 숨김 충돌 포함 | 없음 |
| Q14 | 연속 배치 허용 | PASS: 공통 구간 시험·UX04 09~10/10~11 충돌 없음 | 없음 |
| Q15 | 숨긴 일정 충돌 | PASS: UX05 필터 유지/다른 분류 충돌 링크, 계산은 전체 대상 | 없음 |
| Q16 | 분류·태그AND·검색 | PASS: classification 공통/실제계정·UX05 결과 개수/초기화 | 없음 |
| Q17 | 분류 변경·삭제 보존 | PASS: account-classification·UX05 이름/색상/삭제·undo | 없음 |
| Q18 | 중요도·마감·수동 순서 | PASS: task-order/account-planning·UX06 표시정렬/숨긴 슬롯/재방문 | 없음 |
| Q19 | 여러 날짜 선택·일괄 처리 | PASS: bulk-actions/account-planning·UX06 취소/완료/삭제/복원·숨김 안내 | 없음 |
| Q20 | 가변 목표·할 일 관계 | PASS: goal-tree/plan-v5/account-goals·UX07 9번째/분할/완료/삭제undo·최종 같은 업무 표시 | 없음 |
| Q21 | 기존8×8 이전·복구 | PASS: plan-v5/goal-tree·UX07 이전초안, 최종 native V3→V5/원문백업·목표 ID | 없음 |
| Q22 | 여행 실패·모호함·중복 | PASS: [UX08](UX08-ACCEPTANCE.md), 실제 공개 경로3수단/수동대안/계정9개·브라우저/비교32→20 | 실시간 교통·체류 자동검색은 범위 밖, 독립 유용성 H08 |
| Q23 | 드래그·대체 조작·취소·stale | PASS: [UX09](UX09-ACCEPTANCE.md) 포인터/키보드버튼·실패·계정, 공통 movement 회귀 | 실제 터치 H07 |
| Q24 | 반복 범위·월말·건너뛰기 | PASS: [UX10](UX10-ACCEPTANCE.md), recurrence/editor/calendar/window·실제계정/DB·브라우저 범위 인수 | 실제 두 기기 H03 |
| Q25 | 알림 허용/거부·변경/종료 | 소프트웨어 PASS: 실제 기기 API/DB/SW/IDB + 권한/구독/수신 모사 범위 구분 | OS 권한·실물 전달·설치 H04~06 |
| Q26 | 기록 pause/resume/correct/reload | PASS: [UX11](UX11-ACCEPTANCE.md), 실제 DB/API/native/계정 UI·계획/실적 분리 | 실물 절전/시계/두 기기 H03/07 |
| Q27 | 남은 시간 재조정 | PASS: [UX12](UX12-ACCEPTANCE.md), 공통9/복구4/서버3·실제API12그룹/원자DB/native·계정UI | 두 물리 기기 H03 |
| Q28 | offline/outbox/동시 편집 | PASS: sync-compatibility/실제 account-store·각 기능CAS/UX12 offline·응답유실 확인 | 자연 JWT 만료·실기기 회선 전환 H03 |
| Q29 | 작은 화면·테마·확대 | 390px/다크·가로 넘침 없음 PASS: UX04/07/11/12 및 UX13 최종 제품 확인 | 실제200% 확대·휴대전화 H07, 자동 확대 성공으로 표시하지 않음 |
| Q30 | 키보드·초점·이름·비색상 구분 | 소프트웨어 PASS: 닫기/저장/순환/복귀, labels·완료 취소선·아이콘/문자 병행 | 보조기술 읽기 순서 H07 |
| Q31 | 첫 사용자 이해·관계 | 소개/오늘·주간/목록·시간표/목표 구조 구현·최종 동작 확인 | 독립 사용자가 설명 없이 과제를 수행하는 시험 H08 미실행 |
| Q32 | 구 캐시·손상/미래·롤백 | PASS: store-validation/sync-compatibility/plan-v4/v5/recurrence·실제 구버전426/최종 raw 보존/복구화면 | 운영 DB를 파괴적으로 되돌리는 시험은 하지 않음 |

각 행의 과거 브라우저 근거는 [진행 기록](UX-PROGRESS.md)의 해당 UX 단계/같은 이름의 evidence 파일에 있다. 현재 전체 Node260/Deno187·14파일 실제 통합 결과는 아래와 같다. 이전 화면 시험을 모든 브라우저 버전에서 재실행한 것처럼 쓰지 않는다.

## 이번 최종 통합 검증

- [브라우저 통합 흐름](evidence/UX13-combined-flow.png): 실제 native 저장소에 합성 V3 원문/8×8/오늘·내일·미배정3건을 넣고 앱으로 이전했다. before-v4/v5 원문 바이트 동일, V5/종료10:00·60/50/10/목표 연결 유지 → 오늘/주간/전체 동일 ID → 수정 메모 close/reload 복원 →09:30~10:30/여유10·한글 메모 저장 →완료/undo →목표의 같은 업무 →새 한글 업무/reload →손상 원문 `{broken` 유지/복구화면 →정상 원안 재로딩을 확인했다.
- fixture 없는 최종 앱/브라우저 확인과 실제 저장소 복원 완료 후 QA route를 제거한다. 새 계정/실적/알림 자료를 만들지 않았고 이전14파일 통합 fixture도 이미 제거했다.
- Node260 / 공통 Deno187 / 푸시 실제 암호화2+위험 환경 guard1 / 전체 Edge check / type/lint / Pages build/export를 최종 CI로 확인한다. 14개 실제 통합은 UX12의 고정된 서버/클라이언트에서 새2계정 실행 exit0(session1631), UX13은 앱/서버 코드를 바꾸지 않는다.
- plan-sync13 반환15파일 동일, execution2 유지, Cron2 활성/최근 HTTP200·timeout false/error null. testusers0·실적records/state0·기존계획3, 서버전용 RLS INFO11/기존password WARN1. 닫힌 과거 검증 Edge2개는 원격 원문410/데이터 접근 없음 재확인했다.
- README의 V3/자정 시작일 합산/계정 전환 초안 초기화 등 오래된 설명과 RELEASE의 OAuth 비활성/OAUTH_READY 재활성화 지시를 현재 계약으로 교정했다. 과거 T00~11 인수 기록은 역사로 보존하며 최신 문서 링크를 앞에 둔다.

## 잔여와 출시 경계

소프트웨어 차단·중대 결함 없음. 알려진 외부/환경 제한: 실제 OAuth 미실행, 두 물리 기기/OS 푸시·설치/200%·보조기술/독립 사용성 미실행, 브라우저 저장소 삭제·사생활 보호 모드 보존 한계, 공개 경로 서비스의 한도·실시간 교통 미반영. 미실행 항목은 [사용자 확인 목록](FINAL-USER-CHECKS.md)에 모았다.

기존 Auth password WARN1은 이번 SSO 설정/데이터 변경 없이 남긴 설정 위험이다. Actions v4의 Node20→24 강제 실행과 ubuntu-latest OS 전환 안내는 비차단 runner 경고이며 실제 CI/빌드는 성공한 환경으로 기록한다. 의존성·보안 설정을 임의로 바꿔 경고를 숨기지 않는다.

ALPEN 최종 블록: A 요구사항/증거 대조 → L 통합 흐름/운영 확인 → P 실패·복원·문서 교정 여유 → E 보호/이전/인증 경계 우선 → N 불변SHA·배포·사용자 미검증 범위 분리. 실제 경과 시간을 정밀 측정하지 않았다.
