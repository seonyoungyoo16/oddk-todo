# oddk

Next.js + React로 만든 할 일 및 하루 계획 앱입니다.

- 할 일 추가·수정·완료·일괄 처리
- 작업 시간과 여유 시간을 분리한 일일 시간표
- 81칸 만다라트 목표와 할 일 연결
- ALPEN 계획과 하루 점검
- 계획 시간 통계

## 실행

```powershell
npm.cmd ci
npm.cmd run dev
```

## GitHub Pages 배포

master에 push하면 GitHub Actions가 정적 빌드 후 배포합니다.

```powershell
$env:GITHUB_PAGES='true'
npm.cmd run build
Remove-Item Env:GITHUB_PAGES
```

빌드 결과는 out/에 생성됩니다. 저장소 경로는 next.config.ts의 /oddk-todo입니다.

## 데이터

app/todo/initial-plan.json은 배포 초기 만다라트 데이터입니다. 새 브라우저의 첫 방문에 사용합니다.
로그인 전 변경은 브라우저 localStorage에 저장합니다. 기기 동기화에서 소셜 로그인하면 Supabase의 계정별 저장소와 동기화합니다.
첫 로그인에 현재 로컬 데이터를 가져오며, 기존 계정에는 서버 데이터를 불러옵니다. 로그인 전 목록은 별도로 보존합니다.
자동 저장과 5초 주기 확인, 오프라인 전송 대기, 버전 충돌 비교·선택, JSON 백업을 지원합니다.
시간통계는 실제 측정 시간이 아닌 입력한 계획 시간 기준입니다.

## 동기화 백엔드

- Supabase 프로젝트: oddk-todo-sync (서울 리전)
- 테이블/RLS: supabase/account-schema.sql
- Edge Function: supabase/functions/plan-sync/account.ts, validate.ts
- 요청마다 Supabase Auth 사용자 검증 후 해당 user_id로만 조회·수정합니다.
- push는 버전 조건이 일치할 때만 반영합니다. 동시 수정 시 409를 반환하여 기기에서 충돌 내용을 선택하게 합니다.
- publishable key만 브라우저에 포함하며, 서비스 키와 OAuth 비밀키는 서버 설정에만 보관합니다.
- OAuth 콜백: https://synxmskamifpovuziecx.supabase.co/auth/v1/callback

tests/account-sync.test.mjs 및 account-store.test.mjs는 격리한 테스트 계정 2개를 담은 .sync-auth-fixture.json이 필요합니다.
이 파일은 커밋하지 않으며 실제 사용자 계정으로 테스트하지 않습니다.
