# oddk iOS

React/TypeScript 화면과 모델을 Android와 공유하는 Capacitor 8.6 프로젝트다. iOS 네이티브 프로젝트는 Swift와 Swift Package Manager(SPM)를 사용한다. 지원 대상은 iOS 15 이상, 개발 도구는 Xcode 26 이상이다.

## Mac에서 바로 열기

전달용 파일은 `artifacts/ios/oddk-ios-project.tar.gz`다. 빌드한 웹 파일과 필요한 네이티브 플러그인 소스까지 포함하므로 Mac에서 Xcode로 열어 실행할 때 Node 설치를 먼저 할 필요는 없다. Swift Package Manager의 Capacitor SDK를 받을 인터넷 연결은 필요하다.

```sh
mkdir -p ~/Projects/oddk-ios
tar -xzf ~/Downloads/oddk-ios-project.tar.gz -C ~/Projects/oddk-ios
open ~/Projects/oddk-ios/ios/App/App.xcodeproj
```

Xcode에서 App 타깃 → Signing & Capabilities → Team에 본인 Apple 계정을 선택한다. 연결한 iPhone을 실행 대상으로 선택하고 Run한다. Apple이 기기 신뢰 또는 개발자 모드를 요구하면 iPhone에서 확인한다. 개인 기기의 개발 테스트와 App Store/TestFlight 배포는 별도 단계다. 프로젝트에 Apple 계정·서명 인증서·프로비저닝 파일을 포함하지 않았다.

## 소스 수정 후 빌드

Node 22 이상에서 공통 소스를 수정하고 다음을 실행한다.

```sh
npm ci
npm run ios:sync
npm run ios:open
```

- `npm run mobile:web`: Android/iOS 공통 정적 빌드인 `out-native/` 생성
- `npm run ios:sync`: 웹 빌드 후 iOS에 복사, SPM 플러그인 갱신, 프로젝트 검사
- `npm run ios:check`: plist·Xcode 프로젝트·로그인 스킴·privacy 리소스·아이콘·번들 검사
- `npm run ios:simulator`: Mac에서 서명 없이 iOS Simulator용 App.app 컴파일
- `npm run ios:archive`: Mac에서 연결된 Apple Team 설정으로 기기용 archive 생성
- `npm run ios:package`: 동기화된 iOS 프로젝트와 공유 소스를 Mac 전달용으로 묶기

`ios:simulator`의 App.app은 iPhone에 설치하는 IPA가 아니다. 기기용 빌드와 서명은 Xcode에서 별도로 진행한다. CLI archive에 팀을 지정하려면 `APPLE_TEAM_ID`를 사용하며 인증서는 Xcode/키체인에서 관리한다.

기존 `npm run android:debug`도 같은 `out-native/` 빌드를 사용한다. 일반 웹 빌드와 GitHub Pages의 `/oddk-todo` 경로는 유지한다. APK/IPA/Xcode 빌드 결과와 서명 관련 파일은 버전 관리에서 제외한다.

## iOS 연결

- 앱 ID 및 로그인 스킴: `com.oddk.todo`
- 로그인 복귀 주소: `com.oddk.todo://auth/callback` (기존 Supabase 허용 주소와 공유)
- 기본 웹 Origin: `capacitor://localhost`
- UIScene의 cold/warm URL 이벤트를 Capacitor SceneDelegateProxy로 전달한다.
- Preferences의 UserDefaults 사용 이유를 PrivacyInfo.xcprivacy의 CA92.1로 선언하고 앱 리소스에 포함한다.
- WKWebView의 자동 safe-area inset을 사용한다. Android 뒤로 가기 핸들러는 Android에서만 등록한다.
- 인증 세션은 앱 Preferences, 화면과 계획은 기존 로컬 저장·계정 동기화 로직을 사용한다. Safari/PWA의 로컬 데이터가 자동 복사되지는 않는다.
- AI 추가는 기존 정책대로 로그인과 HTTPS PC AI 서버가 필요하다. 네이티브 앱 Origin은 정확히 지정하며 임의 Origin을 허용하지 않는다.

## 확인 범위

Windows에서 iOS 생성/동기화, 웹 정적 빌드, 프로젝트 구조·privacy·아이콘 검사, 공통 단위 테스트를 실행할 수 있다. Swift 네이티브 컴파일·Simulator 실행·iPhone 설치 성공은 Mac/Xcode에서 별도로 확인해야 한다. 소스 검사만으로 네이티브 빌드 성공을 보고하지 않는다.

Supabase의 plan-sync/execution/travel-lookup는 배포된 파일을 보존한 채 Origin 허용 목록만 수정한다. Android의 `https://localhost`와 iOS의 `capacitor://localhost`를 추가하며 기존 웹 주소·인증·DB 처리는 유지한다. 변경 전 파일은 로컬 `.sync-test-runtime/ios-cors-before/`에 보관한다.

네이티브 푸시, 실제 소셜 로그인 성공과 계정 간 동기화, 장시간 백그라운드 동작, 파일 백업·복원, 터치 시간표 조작은 별도 인수 확인 대상이다. App Store 제출 전의 로그인·계정 삭제·개인정보 공개 항목 검토도 개발 빌드와 구분한다.

## 인수 확인 타임블록(ALPEN)

| 우선순위(E) | 작업(A) | 예상 작업(L) | 여유(P) | 완료 기준(N) |
|---|---|---:|---:|---|
| 1 | Mac 네이티브 빌드·Simulator 실행 | 20분 | 10분 | 컴파일 성공·실제 앱 화면 |
| 2 | 본인 iPhone 서명·설치 | 20분 | 10분 | Xcode Run으로 앱 실행 |
| 3 | 로그인·추가·수정·재실행·동기화 | 30분 | 15분 | 원본과 같은 항목·계정 상태 유지 |

예상치는 이후 확인을 위한 배분이며 실제 소요 시간이나 통과 결과가 아니다.

## 공식 안내

- https://capacitorjs.com/docs/ios
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/ios/spm
- https://capacitorjs.com/docs/ios/privacy-manifest
- https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device
