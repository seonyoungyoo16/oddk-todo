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

Apple 로그인은 현재 화면·준비 버튼만 유지하고, 실제 연결·테스트는 유료 멤버십 가입 후 진행한다. 계정 삭제·개인정보처리방침과 추후 설정은 [iOS 계정 설정 안내](docs/IOS-ACCOUNT-SETUP.md)를 따른다.

- 앱 ID 및 로그인 스킴: `com.oddk.todo`
- 로그인 복귀 주소: `com.oddk.todo://auth/callback` (기존 Supabase 허용 주소와 공유)
- 기본 웹 Origin: `capacitor://localhost`
- UIScene의 cold/warm URL 이벤트를 Capacitor SceneDelegateProxy로 전달한다.
- Preferences의 UserDefaults 사용 이유를 PrivacyInfo.xcprivacy의 CA92.1로 선언하고 앱 리소스에 포함한다.
- WKWebView의 자동 safe-area inset을 사용한다. Android 뒤로 가기 핸들러는 Android에서만 등록한다.
- 인증 세션은 앱 Preferences, 화면과 계획은 기존 로컬 저장·계정 동기화 로직을 사용한다. Safari/PWA의 로컬 데이터가 자동 복사되지는 않는다.
- 일반 추가·Enter는 로그인·AI 없이 저장한다. 선택적인 AI 분석은 로그인과 HTTPS PC AI 서버가 필요하다. 네이티브 앱 Origin은 정확히 지정하며 임의 Origin을 허용하지 않는다.

## iPhone 일정 알림

`@capacitor/local-notifications`의 iOS 예약 알림을 사용한다. 서버·로그인 없이도 동작하며, 앱이 종료되거나 화면이 잠긴 뒤에는 iOS가 예약된 알림을 표시한다. APNs 원격 푸시는 이번 구현 범위가 아니다.

1. **설정 → 알림·백업 → 이 기기 알림 켜기**에서 iPhone 알림 권한을 허용한다. 첫 실행·할 일 저장만으로 권한창을 띄우지 않는다.
2. 할 일 수정창에서 날짜·시작/종료 시각을 정하고 **반복·알림 → 시작 알림**을 선택한다. 기존의 시작 시각/몇 분 전 옵션과 한국 시간 계산을 공유한다.
3. 이 기기에 저장된 계획을 구독한다. 시각·날짜·알림 간격·제목 수정은 이전 예약을 취소한 뒤 갱신하고, 완료·삭제·알림 해제는 예약과 이미 표시된 해당 알림을 제거한다. 실행 취소로 되살린 미래 일정은 재예약한다. 지난 알림은 다시 울리지 않는다.
4. 로그인 전 계획과 계정별 계획의 알림을 분리한다. 계정 전환·로그아웃·계정 삭제 시 이전 예약을 차단한다. 계정을 바꾼 뒤에는 알림을 다시 켠다. 기기 저장 실패나 예약 실패는 화면에 표시하며, 저장된 할 일은 삭제하지 않는다.

가까운 미래 알림부터 최대 64개를 예약한다. 다른 기능의 예약이 있으면 그만큼 자리를 남긴다. 초과 개수는 설정에 표시하고 앱 실행/복귀·알림 수신·실행 중 1분마다 보충한다. 앱을 장기간 열지 않으면 처음 예약한 범위를 넘는 일정은 보충되지 않는다. 다른 기기에서 한 수정·완료·삭제는 iPhone 앱이 해당 변경을 동기화한 뒤 반영된다. 앱이 종료된 동안 원격 변경까지 즉시 취소하려면 별도의 서버 푸시 경로가 필요하다.

이번 변경은 네이티브 플러그인을 추가하므로 **기존 iPhone 앱을 한 번 다시 빌드·설치**해야 한다. React 자동 업데이트만으로 플러그인이 설치되지는 않는다. 누락된 이전 앱에서는 재설치 안내를 표시하며 기존 네이티브 호환 해시로 새 번들을 잘못 배포하지 않는다.

Windows 준비: `npm run ios:sync` → `npm run ios:package`. Mac에서 패키지를 풀고 `ios/App/App.xcodeproj`를 열어 기존 Team과 연결된 iPhone으로 Run한다. 프로젝트 패키지에는 LocalNotifications의 Swift 패키지 소스를 포함한다.

### 실기기 인수 타임블록(ALPEN)

| 우선순위(E) | 작업(A) | 예상(L) | 여유(P) | 완료 기준(N) |
|---|---|---:|---:|---|
| 1 | Mac 빌드·재설치·명시적 권한 허용 | 20분 | 10분 | iPhone 설정에서 권한 확인, 알림 예약 개수 표시 |
| 2 | 3분 뒤 알림 예약 후 잠금·앱 종료 | 10분 | 5분 | 정한 한국 시각에 제목·소리·배너 확인 |
| 3 | 시간 이동·완료·삭제·실행 취소 | 20분 | 10분 | 옛 시각에 울리지 않고 새 시각에 한 번만 표시 |
| 4 | 재실행·기기 재부팅·권한 거부/복구·계정 전환 | 20분 | 10분 | 불필요한 재요청·이전 계정 알림·지나간 알림 재생 없음 |

시간은 검증을 위한 배분이며 통과 결과가 아니다. 집중 모드·무음·알림 요약 등 iOS 설정에 따라 실제 표시/소리는 달라질 수 있다. Windows 테스트만으로 iPhone 전달 성공을 판정하지 않는다.

공식 API: [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications), [Apple 로컬 알림 예약](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app).

## 확인 범위

Windows에서 iOS 생성/동기화, 웹 정적 빌드, 프로젝트 구조·privacy·아이콘 검사, 공통 단위 테스트를 실행할 수 있다. Swift 네이티브 컴파일·Simulator 실행·iPhone 설치 성공은 Mac/Xcode에서 별도로 확인해야 한다. 소스 검사만으로 네이티브 빌드 성공을 보고하지 않는다.

Supabase의 plan-sync/execution/travel-lookup는 배포된 파일을 보존한 채 Origin 허용 목록만 수정한다. Android의 `https://localhost`와 iOS의 `capacitor://localhost`를 추가하며 기존 웹 주소·인증·DB 처리는 유지한다. 변경 전 파일은 로컬 `.sync-test-runtime/ios-cors-before/`에 보관한다.

네이티브 예약 알림의 실제 전달, 실제 소셜 로그인 성공과 계정 간 동기화, 장시간 백그라운드 동작, 파일 백업·복원, 터치 시간표 조작은 별도 인수 확인 대상이다. App Store 제출 전의 로그인·계정 삭제·개인정보 공개 항목 검토도 개발 빌드와 구분한다.

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
