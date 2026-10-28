# UX12 남은 시간 재조정 인수

2026-10-29 · PR30 · 운영 이전 기준 e2da19e(UX11). 소프트웨어 QA와 같은 SHA Pages 운영 게이트 완료.

## 완료 조건과 증거

| 범위 | 결과 | 증거 |
|---|---|---|
| 오늘 전체 미완료 대상·필터 독립·완료/다른 날짜/날짜 없음/요약 유지 | PASS | `tests/unit/replan.test.mjs` 9개 Node/Deno |
| 고정·보호/전날 이어짐·활동 구간·마감→중요도→우선순위→수동 순서 | PASS | 공통 모델 시험, 보호 충돌은 전체 제안 거부 |
| 총량/연속 구간/마감/미설정 미배치 이유·소요시간/여유 불변 | PASS | 공통 모델·native UI 실제 결과 |
| 반복 이번만 예외·원본/미래/완료/목표 유지·undo | PASS | 공통 모델9 및 기존 repeat/plan-history 회귀 |
| 승인 전 불변·취소·미배치 시각/시작 알림 해제 명시 | PASS | [native 브라우저](evidence/UX12-native-browser.png) |
| 계획과 실적 두 버전·원자 적용·service-only·타계정 격리 | PASS | migration165034, `tests/replan-database.sql` 전체 rollback, 실제 두 계정 API12그룹 |
| 열린/일시정지 실제 기록 보호·start/replan 경합 | PASS | DB/API 실제 in-flight409/200, Web Locks+native IDB 브라우저 start-first 거부 |
| 새로고침 뒤 정확한 시각 복구·다른 편집 덮지 않기 | PASS | 복구4개 Node/Deno, native UI 복구/외부 변경 거부 |
| 복구안 quota 실패·입력 유지·재시도 | PASS | 실제 iframe Storage.setItem 실패 주입→원안 불변→복구안 저장 후 재시도 |
| 저장 응답 유실/오프라인·실적 변경·계정 전환 | PASS | [실제 Auth/API/DB UI](evidence/UX12-account-browser.png): 저장 뒤 응답 유실→pull 확인, 오프라인→명시 재시도, preview 뒤 실제 start/stop→거부, A응답 hold→같은 문서 B로그인→A 정보 비노출 |
| 작은 화면·다크·키보드·초점 | PASS / 실물 제외 | [390px 다크](evidence/UX12-mobile-dark.png), 실제 client375=scroll375/dialog324=scroll324, 취소에서 Tab→첫 time input, Escape→닫힘/원래 버튼 초점, 새 제품 탭 warn/error0 |
| 자료 정리·사용자 원본 보존 | PASS | [native 복원](evidence/UX12-cleanup.png), 계정 브라우저도 signed out/원본 저장소 복원 확인. DB 계획3/실적0/state0/시험사용자0. primary 사용자 CSS 해시 유지 |

## 최종 검증

- Node260 / 공통 Deno187 모두 성공. 모든 Edge 진입점 check, typecheck/lint 성공.
- 새 실제 fixture 전체 API 통합14파일 exit0(session1631), 실행13그룹과 재조정12그룹 포함. 실제 OAuth나 물리 기기로 확대하지 않는다.
- Pages build/export 성공: 공개 경로는 홈/todo/manifest/not-found뿐, SW/core/아이콘/manifest 일치 및 QA 경로·계정 표식 미포함. 임시 두 QA route와 credentials/seed/cleanup/generated SDK store 제거 후 빌드했다.
- plan-sync13 ACTIVE/hash `d39127e075b98cb52784733f8cd2e4b0a10b9cace00ae9ebe7f97d64ab946dc7`, 반환15파일 전부 배포 입력과 원문 일치. type-only `_shared/execution.ts`는 원격에서 반환하지 않는다. execution2 및 기존 다른 서비스 변경 없음.
- 브라우저 도중 발견한 render-time Date 읽기는 부모의 hydration 이후 today snapshot을 전달하도록 고쳤다. 기존 동기화 중에는 적용 버튼을 비활성화하고 종료 후 조작하도록 했다. 고정된 소스로 실제 계정 UI 전 흐름 재실행 PASS. Next 진단은 올바른 사용 오류 안내이며 프레임워크 결함으로 기록하지 않는다.

## 제한과 복구

재조정은 오늘만, 이미 기록 중인 작업은 종료 후 가능하다. 실제 소요 시간을 예상 시간에서 자동 차감하거나 다음 날짜로 자동 이월하지 않는다. 계정은 서버 승인 후 확정하며, 서버 적용 뒤 로컬 저장 실패/다른 로컬 변경 발생은 성공처럼 감추지 않고 재동기화/비교를 안내한다. 응답 미확정이면 복구안과 미리보기를 보존하고 현재 서버 상태부터 확인한다.

비로그인은 최신 계획 동기 비교 후 저장하며 시간 기록과 재조정만 Web Lock으로 직렬화한다. 모든 일반 localStorage 편집이 DB 트랜잭션이 되는 것은 아니다. Web Locks 미지원 시 재조정은 거부하고 기존 기능/계획/실적을 유지한다. 복구안은 계정별 해당 브라우저 보관이며 동기화 계획/실적과 별도다.

실물 OAuth·두 기기·OS 권한/푸시/절전·200% 확대/보조기술·독립 사용성은 [마지막 사용자 목록](FINAL-USER-CHECKS.md)에서만 인수한다. 실제 경과 시간을 기록하지 않은 블록을 임의 측정값으로 보고하지 않는다. ALPEN 기준 모델→저장 경쟁→UI→실패 복구→배포로 진행했고 검증 여유 블록을 재시험에 사용했다.

## 운영 게이트 완료

PR30 head d61da4b904d107223461d80409e8d2a530ba86b3, CI40735632991/verify122983267928 성공. Node260/Deno187/암호화2+guard1/전체 Edge check/type/lint/Pages build/export 로그 확인. 병합 d5f20a84711a948cf381bf13093267cebeacc508의 master40735948548 verify122984407944/deploy122985055586 모두 success. deployment7392630187 SHA일치/success.

운영 HTML200, JS9개 모두200·검증 로컬빌드9개 전부 바이트 동일, 재조정·실적 API 코드 포함. manifest200/standalone와 SW/core/192·512 PNG4개 동일. [운영 화면](evidence/UX12-deployed.png): 새 재조정 영역·선택한 다른 날짜에서 오늘만 가능 안내·SSO enabled·console0. 사용자 날짜/초안/계획을 수정하지 않았다.

plan-sync13 원문15개 일치·execution2 유지. Cron2 enabled/최근3분 net HTTP6/6 상태200·timeout false/error null. Advisor INFO11(서버전용표)/기존 password WARN1, 신규 WARN/ERROR 없음. primary도 같은SHA로 fast-forward했고 사용자 CSS 해시와 미커밋 로고·별도문서를 보존했다. 이 게이트 뒤 UX13을 시작한다.
