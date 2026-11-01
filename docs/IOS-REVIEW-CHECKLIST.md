# iOS 심사 사전 점검

기준일: 2026-11-01(한국 시간). 대상: `C:/workspace/study/todo-t00-baseline` 현재 작업 트리와 공개 웹 URL. Apple 로그인 실제 연결·테스트는 사용자 결정에 따라 유료 멤버십 가입 후 진행한다.

공개 개인정보·지원 URL은 2026-11-01 WEB-URL-01에서 배포·접속 검증을 마쳤다. 지금 우선 보완할 항목은 **AI 전송 안내·운영 조건, 자동 웹 번들 업데이트 정책, 개인정보 공시 초안**이다. 실제 Apple 로그인 연동은 유료 멤버십 가입 후 진행한다.

## 가입 전에 준비할 항목

| 항목 | 현재 확인 | 다음 행동 | 우선순위 |
| --- | --- | --- | --- |
| 공개 개인정보처리방침 | `https://seonyoungyoo16.github.io/oddk-todo/privacy/` HTTP 200. 방침 제목·본문·유선영·문의 이메일·CSS·브라우저 확인 완료(PR #48, 8913cf97) | App Store Connect에 이 공개 URL 등록. 최종 제출 빌드의 실제 처리와 방침 대조 | URL 완료 |
| Support URL | `https://seonyoungyoo16.github.io/oddk-todo/support/` HTTP 200. 문의 이메일·FAQ·계정 삭제 안내·상호 링크·새로고침 확인 | 스토어 지원 URL로 사용. 문의 운영은 별도 유지 | URL 완료 |
| AI 방침 정확성 | 고정 HTTPS 게이트웨이에 입력 문장·로그인 인증 토큰을 보내는 현재 방식으로 공개·로컬 방침 수정 완료 | 실제 운영자·외부 모델·보관 조건까지 제출 전 대조. AI 전송 전 안내·동의는 별도 요구사항 | 문구 수정 완료·운영 확인 잔여 |
| AI 전송 안내·동의 | `task-split-action.tsx:42–45`에서 분석을 누르면 요청을 시작하며 받는 곳·보내는 정보에 대한 별도 확인이 없음 | 전송 전에 받는 곳·항목을 알리고 취소할 수 있게 설계. 제3자 AI를 사용하면 5.1.2(i)의 명시적 허락 요구 대조. 자체 운영 AI인지도 확인 | 높음 |
| AI 심사 접근성 | 고정 서버의 `/health`는 점검 시 HTTP 200. 이는 인증된 분석 성공·상시 가용성의 증거는 아님 | 심사 기간 서버 가용성과 계정 전용 기능 접근 경로 준비. 일반 할 일 추가는 AI 없이도 작동하게 유지 | 중간 |
| 원격 웹 번들 업데이트 | `native-runtime.tsx:14`가 업데이트 시작. `native-updates.ts:20,26`과 `native-update-policy.ts:35`에 서명된 번들 다운로드·다음 실행 적용 예약 경로 존재 | App Store 배포판에서 원격 코드가 기능을 추가·변경하지 않도록 2.5.2에 맞는 배포 정책 결정. 네이티브 `autoUpdateStrategy: none`만으로 이 JS 경로까지 꺼지는 것은 아님. 서명 검증은 심사 적합성 판정과 별개 | 높음 |
| App Privacy 답변 | 현재 클라우드 계정·계획 저장이 있으므로 무조건 ‘수집 데이터 없음’으로 답할 수 없음 | 아래 데이터 분류 초안과 실제 iOS 전송·보관 방식 대조 | 높음 |
| Privacy manifest·SDK | 앱 manifest에 `NSPrivacyTracking=false`, UserDefaults `CA92.1` 존재. 앱의 수집 데이터 유형 목록은 없음. 최종 SPM 의존성의 통합 Privacy Report는 미확인 | Xcode Archive의 Privacy Report로 앱·Capacitor·Alamofire 등 최종 의존성을 확인하고 데이터 공시와 대조. 현재 파일 존재만으로 모든 SDK 검증 완료로 판정하지 않음 | 중간 |
| 암호화 수출 질문 | Info.plist에 `ITSAppUsesNonExemptEncryption` 없음. TLS·WebCrypto·CryptoKit·CommonCrypto/Security 사용 경로 확인 | 최종 라이브러리까지 포함해 면제 여부 분류 후 답변 준비. OS 제공 암호화만 이용한다면 면제 검토 가능. 키 부재 자체가 즉시 오류라는 뜻은 아님 | 중간 |
| 심사 메모·로그인 접근 | 게스트로 기본 계획을 사용할 수 있지만 동기화·AI 등 로그인 기능은 별도 접근 필요 | 기본 이용 순서와 계정 기능 확인 경로를 심사 메모로 준비. 개인 Google/GitHub 비밀번호 공유를 전제로 하지 말 것. 데모 모드로 계정을 대체할 경우 Apple의 해당 조건 확인 | 중간 |
| 스토어 메타데이터 | 앱 표시명·아이콘 존재. 제출용 부제·설명·키워드·카테고리·심사 메모의 완성본은 확인되지 않음 | 현재 iOS에서 작동하는 기능만 설명하고 초안 작성 | 중간 |
| 스크린샷·iPad 범위 | Xcode `TARGETED_DEVICE_FAMILY="1,2"`로 iPhone·iPad 지원. 기존 브라우저 QA 이미지는 제출용 iOS 스크린샷이 아님 | 지원 범위를 확정하고 Apple의 현재 필수 규격으로 iPhone 및 iPad 13형 화면 준비 | 중간 |
| 연령 등급·AI 콘텐츠 | 개인 계획·할 일 분할 AI가 있으며 공개 커뮤니티나 범용 채팅 기능은 확인되지 않음 | 최신 연령 설문을 실제 AI 입력·출력 범위에 맞춰 작성. 임의로 4+ 확정하지 않음. AI 콘텐츠 관련 1.2 적용 범위도 검토 | 중간 |
| iOS 일정 알림 | 초기 점검 이후 NATIVE-01 작업으로 `native-reminders`·`DeviceReminderSettings`가 추가됨. Web Push의 `pushSupported()=false`를 로컬 알림 미구현으로 해석하면 안 됨 | 담당의 로컬 알림 결과를 QA가 인수하고 공통 iOS sync·권한 허용/거부·실제 예약/취소를 검증한 뒤 설명·스크린샷 확정 | 인수·기기 확인 |
| 접근성 | 웹의 레이블·키보드 포커스 경로 존재. 실제 VoiceOver·큰 글씨·터치 환경 검증은 미완료 | 실제 지원을 확인한 기능만 Accessibility Nutrition Labels에 표기. 이 레이블 입력 자체는 선택 사항 | 중간 |
| 최소 기능·오프라인 | 내장 웹 번들과 할 일·목표·시간 계획·기록 로직 존재 | 단순 링크 모음과 다른 실제 기능을 심사 메모에 설명하고 기기에서 오프라인·재실행·입력 보존 확인 | 중간 |
| 외부 서비스 표기 | 이동 계획 화면에 Photon/FOSSGIS 전송 안내와 OpenStreetMap 기여자·저작권 링크 존재 | 실제 화면과 API 운영 조건에 맞게 유지 | 유지 |
| 과금·공개 사용자 콘텐츠 | 현재 앱 소스에서 결제 SDK·공개 커뮤니티 기능은 확인되지 않음 | 현재 범위에 맞춰 설문 작성. 관련 기능을 추가하면 별도 규정 재점검 | 현재 범위 확인 |
| 배포 지역·운영자 정보 | 방침 운영자 유선영, 문의 seonyoungyoo16@gmail.com. 배포 국가·사업자 분류는 미확정 | 배포 지역 확정. EU 등을 선택하면 해당 지역의 사업자 정보 질문도 별도 준비 | 중간 |

## 준비된 기본 구성과 검증 한계

- `npm run ios:check` 통과: 프로젝트·콜백 스킴·Scene·privacy 리소스·SPM·아이콘·내장 웹 진입점.
- 앱 아이콘은 1024×1024 RGB PNG이며 알파 채널과 투명색 청크가 없다.
- iOS 최소 실행 대상은 15.0이다. Apple의 현재 업로드 기준은 Xcode 26 이상·iOS 26 SDK이며, 실행 대상 버전과 SDK 버전은 구분한다.
- Info.plist에 카메라·마이크·사진·자동 위치 수집·광고 추적 권한 문구를 불필요하게 넣지 않았다. 현재 소스에서 해당 기기 권한 사용 경로는 확인되지 않았다. 수동 장소 입력·좌표 전송은 별도 개인정보 공시 검토 대상이다.
- iOS ATS의 전역 HTTP 허용 예외는 보이지 않으며, 네이티브 AI 경로는 HTTPS다.
- 계정 삭제는 앞선 격리 Supabase의 실제 Auth 서버 테스트에서 실행 중 타이머·계획·실행 기록·웹 알림 연결·Vault 토큰 삭제와 다른 계정 보존을 확인했다. 이번 점검에서 운영 사용자 계정을 삭제하지 않았다. 이후 추가된 iPhone 로컬 예약 취소·계정 격리는 NATIVE-01의 별도 인수 범위다.
- Windows의 구조 검사·브라우저 화면은 Swift 컴파일·Simulator·iPhone·VoiceOver 검증을 대체하지 않는다.

## 개인정보 공시 초안

이 표는 제출용 확정 답변이 아니다. iOS 앱 기준으로 확인하며, 네이티브에서 비활성인 웹 푸시의 기기 식별자를 그대로 혼합하지 않는다.

| 데이터 | iOS 앱에서 확인할 처리 | 초안 방향 |
| --- | --- | --- |
| 이름·이메일 | 소셜 로그인 프로필, Supabase Auth | Contact Info, 앱 기능, 계정과 연결 |
| 사용자 식별자 | Auth 사용자 ID, 계정별 계획·기록 | User ID, 앱 기능, 계정과 연결 |
| 할 일·메모·목표·일정·점검·실행 기록 | 계정 동기화 및 선택적 AI 입력 | Other User Content, 앱 기능, 계정과 연결 |
| 장소·경로 좌표 | 장소 API 요청과 결과 캐시 | 실제 사용자 위치를 나타내는 정보인지, 외부 제공자가 보관하는지 확인 후 위치 항목 판단. GPS 권한이 없다는 이유만으로 ‘위치 수집 없음’ 확정하지 않음 |
| 기기 식별자·진단 정보 | 네이티브 SDK와 호스팅·업데이트 요청 | 최종 SDK·로그 보관 정책 확인 후 판단 |
| 광고 추적 | 소스에서 광고 SDK·IDFA 호출이 확인되지 않음 | 추적하지 않음 초안. 최종 의존성과 실제 동작으로 재확인 |

## 가입 전 진행 순서 ALPEN

아래 길이는 실제 소요시간이 아니라 다음 작업에 배분할 타임블록 예산이다.

| 우선순위 E | 작업 A | 길이 L | 여유 P | 확인 N |
| --- | --- | --- | --- | --- |
| 1 | 공개 개인정보·지원 페이지와 연락처 정리 | 30분 | 10분 | 공개 URL 200, 실제 본문·문의 방법 확인 |
| 2 | AI 전송 안내·방침·개인정보 분류 정합성 정리 | 45분 | 15분 | 실제 전송 항목·수신자·취소 경로와 문구 일치 |
| 3 | App Store 업데이트 정책·심사 메모·메타데이터 초안 | 45분 | 15분 | 제출 빌드의 기능·업데이트·설명 범위 일치 |
| 4 | Mac/Xcode 준비 후 기기 핵심 흐름 점검 | 45분 | 15분 | 실행·입력·키보드·회전·오프라인·복원·터치·접근성 증거 |

Mac의 Simulator와 개인 기기 개발 테스트는 유료 멤버십 전에도 준비할 수 있다. Apple 로그인 실제 연결·TestFlight·스토어 제출은 이번 범위에서 진행하지 않았다.

## 이번 UI 수정과 총괄 인수인계

- Apple 버튼은 연한 회색 비활성 표현. ‘서비스 준비중이에요’ 툴팁은 작은 보통 굵기·연한 배경·그림자 없음.
- 사이드바에서는 버튼 바로 오른쪽에 포털로 표시해 스크롤 영역에 잘리지 않게 했다. 팝업에서는 버튼 바로 아래에 표시할 공간을 확보하여 다음 버튼과 겹치지 않게 구성했다.
- 수정 경로: `app/todo/apple-login-button.tsx`, `account.css`, `sync-panel.tsx`, `account-deletion-dialog.tsx`.
- 확인: 브라우저 포커스·준비 버튼 실행 차단·Esc 닫기, 타입 검사, 수정 파일 ESLint, 스타일 구조 검사. 오른쪽 최종 위치 스크린샷을 확인했다.
- 공통 iOS 빌드 산출물은 다른 작업과 충돌하지 않도록 최종 색상·배치 수정 후 재생성하지 않았다. 총괄은 공통 작업 트리 안정화 후 `ios:sync`와 `ios:package`를 순서대로 한 번 수행해야 한다.
- 후속 사용자 요청 WEB-URL-01에서 공개 방침·지원 페이지와 AI 방침 문구를 수정해 PR #48로 배포했다. 공개 URL 200과 본문·연락처·상호 이동을 확인했다. AI 전송 전 안내·업데이트 정책·공시 보완은 별도 잔여다.
- 역할 전환 인수: 이 작업은 IOS-01 기존 승인 범위까지 마무리한다. 이후 이 채팅은 기획자&디자이너 역할로 명세·시안·인수 기준을 담당하고, 제품 코드 수정은 웹개발자·앱개발자에게 넘긴다. F2는 사용자 확정 3×3 총 9칸 방향을 유지한다. 공통 현황판은 수정하지 않았다.
- 공통 작업 트리 전체 테스트는 이 마지막 UI 검증에서 다시 실행하지 않았다. 총괄의 TEST-01 기록에는 목표 초안 테스트 실패가 남아 있어, 앞선 테스트 통과 수치를 현재 전체 통과로 재사용하면 안 된다.

## 공식 근거

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 1.5, 2.1, 2.3, 2.5.2, 4.2, 4.8, 5.1.
- [App Privacy 작성 기준](https://developer.apple.com/app-store/app-privacy-details/)
- [Privacy manifest 데이터 공시](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests)
- [현재 업로드 요구사항](https://developer.apple.com/news/upcoming-requirements/)
- [스크린샷 규격](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [암호화 공시 키](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
- [암호화 서류 분류](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)
- [연령 등급 설문](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)
- [접근성 레이블](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)
- [멤버십 전 개발·개인 기기 테스트](https://developer.apple.com/help/account/membership/programs-overview)
