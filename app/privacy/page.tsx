import type { Metadata } from "next";
import Link from "next/link";
import "./privacy.css";
export const metadata: Metadata = { title: "개인정보처리방침 · oddk", description: "oddk의 개인정보 처리 항목, 보관 기간과 계정 삭제 안내" };
export default function PrivacyPage() {
  return <main className="privacy-page">
    <nav className="info-pageNav" aria-label="안내 페이지"><Link href="/todo/">← oddk로 돌아가기</Link><Link href="/support/">지원·문의</Link></nav>
    <header><p>oddk</p><h1>개인정보처리방침</h1><p>시행일: 2026년 11월 1일</p></header>
    <p>유선영(이하 ‘운영자’)은 oddk의 할 일·목표·시간 계획 서비스를 제공하기 위해 다음과 같이 개인정보를 처리합니다. 로그인 없이 사용하는 내용은 해당 기기에 저장되며, 계정을 연결하면 계정의 계획과 기록을 서버와 동기화합니다.</p>
    <p>현재 Apple 로그인은 준비 중입니다. 활성화 전에는 Apple 로그인 정보를 수집하지 않습니다.</p>
    <section><h2>1. 처리 항목과 이용 목적</h2><div className="privacy-table" role="region" aria-label="개인정보 처리 항목 표" tabIndex={0}><table><thead><tr><th>구분</th><th>처리 항목</th><th>목적</th></tr></thead><tbody>
      <tr><td>선택적 소셜 로그인</td><td>Apple·Google·GitHub가 제공한 계정 식별자, 이메일, 표시 이름, 로그인 제공자, 가입·로그인 시각, 인증 토큰</td><td>회원 식별, 로그인 유지, 기기 간 동기화</td></tr>
      <tr><td>계획과 기록</td><td>직접 입력한 할 일·상세 메모·태그·중요도·상태, 목표·만다라트, 일정·예상 소요시간·실제 시간 기록, 하루 점검</td><td>계획 저장, 일정 표시, 기록 조회와 동기화</td></tr>
      <tr><td>기기 저장</td><td>계정별 계획 저장본·초안·충돌 백업, 로그인 세션, 화면 설정</td><td>오프라인 이용, 입력 복구, 로그인 유지</td></tr>
      <tr><td>선택적 알림</td><td>알림 수신 주소와 암호화 키, 설치 식별자, 연결 계정, 알림 설정·발송 상태</td><td>기기별 일정 알림 발송·해제</td></tr>
      <tr><td>기기 내 일정 알림</td><td>알림을 지원하는 앱 버전에서 일정 제목·예정 시각·예약 식별자·계정 구분값</td><td>기기 운영체제에 로컬 알림 예약·변경·취소. 원격 푸시 토큰을 서버로 보내지 않음</td></tr>
      <tr><td>선택적 장소 검색</td><td>입력한 장소 검색어, 출발·도착 좌표, 이동 수단</td><td>장소 검색과 이동시간 계산</td></tr>
      <tr><td>선택적 AI 제안</td><td>분석할 입력 문장과 요청 인증을 위한 로그인 토큰</td><td>서비스에 설정된 AI 게이트웨이에서 사용자 인증 후 할 일 분할·계획 제안 생성</td></tr>
      <tr><td>삭제 결과 확인</td><td>무작위 삭제 요청값의 해시, 처리 중 계정 식별자, 요청 시각</td><td>통신 중단 시 삭제 결과 확인과 중복 요청 방지</td></tr>
    </tbody></table></div><p>소셜 계정 비밀번호는 oddk가 받지 않습니다. Apple의 이메일 가리기를 사용하면 중계 이메일이 제공됩니다. 선택 기능은 사용자가 실행하거나 권한을 허용할 때 처리합니다. 이 앱은 광고나 광고 추적을 위해 개인정보를 판매하지 않습니다.</p></section>
    <section><h2>2. 처리 위탁과 외부 서비스</h2><ul>
      <li><strong>Supabase:</strong> 계정 인증, 데이터베이스, 서버 함수와 암호화된 Apple 인증 토큰 보관을 이용합니다. 이 앱의 프로젝트 데이터베이스 지역은 대한민국 서울(ap-northeast-2)입니다. 인증·보안·지원과 기반 서비스의 처리 범위는 <a href="https://supabase.com/privacy" rel="noreferrer" target="_blank">Supabase 개인정보처리방침</a>을 따릅니다.</li>
      <li><strong>GitHub Pages:</strong> 웹 버전의 정적 화면을 제공합니다. 접속 시 IP 주소 등 요청 정보는 호스팅 제공자의 정책에 따라 처리될 수 있습니다. <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noreferrer" target="_blank">GitHub 개인정보처리방침</a></li>
      <li><strong>Apple·Google·GitHub:</strong> 선택한 제공자가 로그인을 처리합니다. 계정 연결 과정에서 해당 제공자의 인증 화면과 정책이 적용됩니다. Apple 연결 해제에 필요한 토큰은 서버의 암호화 저장소에 보관합니다.</li>
      <li><strong>Photon(komoot)·FOSSGIS 라우팅:</strong> 장소 검색어 또는 경로 좌표가 외부 API(photon.komoot.io, routing.openstreetmap.de)에 전송됩니다. 검색 결과·경로 결과는 공용 캐시에 저장될 수 있으며, 검색어에 이름 등 개인정보를 넣지 않아도 이용할 수 있습니다.</li>
      <li><strong>AI 게이트웨이:</strong> AI 기능 사용 시 서비스에 설정된 HTTPS 게이트웨이로 분석할 입력 문장과 로그인 인증 토큰을 보냅니다. 게이트웨이는 인증을 확인하고 연결된 AI 모델에 분석을 요청합니다. 현재 앱 사용자가 게이트웨이 주소를 직접 지정하는 방식은 아닙니다. 앱이 모든 계획을 자동으로 AI에 전송하지는 않습니다.</li>
      <li><strong>알림 제공자:</strong> 웹 푸시를 허용하면 기기의 푸시 제공자에 알림 주소와 암호화된 메시지가 전달됩니다. 지원하는 iOS 앱 버전의 로컬 알림은 기기 운영체제에 예약하며 같은 방식의 원격 푸시 전송을 사용하지 않습니다.</li>
    </ul><p>해외 사업자가 운영하는 인증·호스팅·지도 API 등을 사용할 때 관련 요청이 국외에서 처리될 수 있습니다. 서울 데이터베이스 지역이 모든 서비스의 국내 처리만을 의미하지는 않습니다. 외부 기능 이용을 원하지 않으면 로그인·알림·장소 검색·AI 기능을 사용하지 않고 기기 내 계획 기능을 이용할 수 있습니다.</p></section>
    <section><h2>3. 보관 기간과 파기</h2><ul>
      <li>계정 정보와 동기화한 계획·시간 기록·알림 연결은 계정 유지 중 보관하며, 계정 삭제 시 운영 데이터베이스와 인증 계정에서 삭제합니다.</li>
      <li>Apple 계정 삭제는 Apple 인증 토큰 해제를 먼저 수행합니다. 해제 실패 시 삭제를 중단하고 재인증을 안내합니다. 암호화 저장 토큰도 계정 삭제와 함께 삭제합니다.</li>
      <li>Apple에서 이 앱의 로그인 동의를 철회하거나 Apple 계정을 삭제해 서버 알림이 전달되면 연결된 앱 계정과 해당 서버 데이터를 삭제합니다. 이미 다시 로그인한 계정에 과거 알림을 적용하지 않도록 알림 시각과 최근 인증 시각을 확인합니다.</li>
      <li>삭제 확인 기록에서 계정 식별자는 계정 삭제 시 제거됩니다. 무작위 요청 해시와 요청 시각은 결과 확인을 위해 남기고 요청일로부터 최대 8일 안에 삭제합니다.</li>
      <li>기기 내 데이터는 브라우저·앱 저장소를 비우거나 앱을 삭제할 때까지 남을 수 있습니다. 앱에서 계정을 삭제하면 현재 기기의 해당 계정 저장본·초안·앱 내부 백업을 삭제합니다. 로그인 전 목록, 다른 계정, 다른 기기의 오프라인 저장본과 직접 내려받은 파일은 각 기기·파일에서 별도로 정리해야 합니다.</li>
      <li>외부 제공자의 보안 로그·인프라 백업은 해당 제공자의 보관·파기 정책에 따라 처리됩니다. 앱의 계정 삭제가 모든 외부 로그·백업의 즉시 소거를 뜻하지는 않습니다.</li>
    </ul></section>
    <section><h2>4. 이용자의 권리와 계정 삭제</h2><p>계정 삭제를 지원하는 앱 버전에서는 ‘환경설정 → 계정·동기화 → 계정 삭제’에서 전체 계정 삭제를 요청할 수 있습니다. 확인 문구를 입력한 뒤 영구 삭제를 누르면 처리하며, 연결이 끊기면 같은 화면에서 결과를 다시 확인할 수 있습니다. 삭제 전 백업을 내려받을 수 있습니다.</p><p>계정 삭제 메뉴가 표시되지 않는 버전에서는 <Link href="/support/#account-deletion">지원 페이지의 계정 삭제 안내</Link>에 따라 문의 이메일로 요청할 수 있습니다.</p><p>개인정보 열람·정정·삭제·처리정지 또는 동의 철회는 아래 이메일로 요청할 수 있습니다. 다른 사람의 정보가 유출되지 않도록 필요한 범위에서 본인 확인 후 처리합니다. 알림 권한은 앱 설정과 기기 설정에서 철회할 수 있습니다.</p></section>
    <section><h2>5. 보호 조치와 자동 저장</h2><p>서버 통신에는 HTTPS를 사용하고, 계정 데이터 접근은 로그인 계정을 기준으로 제한합니다. 서비스 관리 키와 Apple 비밀 키를 앱에 포함하지 않습니다. Apple 갱신 토큰은 Supabase Vault로 암호화합니다. 웹 브라우저 저장소와 iOS Preferences에는 로그인 세션이 저장되므로 공용 기기에서는 로그아웃하고 저장 데이터를 정리해주세요. 서비스 로그인·입력 복구를 위한 저장소를 사용하며, 이 앱에 광고 추적 SDK를 포함하지 않습니다.</p></section>
    <section><h2>6. 문의와 변경 안내</h2><dl><dt>개인정보 보호 담당자·운영자</dt><dd>유선영</dd><dt>문의 이메일</dt><dd><a href="mailto:seonyoungyoo16@gmail.com">seonyoungyoo16@gmail.com</a></dd></dl><p>처리 항목·목적·외부 서비스 등이 변경되면 이 페이지의 시행일과 내용을 수정하고 앱에서 확인할 수 있도록 안내합니다.</p></section>
    <nav className="info-pageNav" aria-label="페이지 이동"><Link href="/todo/">oddk로 돌아가기</Link><Link href="/support/">지원·문의</Link></nav>
  </main>;
}
