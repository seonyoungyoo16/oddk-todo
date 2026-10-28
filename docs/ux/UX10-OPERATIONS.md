# UX10 서버 반복 준비 운영

현재 반복 발생 준비·기기 구독·알림 예약 대기열까지 배포했다. 실제 푸시 발송·브라우저 수신 연결은 후속 작업이다.

## 설치와 활성화 순서

1. 두 마이그레이션을 순서대로 적용한다. state.enabled는 false, project_url은 null로 시작한다. Cron은 생성되지만 비활성 상태에서는 네트워크 요청을 만들지 않는다.
2. task-maintenance Edge를 실제14개 의존 소스와 배포한다. verify_jwt=false지만 작업은 DB가 발급한 단회 티켓/만료/lease로 제한한다. 브라우저 세션이나 publishable key를 작업 인증으로 사용하지 않는다.
3. 관리자 읽기 점검으로 앱 소유 상태/RPC의 브라우저 권한과 API 스키마 노출을 확인한다. net은 Data API에 노출하지 않는다. 호스팅 pg_net의 PUBLIC ACL은 프로젝트 postgres로 제거되지 않는 플랫폼 제약이다.
4. 신뢰할 수 있는 관리자 연결에서 아래 설정을 적용한다. URL은 비밀이 아니며 대상 프로젝트로 고정한다. 이 예시는 현재 oddk 운영 프로젝트다.

```sql
update public.task_maintenance_state
set project_url='https://synxmskamifpovuziecx.supabase.co', enabled=true
where singleton;
```

5. Cron 실제 실행 뒤 last_request_id와 해당 응답의200/timeout/error, 마지막 처리 개수와 종료 시각을 확인한다. claim된 ticket 원문, pg_net body/headers, 계정 계획 원문을 감사 출력으로 남기지 않는다.

```sql
select enabled,last_request_id,last_started_at,last_finished_at,last_result,
       lease_until>clock_timestamp() as lease_active,
       ticket_hash is not null as ticket_pending
from public.task_maintenance_state;

select r.id,r.status_code,r.timed_out,r.error_msg,r.created
from net._http_response r
join public.task_maintenance_state s on s.last_request_id=r.id;
```

## 장애·중지·복구

```sql
update public.task_maintenance_state set enabled=false where singleton;
```

- 중지 후 새 claim과 plan 쓰기를 거부한다. 이미 생성한 업무나 규칙을 자동 삭제하지 않는다. 다른 기능이 확장을 재사용할 수 있으므로 pg_cron/pg_net을 일괄 제거하지 않는다.
- 원인이 해결되면 배포 소스와 테스트를 확인한 뒤 다시 활성화한다. 기존 발생의 안정 ID와 CAS가 중복 생성을 막으며 변화 없는 계획의 버전은 증가시키지 않는다.
- ticket_pending이2분 이상, lease_active가45초 이상 이어지는지 실제 시각으로 확인한다. 만료된 티켓/lease는 다음 dispatch가 교체한다. HTTP 전송 자체가 실패한 경우에도 장기 비밀 재발급이 필요하지 않다.
- failed/invalid는 업무를 지우지 않고 건너뛴 계정 수다. 해당 계정은 다음 순회에서 다시 시도한다. 오류 내용을 응답에 노출하지 않는다. 5개씩 순회하므로 계정 수가 늘면 한 바퀴 시간이 늘어난다. 목록을 날짜별로 무한 생성하지 않고 오늘31일만 준비한다.
- CAS conflict는 다른 기기의 최신 변경을 우선한 결과다. 같은 버전을 강제로 재전송하거나 커서를 수동으로 되돌려 덮어쓰지 않는다.
- 프런트 롤백은 V6 백업/구버전 쓰기426 정책과 함께 판단한다. 정상 사용자 데이터를 삭제하거나 schemaVersion만 낮추는 방식으로 복구하지 않는다.

현재 운영 검증은 UX10-ACCEPTANCE와 UX-PROGRESS에 기록한다. 실제 사용자 단말 알림을 이 경로로 보냈다고 주장하지 않는다.

## 기기 구독 API와 키 보존

- push-subscriptions의 config는 로그인 사용자에게 publicKey만 반환한다. 최초 호출은 서버에서 P-256 VAPID 키를 만들고 private scalar를 Vault의 oddk_web_push_vapid에 저장한다. 동시 초기화에도 같은 키를 유지한다. 기존 비밀을 삭제하거나 public key만 초기화해 재생성하면 이전 구독이 무효화될 수 있으므로 일반 복구 절차로 사용하지 않는다.
- settings/subscriptions와 push 관리 RPC는 service_role 전용이다. 클라이언트에는 서버 키를 배포하지 않는다. 비밀 검사는 Vault 행 개수/참조 유효성만 확인하고 decrypted_secret 값은 출력하지 않는다.
- devices는 로그인 계정의 기기 요약만, revoke는 그 계정 소유 기기와 최신 revision만 처리한다. 분실 기기의 알림을 끌 때 이 경로를 사용한다. 다른 계정의 설치 UUID로 요청하면 거부된다.
- 이번 배포는 구독·관리 API까지다. 실제 브라우저 구독/Service Worker/푸시 전달부를 연결하기 전에는 사용자에게 알림 활성화나 수신 성공을 안내하지 않는다. 합성 구독 경로를 테스트한 기록을 실제 전달 증거로 쓰지 않는다.

## 예약 대기열 운영 경계

예약/전달 테이블과 계획·기기 트리거는 배포되어 있으나 sender/수신 확인 HTTP/실제 알림 UI는 아직 없다. 기존 task-maintenance Cron은 반복 발생 준비만 하며 이 대기열을 발송하지 않는다.

- pending/sending/sent와 displayed_at을 구분한다. sent는 공급자 수락이고 displayed_at은 브라우저 확인이다. 실제 전달 경로 연결 전의 DB 모사 ACK를 단말 수신으로 보고하지 않는다.
- 정상 업무 수정은 트리거와 안정 키를 거쳐 예약을 갱신한다. 직접 대기열을 지우거나 상태/receipt_hash를 덮어써 알림을 재전송하지 않는다. 대기열 보존7일과 비활성 기기 이력30일은 사용자 계획 보존과 별개다.
- claim/receipt/current는 서버 전용이다. 향후 HTTP 어댑터는 전체 plan·구독 주소/키를 응답하지 않고, 토큰/기기 증명/최신 계획을 확인한 최소 필드만 반환해야 한다.
- 동시성 QA의 임시 Cron 이름은 oddk-qa-push-first/second다. 정상 운영 작업과 혼동하지 않는다. 두 테스트는 self-unschedule됐고 시험 fixture와 대기 항목은 모두 정리했다. sender를 켠 뒤에는 운영 대기열에서 해당 시험을 재실행하지 않는다.

## 전송 worker 활성화 이후

현재 push-worker v2와 push-receipt v1이 배포되어 `oddk-push-worker` Cron이 분마다 실행된다. 위의 미구현 표기는 각 이전 체크포인트 당시 상태다. 프런트 SW/UI·실제 단말 수신 인수는 여전히 남아 있다.

```sql
select enabled,last_request_id,last_finished_at,last_result from public.push_worker_state;
select r.id,r.status_code,r.timed_out,r.error_msg,r.content
from net._http_response r join public.push_worker_state s on s.last_request_id=r.id;
-- 전송 중지: 기존 계획·기기 키·구독 이력을 삭제하지 않는다.
-- update public.push_worker_state set enabled=false where singleton;
```

- net 요청에는 단회 짧은 티켓만 보낸다. Vault private key나 장기 서비스 토큰을 요청에 넣지 않는다. 대기열 본문과 Vault 복호화 값을 진단 로그로 출력하지 않는다.
- worker 내부 최신 계획·구독 대조 후 전송하더라도 수신 시 변경될 수 있다. receipt는 다시 소유권/기기/revision/현재 계획/기한을 검증한 최소 제목만 반환한다. ACK와 공급자 수락은 별개다.
- sent는 실제 화면 표시의 증거가 아니다. request87의 gone1은 가짜 FCM endpoint의 만료 정리이며 실물 기기 전달로 보고하지 않는다.
- 안전한 암호화 설정을 위해 ECE_KEYLOG=1 상태에서는 시작을 거부한다. hosted Edge가 Deno.env.set을 지원하지 않으므로 환경을 코드로 변경하지 않는다. 실패 시 제한된 오류 로그와 고정 버전 소스를 확인한다.
- 만료/재시도/중복 보호를 우회하려고 receipt_hash나 displayed_at을 초기화하지 않는다. 계정 fixture 검증은 전용 계정만 사용하고 종료 후 연결·세션·사용자를 정리한다.
