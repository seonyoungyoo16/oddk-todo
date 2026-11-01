# oddk Android

기존 React/TypeScript 화면과 할 일 모델을 Capacitor 8로 실행하는 Android 버전이다. iOS도 같은 소스를 공유하며 상세 내용은 IOS.md에 둔다.

## 설치 파일

- 디버그 APK: `artifacts/android/oddk-debug.apk`
- 앱 이름: oddk / 패키지: `com.oddk.todo` / 버전: `0.1.0` (versionCode 1)
- Android 7.0(API 24) 이상, compile/target SDK 36
- 로컬 웹 파일이 APK에 포함된다. PC 개발 서버를 실행할 필요가 없다.
- 웹 사이트의 기존 데이터와 설치한 앱의 로컬 데이터는 별도 저장소다. 자동으로 복사되지 않는다.
- 디버그 서명은 테스트용이다. 스토어 제출용 AAB/릴리스 키는 아직 생성하지 않았다.

## 빌드

Node 22 이상, JDK 21, Android SDK(platform-tools, platforms;android-36, build-tools;35.0.0)가 필요하다. Android Studio의 SDK Manager 또는 공식 명령행 도구로 설치하고 SDK 라이선스를 확인한다.

```powershell
npm ci
npm run android:debug
```

빌드 스크립트는 `JAVA_HOME`이 없으면 현재 `java`의 설치 경로를 확인한다. SDK 환경 변수가 없으면 Windows의 `%LOCALAPPDATA%\Android\Sdk`를 사용한다. 다른 위치에 설치했다면 `ANDROID_HOME`을 지정한다.

```powershell
npm run android:web   # 앱용 정적 웹 파일만 생성
npm run android:sync  # 웹 빌드 후 Android에 복사하고 플러그인 동기화
npm run android:open  # 설치된 Android Studio로 네이티브 프로젝트 열기
```

`android:debug`는 정적 빌드 → cap sync → assembleDebug → APK 복사 순서로 실행한다. 각 단계가 실패하면 다음 단계로 진행하지 않는다. APK 경로와 SHA-256을 출력한다.

웹의 `npm run build`와 GitHub Pages의 `GITHUB_PAGES=true` 동작은 유지한다. 두 앱은 `CAPACITOR_BUILD=true`, basePath 없음, 공통 `out-native/` 디렉터리를 사용한다. Capacitor는 확장자 없는 URL에 루트 index.html을 제공하므로 앱용 루트 파일은 빌드된 `/todo/index.html`로 교체한다. 일반 웹 빌드의 소개 페이지는 그대로다.

## 연결한 앱 동작

- 시작 경로 `/todo/`, 앱 로컬 파일 실행, HTTPS 외부 통신
- Android 뒤로 가기: 열린 dialog의 취소 처리 → 웹 탐색 이력 → 앱 최소화
- OAuth는 시스템 브라우저에서 실행하고 앱 링크로 복귀한다. PKCE와 `sb_flow_id`를 전달하며 access token이 포함된 임의 링크는 수용하지 않는다.
- 앱 인증 세션과 PKCE 저장소는 Capacitor Preferences를 사용한다. OS 백업은 비활성화했다. 플러그인 로그에 세션이 출력되지 않도록 Capacitor 로그도 껐다.
- Android의 `https://localhost`는 PC의 Ollama 주소로 취급하지 않는다. 로그인한 사용자는 기존 HTTPS AI 게이트웨이를 사용한다.
- AI 추가는 기존 정책대로 로그인과 PC AI 연결이 필요하다. 실패 시 입력 원문을 유지한다.

## OAuth 외부 설정

Supabase 프로젝트의 Authentication → URL Configuration → Redirect URLs에 다음 주소를 등록하고 대시보드에서 저장 결과를 확인했다. Site URL과 기존 웹 리디렉션 주소는 유지했다. 새 Supabase 프로젝트로 옮길 때도 이 주소를 등록해야 한다.

```text
com.oddk.todo://auth/callback
```

코드/manifest 연결과 자동 테스트는 완료했지만, Google/GitHub에서 실제 계정으로 인증하는 최종 확인은 별도다. URL이 허용되어 있지 않으면 Supabase가 웹의 기본 주소로 돌려보낼 수 있다.

AI 게이트웨이에는 기존 웹 Origin에 더해 `https://localhost`만 추가했다. 사용자 JWT 검증, 입력 제한, 요청 제한은 유지한다. 이 PC의 실행본에는 동일 변경만 반영하고 원본을 `ollama-gateway.mjs.before-android`로 보존했다. 이후 배포에서도 갱신된 `scripts/ollama-gateway.mjs`를 사용해야 한다.

## 현재 범위와 남은 확인

이번 검증: 앱용 정적 빌드/Android assembleDebug, APK v2 서명 검증, Android 16 에뮬레이터 설치·콜드 실행, 실제 앱 화면과 재실행 후 입력 초안 유지, 로그인 취소 딥링크의 오류 안내, Supabase 복귀 URL 저장, 외부 HTTPS 게이트웨이의 앱 Origin 204/외부 Origin 403/비로그인 401, ESLint·스타일 검사, 단위 테스트 350개, 기존 GitHub Pages 빌드를 확인했다.

에뮬레이터에서 로그인한 계정의 할 일 추가·수정·동기화 전체 흐름과 뒤로 가기 전체 시나리오는 아직 완료하지 않았다. 입력 초안 보존을 할 일 저장 완료로 표현하지 않는다. 검증 파일은 `artifacts/android/verification.json`, 실행 화면은 `android-running.png`, 복귀 주소 설정 화면은 `auth-redirect.png`에 둔다.

Android용 네이티브 일정 푸시는 아직 연결하지 않았다. 브라우저 Web Push를 앱에서 지원하는 것으로 표시하지 않으며, 앱 설정 화면에 미연결 상태를 안내한다. FCM/기기 토큰/계정별 수신 차단은 별도 구현이 필요하다.

실제 휴대폰의 Google/GitHub 로그인 복귀, 장시간 백그라운드/프로세스 종료, 파일 백업·복원과 터치 드래그는 추가 인수 확인 대상이다. 에뮬레이터 설치 성공과 단위 테스트를 이 항목들의 통과로 간주하지 않는다.

## 후속 검증 타임블록(ALPEN)

| 우선순위 | 작업(A) | 예상 작업(L) | 여유(P) | 완료 기준(N) |
|---|---|---:|---:|---|
| 1(E) | 실제 휴대폰 설치·추가·수정·종료 후 재실행 | 20분 | 10분 | 저장한 항목이 동일하게 유지됨 |
| 2(E) | 허용 URL 확인과 두 소셜 로그인 | 20분 | 10분 | 브라우저 → 앱 복귀 → 계정 동기화 |
| 3 | 파일 백업·복원과 터치 시간표 조작 | 20분 | 10분 | 파일 왕복 및 기존 항목 ID 보존 |

예상치는 후속 검증을 위한 시간 배분이며 이번 구현에 실제로 걸린 시간이 아니다. 네이티브 푸시는 위 검증과 별도 개발 범위로 둔다.

## 공식 문서

- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/config
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- https://developer.android.com/studio
