# T11 배포 인수 결과

관측:2026-10-27. 기능 기준은 PR #14 merge1392e6887b653f6674138afb8433cf2e1e7bd9c8. T11은 문서만 변경한다. 최종 T11 PR/Actions/deployment의 SHA 연결은 완료 보고에 기록한다.

## 요구사항과 증거

| 작업 | 결과 | 근거 |
|---|---|---|
| T00 | 기준선/기존 변경 보존 | BASELINE.md, PR #2 |
| T01–T02 | 공통 시간 계약/실패 시 입력 보존·CI | PROGRESS.md, PR #3–4, 단위시험 |
| T03–T04 | 서버 검증/직접 쓰기 차단/V2 계약 | PROGRESS.md, PR #5–6, 실제 서버 대조 |
| T05–T06 | 선택 날짜/일관된 통계·시간표 | PROGRESS.md, PR #7–8, 브라우저·selector시험 |
| T07 | 같은 ID 재계획/날짜별 점검 | PROGRESS.md, PR #9, 점검 충돌 브라우저 증거 |
| T08 | 이전/백업/격리/409·426·401/outbox | PROGRESS.md, PR #10, 서버 통합시험3개 |
| T09 | 두 독립 저장소 상호 반영/계정 분리 | SYNC-ACCEPTANCE.md, PR #11 |
| T10 | 전체 사용자 흐름/모바일 폭/키보드/저장 실패 | ACCEPTANCE.md, PR #12–14, evidence/ |
| T11 | 실행·복구 문서/서버 구성/최종 정적 검사 | README.md, RELEASE.md, 이 문서 |

각 작업은 PR 검사·병합·Pages 배포와 운영 정상 확인 후 다음 작업을 시작했다. T09 실제 OAuth는 사용자 보류에 따라 배포 완료 범위에서 제외했다.

## 재확인한 상태

- 39단위시험 실패0, lint/typecheck/Pages build 성공, 생성 경로 / 및 /todo. 임시 QA/fixture/서비스 키는 배포 산출물에 포함하지 않는다.
- T10 최종 배포 master Actions40520984228, verify122247683679 완료 success, deploy122248063310 원문 Reported success, deployment7361115485 SHA1392e688… 일치.
- 운영 /oddk-todo/todo/에서 합성 업무를 수정해 오늘09:00/작업25/여유5 저장, 시간표09:00–09:30 및 작업09:00–09:25 분리 표시 확인. 실제 OAuth 버튼은 두 제공자 모두 준비 중/비활성이다.
- Edge plan-sync version5, 마이그레이션8개 및 public account_plans RLS/자기 SELECT/직접 쓰기 차단, 시험 계정0을 T11에서 확인했다. 상세 값은 RELEASE.md.
- GitHub 일부 job/deployment 메타데이터가 대기로 남는 경우 완료 원문 로그와 운영 UI를 함께 대조했다. 확인 실패를 성공으로 기록하지 않는다.

## 운영 확인의 범위와 잔여

실제 서버 두 저장소 동기화·충돌·로그아웃 복원과 임시 브라우저 탭 종료/새 탭 outbox 회복은 T09에 수행했고 원래 상태/시험 계정 정리를 확인했다. T11 문서 변경 후 실제 OAuth나 새 계정 시험을 반복한 것은 아니다.

다음은 미검증으로 남긴다:Google/GitHub 실제 로그인→콜백→앱 복귀, 두 물리 기기, 물리 모바일, 회선 전체 차단/브라우저 프로세스 종료, 자연 JWT 만료. 390px iframe/두 브라우저 저장소/API401 시험과 구분한다. OAuth 재개 전 준비 중 표시를 해제하지 않는다.

기존 Auth leaked password protection 경고와 검증용 Edge410 메타데이터 두 개는 RELEASE.md에 기록했다. 기존 실제 사용자 레코드는 조회/수정/삭제하지 않았다.

최종 절차:이 문서 PR 검사 → 병합 → 같은 SHA Pages 배포 → 경로/로고/새로고침/시간표 정상 확인 → 합성 업무 삭제·초기 상태 복원 → 원본 작업 폴더 반영. 최종 결과는 완료 보고의 불변 SHA/Actions 링크로 대조한다.
