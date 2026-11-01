# oddk 앱 아이콘

확정 디자인은 파란 배경에 아이보리색 `OD / DK`, 왼쪽 위 O 안의 작은 체크다.

- 원본: `oddk-app-icon.png`. 생성된 시안의 글자 윤곽을 다시 그리지 않고 사용한다.
- `node scripts/generate-brand-icons.mjs`가 웹 PNG, SVG 래퍼, 다중 크기 ICO와 현재 존재하는 Android/iOS 프로젝트의 아이콘을 생성한다.
- 웹 가로 로고 `public/logo.png`는 이 작업의 대상이 아니다.
- iOS는 알파 없는 1024 PNG를 사용한다. Android adaptive/monochrome 및 PWA maskable 아이콘에는 별도 안전 여백을 둔다.
- 기존 앱의 설치 아이콘 변경에는 새 네이티브 빌드 설치가 필요하다. 웹 파일 업데이트만으로 이미 설치된 네이티브 아이콘은 바뀌지 않는다.
