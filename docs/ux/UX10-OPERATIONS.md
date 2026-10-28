# UX10 서버 반복 준비 운영

현재 배포된 기능은 반복 일정 발생 준비다. 푸시 예약/전달은 후속 작업이다.

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
