# GitHub → iOS · Android React 자동 업데이트

`master`에 push하면 기존 GitHub Actions 검증과 웹 배포에 이어 네이티브용 React 번들을 만들고 RSA 서명한 ZIP과 배포 명세를 같은 GitHub Pages 배포에 포함한다. 설치된 앱은 실행/복귀 시 새 버전을 확인하고 내려받은 뒤 **다음 완전 종료 후 실행**에 적용한다. 편집 중 강제 새로고침은 하지 않는다. 웹 페이지와 모바일 번들은 서로 다른 basePath로 빌드한다.

## 최초 설정

이 기능 이전 APK/Xcode 앱에는 업데이트 플러그인이 없으므로 새 앱을 **한 번 다시 설치**해야 한다. 이후 호환되는 React/HTML/CSS/이미지 수정은 재설치 없이 전달한다. `master` 이외 브랜치와 실패한 검증은 배포하지 않는다. 실행 중인 앱을 백그라운드로만 보냈다면 아직 적용되지 않을 수 있다.

빌드 명령: Android `npm run android:debug`, iOS `npm run ios:sync` 후 Xcode Run. iOS 서명은 사용자의 Apple 계정으로 한다. 개인 무료 개발 서명 유효기간은 별개이므로 React 자동 업데이트가 서명을 갱신하지는 않는다.

## 검증과 복구

- 개인 서명 키는 저장소 밖에 보관하며 GitHub Actions secret `MOBILE_UPDATE_SIGNING_KEY`에 등록한다. 앱에는 `mobile-updates.config.json`의 공개 키만 넣는다.
- 배포 명세와 ZIP을 각각 RSA-SHA256으로 서명한다. 앱은 배포 대상·네이티브 호환 버전·다운로드 URL도 확인한다. 네트워크 오류나 검증 실패 시 현재 앱을 계속 쓴다.
- Todo 저장 내용과 화면이 정상적으로 복원된 뒤 준비 완료를 알린다. 새 번들이 30초 안에 준비되지 않으면 플러그인이 앱에 포함된 기본 번들로 복구하고 실패 번들을 차단한다. 데이터나 초안은 업데이트 코드가 삭제하지 않는다.
- Capacitor/플러그인 버전·네이티브 코드·권한/설정이 바뀌면 호환 해시가 달라진다. 기존 앱은 해당 번들을 받지 않는다. 새 네이티브 앱 빌드·설치가 필요하다.
- 저장 데이터 형식 변경은 이전 버전과 호환되게 해야 한다. 코드 복구는 데이터 마이그레이션을 되돌리지 않는다.
- 잘못된 React 변경은 GitHub에서 revert하고 `master`에 반영한다. 수정된 번들이 다음 배포에 자동 게시된다.

`npm run mobile:release`는 네이티브 웹 빌드(`out-native`), 전체 commit SHA(`GITHUB_SHA`), 서명 키가 모두 있어야 성공한다. 배포 위치는 `out/mobile-updates/stable.json`과 `out/mobile-updates/bundles/*.zip`이다. GitHub Pages는 공개 호스팅이므로 웹에 공개할 수 있는 클라이언트 코드만 포함한다.

## 스토어 배포 범위

자동 업데이트는 앱의 본래 목적 안의 웹 화면/오류 수정용이다. 네이티브 기능·권한 변경 및 심사된 기능을 크게 바꾸는 변경은 스토어용 새 버전을 배포한다. 스토어 심사 통과를 이 구성으로 보장하지 않는다.

## ALPEN 검증 타임블록

작업 목록: 서명 배포 → 호환/오류 차단 → Android와 iOS 다운로드·재실행. 예상: 구성 30분, 검증 20분. 여유: 네이티브 의존성 다운로드·서명 20분. 우선순위: 사용자 데이터 유지와 서명 확인, 실제 단말 반영. 사후 점검: Actions 배포 SHA와 두 앱의 실행 번들 일치 여부를 확인하고 실제 결과를 `artifacts/mobile`에 기록한다.

공식 문서: [자체 서버 번들](https://capawesome.io/docs/sdks/capacitor/live-update/), [Apple 심사 지침 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements).
