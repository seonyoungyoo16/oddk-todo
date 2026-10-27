# 릴리스·운영 절차

## 범위와 순서

2026-10-27 T00–T10 검증을 기반으로 T11 문서를 정리했다. 사용자 요청으로 실제 OAuth는 보류했고 신규 Google/GitHub 로그인은 준비 중이다. 비밀번호 시험을 OAuth 성공으로 대체하지 않는다.

ALPEN 작업 순서: 기준선 → 시간·날짜 계약 → 서버 검증 → 날짜별 계획/재계획 → 동기화 → 브라우저 인수 → 배포 확인. 각 작업 배포 확인 뒤 다음 작업을 시작했다. T11 집중 블록 예상45분+예비15분, CI 대기는 별도이며 실제 집중 시간은 정밀 계측하지 않았다.

배포 순서는 호환 백엔드 → 검사 통과 프런트 → 운영 인수다. Pages 성공으로 DB/Edge 적용을 대신 판단하지 않는다.

## 실행·정적 빌드

~~~powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
$env:GITHUB_PAGES='true'
try { npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'build failed' } }
finally { Remove-Item Env:GITHUB_PAGES -ErrorAction SilentlyContinue }
~~~

npm start는 일반 Next 서버용이다. 정적 Pages는 out/을 배포한다. .github/workflows/pages.yml이 배포 권위다. Edge 진입점은 supabase/functions/plan-sync/account.ts, 공통 계약은 supabase/functions/_shared/plan.ts다.

## 데이터·동기화 계약

- schemaVersion:2는 데이터 형식, 서버 version은 전체 JSON의 동시 수정 비교 값이다.
- V1→V2는 원문 백업 후 이전한다. 날짜 없는 기존 업무·점검을 임의로 오늘에 배정하지 않는다.
- 날짜 YYYY-MM-DD 또는 null, 시간 HH:mm 또는 null. 목록은 전체 업무, ALPEN/시간표/통계는 같은 선택 날짜를 사용한다.
- 검증 후 CAS 조건부 쓰기.409는 전체 계획 비교·선택 및 반대쪽 계정별 백업이며 자동 병합하지 않는다.
- 오프라인 변경은 계정별 dirty 캐시에 보존한다. 전송 중 편집은 다음 push로 남긴다.401은 미전송 보존,426은 쓰기 중단·갱신 안내다.
- 손상/미래 형식을 빈 목록으로 덮지 않는다. 원문·마지막 유효 백업으로 복구한다. 저장소 삭제 전 JSON 백업을 내보낸다.
- 미전송 변경 시 로그아웃은 차단된다. 연결/인증 복구 후 전송 완료를 확인한다. 백업 다운로드가 dirty를 해제하지는 않는다.

## 실제 서버 구성

프로젝트 synxmskamifpovuziecx(서울), plan-sync **version5**를 T11에서 재확인했다. bundle SHA256: e896ce51ed51748b9d382d2cca417beba8085448c23ec3a62f807b10dcd3cd3c. verify_jwt=false이며 함수 본문이 Auth 사용자를 검증한다. 서비스 키는 서버에만 있다.

public 테이블 account_plans 하나, RLS=true, authenticated 자기 user_id SELECT만 허용. anon/authenticated 직접 INSERT/UPDATE/DELETE 권한은 없다. 쓰기는 Edge 인증·검증·version 조건으로 수행한다.

마이그레이션:20261026201933 / 20261026202958 / 20261026203712 / 20261026225842 / **20261026230447 restrict_account_plan_writes** / 20261026230606 / 20261026231343 / 20261026231903. 검증 테이블은 제거됐다. 검증용 Edge 두 개는 데이터 접근 없는410 응답으로 닫혀 있으며 메타데이터만 남았다.

기존 보안 경고: leaked password protection 비활성. 이번에 설정은 바꾸지 않았다. [Supabase 보완 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## 전용 통합시험 fixture

일반 npm test는 네트워크를 대체한다. 실제 서버 시험은 전용 계정만 사용한다.

1. node tests/prepare-account-fixture.mjs로 gitignored .sync-auth-fixture.json 및 .sync-test-runtime/seed-accounts.sql, cleanup-accounts.sql을 생성한다. 기존 fixture는 해당 실행 정리 후 생성한다.
2. 신뢰하는 관리자 DB 연결로 seed SQL을 적용한다. 비밀번호·토큰·SQL 원문은 출력/문서/커밋에 남기지 않는다.
3. npm.cmd run test:integration을 실행한다. 실제 사용자 계정이나 업무를 시험하지 않는다.
4. 성공/실패와 관계없이 해당 marker cleanup SQL을 적용하고 잔여 계정0을 확인한다. fixture·생성 SQL·임시 QA 페이지를 제거한다.

OAuth 재개 시 제공자별 시작→콜백→복귀→계정 데이터→두 저장소 상호 반영을 검증한 후 OAUTH_READY를 활성화한다. 기존 제공자 설정을 임의 교체하지 않는다.

## 롤백·추적

V2 읽기/검증을 지원하는 직전 호환 릴리스(T09/T10)로만 되돌린다. V1 화면 복귀, V2→V1 역변환, 직접 쓰기 권한 복원을 하지 않는다. 불확실하면 sync push를 중지해 plan/version을 보존한다.

원문 백업→호환 커밋 CI→Pages 배포→조회·저장·다른 프로필 대조 순서로 복구한다. Edge version5의 형식 퇴행426 거부를 유지한다.

T11 PR merge_commit_sha → master Actions head_sha → github-pages deployment sha를 대조한다. 자기 커밋 SHA를 문서에 하드코딩하는 순환을 피하고 최종 불변 결과는 완료 보고에 남긴다.
