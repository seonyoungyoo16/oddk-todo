# iOS 로그인·계정 삭제 설정

현재 단계는 **Apple 로그인 화면·버튼만 준비하고 실제 연동·테스트는 유료 멤버십 가입 후 진행**하는 것이다. 계정 삭제와 개인정보처리방침은 유지한다. 지금은 Team ID나 비밀 키를 준비할 필요가 없다.

`app/todo/sync-store.ts`의 `APPLE_LOGIN_ENABLED = false`로 실제 Apple 로그인과 토큰 전달을 막는다. 버튼에는 ‘연결 준비 중’을 표시하고 클릭하면 안내만 보여준다. 서버 설정과 무관하게 Apple OAuth·시스템 브라우저·인증 API 요청을 시작하지 않는다. 아래 Apple 설정 절차는 **가입 후 진행할 참고 문서**다. 최종 제출 때는 준비 버튼과 별도로 실제 로그인 동작을 확인해야 한다.

Supabase `account-lifecycle`과 계정 삭제용 테이블은 배포되어 있다. 서버의 Apple 관련 검증·토큰 해제 코드는 이후 연결을 위해 보관하지만, Apple 제공자와 비밀 키는 활성화하지 않았다.

## 1. Apple Developer에서 만들 항목

유료 개발자 계정 외에 아래 항목이 필요하다. 제안한 Services ID가 이미 사용 중이면 사용 가능한 ID로 바꾸고 이후 설정 전체에 같은 값을 사용한다.

| 항목 | 입력값 |
| --- | --- |
| App ID / Bundle ID | `com.oddk.todo` — Sign in with Apple 활성화 |
| Services ID | `com.oddk.todo.web` (제안값) — 위 App ID와 연결 |
| 웹 도메인 | `synxmskamifpovuziecx.supabase.co` |
| Return URL | `https://synxmskamifpovuziecx.supabase.co/auth/v1/callback` |
| Server-to-server notification URL | `https://synxmskamifpovuziecx.supabase.co/functions/v1/account-lifecycle/apple-notifications` |
| Key | Sign in with Apple 활성화한 `.p8` 키 |
| 별도 확인할 식별자 | Team ID, Key ID |

한국 개발자가 새 Services ID를 등록할 때 서버 알림 주소가 필요하다. 주소는 배포되어 있으며, 설정 전에는 503을 반환하고 Apple 서명이 검증된 알림만 처리한다. 동의 철회·Apple 계정 삭제 알림은 연결 계정을 삭제한다. 이메일 전달 변경은 메일 발송 기능이 없어 작업 없이 확인 응답한다. 과거 알림이 새로 연결한 계정에 적용되지 않도록 인증 시각을 비교한다.

## 2. 비밀 키를 로컬에서 준비

`.p8` 키를 채팅·Git·앱 번들에 넣지 않는다. PC의 개인 폴더에 보관한 후 PowerShell에서 실행한다. 아래의 Team ID·Key ID는 본인 값으로 바꾼다.

```powershell
node scripts/configure-apple-login.mjs --team YOURTEAMID --key YOURKEYID0 --service com.oddk.todo.web --private-key C:/private/AuthKey.p8
```

스크립트는 Git에서 제외한 `.sync-test-runtime/apple-login/` 아래에 `oauth-secret.txt`와 `secrets.env`를 만든다. 출력에 비밀 값은 표시하지 않는다. Windows에서는 해당 개인 폴더의 사용자 접근 권한도 유지한다.

## 3. Supabase 설정

이 절차는 멤버십 가입 후 진행한다. 제공자 설정을 마친 뒤 검증용 빌드에서 `APPLE_LOGIN_ENABLED`를 `true`로 변경하고 실제 인증·삭제를 검증한다. 검증을 마친 빌드만 공개 배포한다.

Authentication → Sign In / Providers → Apple에서:

1. Apple을 활성화한다.
2. Client IDs에 실제 Services ID를 입력한다. 현재 구현은 웹과 iOS 모두 시스템 브라우저 OAuth이므로 Services ID가 기준이다.
3. Secret Key에는 생성한 `oauth-secret.txt`의 JWT 내용을 직접 붙여 넣는다. `.p8` 원문을 붙여 넣는 칸이 아니다.
4. URL Configuration의 허용 Redirect URLs에 아래를 추가한다. 기존 Google·GitHub 주소는 유지한다.
   - `https://seonyoungyoo16.github.io/oddk-todo/todo/`
   - `com.oddk.todo://auth/callback`
   - 개발 확인 시 `http://127.0.0.1:3200/todo/`
5. 서버 전용 설정을 본인 Supabase CLI 로그인 상태에서 업로드한다.

```powershell
npx --yes supabase@2.122.0 secrets set --project-ref synxmskamifpovuziecx --env-file .sync-test-runtime/apple-login/secrets.env
```

서버의 설정 이름은 `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICE_ID`, `APPLE_PRIVATE_KEY`다. 로그인 토큰을 Apple에서 다시 검증한 뒤 Vault에 암호화 보관하며 계정 삭제 전에 해제한다. Apple OAuth용 JWT Secret은 최대 6개월 주기로 갱신해야 하므로 생성 결과의 만료일 전에 같은 스크립트로 새 Secret을 만들어 Auth 설정을 갱신한다. `.p8` 키를 교체하면 서버 설정도 바꾼다.

## 4. 개인정보처리방침

- 공개 운영자: **유선영**
- 공개 문의: **seonyoungyoo16@gmail.com**
- 앱 경로: `/privacy/` (GitHub Pages에서는 `/oddk-todo/privacy/`)
- 공개 개인정보처리방침 URL: `https://seonyoungyoo16.github.io/oddk-todo/privacy/`
- 공개 지원 URL: `https://seonyoungyoo16.github.io/oddk-todo/support/`

2026-11-01 WEB-URL-01에서 PR #48로 배포하고 두 URL의 HTTP 200·본문·운영자·문의 이메일·브라우저 이동을 확인했다. App Store Connect에는 위 공개 URL을 등록한다. Supabase 서울 DB, 소셜 인증, GitHub Pages, 알림, 장소 API와 선택적 AI 게이트웨이의 처리 항목을 적었다. 실제 운영 계약·설정에 따른 국외 처리 국가·수탁자 연락·보관 조건과 App Store 개인정보 답변을 제출 전에 대조한다.

## 5. 검증 타임블록 (ALPEN)

| 순서 | 작업(A)·길이(L) | 여유(P)·우선순위(E) | 확인(N) |
| --- | --- | --- | --- |
| 1 | Apple 식별자·키·Supabase 연결, 작업 완료까지 한 블록 | 잘못 입력한 주소 수정 여유 확보, 최우선 | capabilities가 `appleReady:true`, Auth Apple 활성화 |
| 2 | 별도 테스트 계정으로 웹 로그인→새로고침→계정 삭제 | 기존 사용자 데이터와 분리 | Apple 토큰 해제, Auth·계획·시간·알림 데이터 삭제 |
| 3 | Mac에서 iPhone 로그인·취소·앱 복귀·삭제 | 인증 취소·네트워크 재시도 포함 | 실제 기기 콜백과 로컬 초안 삭제 |
| 4 | 방침 공개와 App Store Connect 개인정보 입력 | 외부 서비스 실제 설정 재확인 | 공개 URL 본문·운영자·이메일·수집 항목 일치 |

각 블록은 앞 단계의 확인을 마친 뒤 진행한다. 실제 소요시간을 기록하고 다음 블록 시간을 조정한다.

로컬 확인:

```powershell
npm test
npm run typecheck
npm run lint
npx --yes deno@2.9.6 test --no-lock --node-modules-dir=none --allow-env tests/edge/account-apple.test.mjs
node scripts/verify-account-lifecycle.mjs
```

`tests/account-lifecycle-database.sql`은 합성 데이터만 만들고 롤백하며 FK 연쇄 삭제·Vault 파기·다른 계정 보존을 검사한다. 격리된 로컬 Supabase에서도 실제 Auth Admin HTTP 삭제를 확인했다. 실행 중인 타이머가 있어도 계정·계획·시간 기록·알림 연결·Vault 토큰이 삭제되고 다른 계정은 유지되며, 삭제한 계정의 기존 access token은 거부된다. 이 검증에는 Apple 로그인 계정을 사용하지 않았다.

서버 관리 키를 본인 PC의 `ODDK_SUPABASE_ADMIN_KEY` 환경변수에 안전하게 설정할 수 있으면 `node scripts/test-account-deletion.mjs`로 스크립트가 직접 만든 두 개의 일회용 계정만 사용해 끝까지 확인한다. 로컬 스택을 사용할 때는 `ODDK_SUPABASE_URL=http://127.0.0.1:55431`, `ODDK_SUPABASE_PUBLIC_KEY`와 해당 로컬 관리 키를 함께 설정한다. 임의의 외부 서버 주소는 허용하지 않는다. 관리 키를 채팅에 보내지 않는다.

## 공식 자료

- [Supabase Apple OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple)
- [Apple 계정 삭제 요구사항](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Apple 토큰 해제와 삭제 처리](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Apple 서버 알림](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts)
