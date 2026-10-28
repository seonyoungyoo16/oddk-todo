# 릴리스·운영·복구 절차

2026-10-29 UX13 기준. T00–T11의 과거 상태는 `verification/`에 보존하고, 현재 인수/배포 결과는 [UX13](ux/UX13-ACCEPTANCE.md)과 [진행 기록](ux/UX-PROGRESS.md)을 우선한다. Google·GitHub 로그인은 활성화하며 사용자 실제 OAuth 인수 보류를 이유로 비활성화하지 않는다.

## 배포 순서

ALPEN: A 모델/저장/화면/시험/정리로 분해 → L 집중50분 추정 → P 수정·검증 여유15분 → E 데이터 보호와 호환 백엔드부터 → N 단계 증거와 미검증 환경 갱신. 외부 CI 대기는 집중 시간에 넣지 않고 실제 계측하지 않은 시간을 실측으로 만들지 않는다.

호환 DB/Edge 배포·원격 원문 검증 → 실제 격리 계정/DB·브라우저 QA → PR CI → 병합 → master Pages → 같은 SHA deployment와 운영 화면·자산·Cron 확인 후 다음 단계다. 단순 Pages 성공으로 DB/Edge 적용을 대신 판단하지 않는다.

~~~powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
$env:GITHUB_PAGES='true'
try {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'build failed' }
  node tests/verify-push-export.mjs
  if ($LASTEXITCODE -ne 0) { throw 'export verification failed' }
} finally { Remove-Item Env:GITHUB_PAGES -ErrorAction SilentlyContinue }
~~~

`npm start`는 일반 Next 서버용이다. Pages는 `.github/workflows/pages.yml`에서 out/을 배포한다. 루트/`/todo/`/manifest와 not-found 이외의 임시 QA 경로는 export하지 않는다. 로컬 검증용3200은 기본3000과 분리한다.

## 현재 서버와 저장 계약

프로젝트 `synxmskamifpovuziecx`. plan-sync13 / execution2 / travel-lookup2 / task-maintenance1 / push-subscriptions2 / push-worker2 / push-receipt1. plan-sync hash `d39127e075b98cb52784733f8cd2e4b0a10b9cace00ae9ebe7f97d64ab946dc7`, 최신 재조정 migration `20261028165034`. 활성 Cron은 oddk-task-maintenance·oddk-push-worker 두 개다. 정확한 배포/함수 원문·인수는 각 단계 문서에 기록한다.

- 계획 schemaVersion V5/V6와 서버 CAS version을 구분한다. V1~V4는 원문 백업 후 이전하며 V6→V5 구형 쓰기는426으로 중단한다. 기존 날짜 없는 업무·점검을 임의 배정하지 않는다.
- 브라우저는 자기 계획 SELECT만 허용한다. 직접 쓰기와 실적·알림·캐시 테이블 조회는 차단하고 Edge가 사용자 인증/검증/소유권을 확인한다. 서비스 키·VAPID 비밀·토큰은 문서/브라우저/로그/저장소에 넣지 않는다.
- 계획409는 전체 비교·선택이며 선택하지 않은 쪽을 계정별 백업한다. 자동 병합하지 않는다. dirty 변경은 전송 도중 편집·재연결·401에서도 보존하고426이면 새로고침을 요구한다. 미전송 변경이 있으면 로그아웃을 차단한다.
- 실제 기록은 계획 JSON과 별도며 소유자별 단일 열린 기록/동작ID 재시도/revision을 사용한다. DB는 계획→실적 state 순으로 잠근다. 의도한 충돌은 PT409이며 SQLSTATE40001을 업무 오류에 쓰지 않는다.
- 재조정은 plan/actual 두 버전·열린 기록 없음·오늘/현재 이후를 원자 검사한다. 계정은 온라인 서버 확인 뒤 확정하며 응답 유실은 pull로 같은 version/변경안을 확인한다. 미확정이면 재동기화부터 한다.
- 비로그인 실제 기록은 native IDB transaction.oncomplete 이후 확정한다. 시간 기록과 재조정은 Web Locks로 직렬화한다. 일반 localStorage 편집 전체가 트랜잭션인 것으로 가정하지 않는다.
- 초안/undo/재조정 시각 복구안은 브라우저 계정 범위별이다. 재조정 복구는 메타데이터 지문/시각 일치 때만 수행한다. 이미 변경/삭제/완료한 업무를 덮지 않는다.

기존 검증용 plan-sync-t03-verification3 / t04-verification2는 원격 파일을 다시 읽어 데이터 접근 없는410 응답 한 줄인 것을 확인했다. 닫힌 검증 endpoint의 메타데이터가 ACTIVE로 남아 있는 것을 실제 서비스로 오인하지 않는다.

Advisor INFO11은 의도한 서버전용 RLS 표다. 기존 leaked password protection WARN1은 유지된 알려진 설정이며 OAuth 인수 통과를 의미하지 않는다. 이번에 Auth 보안 설정을 임의 변경하지 않았다.

## 실제 통합시험과 정리

1. `node tests/prepare-account-fixture.mjs`로 무시된 fixture/seed/cleanup SQL을 생성한다. 기존 fixture가 있으면 그 실행부터 정리한다.
2. 신뢰하는 관리자 연결에서 seed SQL을 적용한다. 비밀번호·토큰·SQL 원문은 출력하지 않는다.
3. `npm.cmd run test:integration`은 격리 계정 두 개에14개 파일을 순서대로 실행한다. 마지막 재조정 시험까지 실행하며 실패 즉시 중단한다. 실행 시험은 새 fixture의 초기 revision을 전제로 하므로 재실행 때 새 fixture를 만든다.
4. 결과와 관계없이 marker로 제한한 cleanup SQL을 적용해 시험 사용자·세션·실적/구독/예약을 정리하고 기존 실제 계획 수를 확인한다. fixture·seed/cleanup·생성 SDK store·임시 app QA route를 제거한 뒤 정적 빌드를 한다.
5. 브라우저 QA는 원래 key/value/IDB를 보관하고 복원 완료를 확인한 뒤 페이지를 제거한다. 실제 사용자의 업무나 계정을 시험에 쓰지 않는다.

## 장애·복구·롤백

- 저장소 손상: 원문을 다운로드/보관하고 정상 저장본 복구를 선택한다. 읽기 실패를 빈 계획으로 덮거나 localStorage 전체 삭제로 해결하지 않는다.
- 409: 양쪽 내용을 비교하고 백업한 뒤 선택한다. 다시 원격 변경이 있으면 최신 버전으로 재비교한다.
- 401/오프라인/미확정: 미전송 내용·복구안을 유지하고 연결/인증 상태를 복구한 뒤 서버를 읽어 확인한다. 백업 다운로드가 dirty를 해제하지 않는다.
- 실제 기록: 활성/일시정지 상태는 보존하고 마지막 확인 시각을 본다. 종료 기록만 가져오며 계정으로 가져올 때 현재 업무에 명시적으로 연결한다. 충돌한 ID나 겹친 실제 구간은 원자 거부한다.
- 코드 롤백: 마지막 검증 커밋을 별도 PR로 복원하되 최신 계획 V6를 읽을 수 있는 버전인지 먼저 확인한다. 구형 프런트가426으로 거부되는 것을 데이터 손실로 처리하지 않는다. DB 표/사용자 자료를 되돌리거나 삭제하지 않는다.
- 백엔드 롤백: 이전 함수/서명과 현재 스키마·실적/알림 의존성을 먼저 확인한다. 프런트만 롤백해도 Edge/DB는 자동 복원되지 않는다. 배포 후 원문/버전·불변 SHA·실제 경로·Cron 상태를 각각 확인한다.

실제 OAuth·물리 두 기기·OS 알림/설치·보조기술·독립 사용성은 [최종 사용자 확인](ux/FINAL-USER-CHECKS.md)에 모은다. 관리자 비밀이나 실제 로그인 정보를 채팅에 보내도록 요구하지 않는다.
