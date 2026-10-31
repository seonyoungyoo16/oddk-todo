# PC Ollama 운영

배포 앱 → Tailscale Funnel HTTPS → PC의 인증용 API(127.0.0.1:11436) → Ollama(127.0.0.1:11434).

- 외부 주소: `https://desktop-m9bcsrv.tailba6cb5.ts.net/split`. 앱의 기존 Supabase 로그인이 필요하다. 익명 계정과 비로그인 요청은 거부한다.
- 인증용 API는 `/split`만 허용하며 Supabase Auth 서버에서 사용자 토큰을 검증한다. 브라우저에는 공개 키 외에 별도 비밀 키를 넣지 않는다. `/health`는 준비 상태만 반환한다.
- 모델과 시스템 프롬프트는 서버에서 고정한다. 입력은 최대 2000자, 응답은 최대 32개/제목 120자다. 원문·토큰을 로그로 저장하지 않는다.
- 동시에 1건, 사용자별 분당 10건, 전체 시간당 100건으로 제한한다. 실패하면 앱의 원문을 유지하고 재시도를 안내한다. 무인증 일반 추가나 줄바꿈 분리로 대체하지 않는다.
- 로컬 앱은 기존처럼 로컬 Ollama를 직접 사용한다. 외부 앱은 인증용 API를 사용한다.

## 자동 실행과 운영 조건

- Tailscale은 Windows 자동 서비스이고 Funnel 설정은 `--bg`로 보관한다. 기존 11435 내부 연결은 변경하지 않는다.
- 사용자 시작프로그램의 `oddk-ai.vbs`가 Windows 로그인 후 숨김 상태로 Node 감독 프로세스를 실행한다. 감독 프로세스는 Ollama·인증용 API를 확인하고 종료 시 다시 실행한다.
- 운영 소스는 `%LOCALAPPDATA%\oddk-ai\releases\<commit>`에 보관한다. 로그는 `%LOCALAPPDATA%\oddk-ai\gateway.log`에 남긴다.
- PC 전원과 인터넷, Windows 로그인, Tailscale 연결이 필요하다. 재부팅 후 로그인 전의 무인 서비스 실행은 설정하지 않는다. AC 절전은 점검 시 이미 꺼져 있었으며 변경하지 않았다. 배터리 절전·사용자가 직접 선택한 절전·종료는 서버를 중단할 수 있다.
- Node 로그는 사용자 입력을 포함하지 않는다. 장기 운영 시 로그 파일 크기를 확인한다.

## 상태 확인과 중지

`Invoke-RestMethod http://127.0.0.1:11436/health`와 `tailscale funnel status`로 상태를 확인한다.

외부 연결만 중단: `tailscale funnel --https=443 off`. 전체 `reset`은 다른 연결도 제거하므로 사용하지 않는다.

자동 실행을 해제하려면 시작프로그램의 `oddk-ai.vbs`만 제거하고 oddk 감독 프로세스·인증용 API를 종료한다. Ollama 또는 Tailscale의 다른 용도는 유지한다.

## 배포 검증

인증 실패·외부 Origin 차단·임의 Ollama 경로 차단·입력 제한·요청 제한·동시 실행 제한·실패 후 재실행·응답 검증은 자동 테스트로 확인한다. 실제 PC 모델의 합성 문장 분리와 외부 HTTPS의 비로그인 차단도 확인한다. 실제 계정 로그인 후 분리·확인·저장은 별도 브라우저 검증 결과를 따른다.
