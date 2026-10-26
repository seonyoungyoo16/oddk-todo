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
이후 변경은 브라우저 localStorage에 저장하며 기존 데이터를 초기 데이터로 덮어쓰지 않습니다.
계정·서버 동기화는 없고, 시간통계는 실제 측정 시간이 아닌 입력한 계획 시간 기준입니다.
