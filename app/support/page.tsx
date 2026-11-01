import type { Metadata } from "next";
import Link from "next/link";
import "../privacy/privacy.css";

export const metadata: Metadata = {
  title: "지원·문의 · oddk",
  description: "oddk 이용 문의, 데이터 보관과 계정 삭제 안내",
};
const email = "seonyoungyoo16@gmail.com";
const contact = `mailto:${email}?subject=${encodeURIComponent("oddk 이용 문의")}`;
const deletion = `mailto:${email}?subject=${encodeURIComponent("oddk 계정 삭제 요청")}`;

export default function SupportPage() {
  return <main className="privacy-page">
    <nav className="info-pageNav" aria-label="안내 페이지"><Link href="/todo/">← oddk로 돌아가기</Link><Link href="/privacy/">개인정보처리방침</Link></nav>
    <header><p>oddk</p><h1>지원·문의</h1><p>이용 중 불편한 점이나 데이터 관련 문의를 남겨주세요.</p></header>
    <section aria-labelledby="contact-title">
      <h2 id="contact-title">문의하기</h2>
      <div className="support-contact"><p>운영자 <strong>유선영</strong></p><p><a className="support-email" href={contact}>{email}</a></p><p>이용 문의·오류 제보·개인정보 관련 요청을 이메일로 받습니다.</p></div>
      <p>오류 문의에는 사용 중인 앱 또는 웹 버전, 기기와 운영체제, 문제가 발생한 순서를 함께 적어주세요. 화면을 첨부한다면 개인적인 할 일과 계정 정보는 가려주세요. 비밀번호·인증번호·비밀 키는 보내지 않아도 됩니다.</p>
    </section>
    <section aria-labelledby="help-title"><h2 id="help-title">자주 묻는 질문</h2>
      <details><summary>로그인 전후의 할 일 목록이 달라요.</summary><p>로그인하지 않고 작성한 내용은 해당 기기에 보관됩니다. 계정을 연결하면 해당 계정의 동기화 내용을 사용하므로 로그인 전 목록과 다를 수 있습니다. 다른 기기에서는 같은 로그인 방식과 계정으로 연결했는지 확인해주세요.</p></details>
      <details><summary>저장한 내용을 보관하고 싶어요.</summary><p>백업을 지원하는 버전에서는 설정 또는 동기화 메뉴에서 현재 내용을 파일로 내려받을 수 있습니다. 내려받은 파일에는 개인적인 할 일과 계획이 포함될 수 있으므로 안전한 곳에 보관해주세요.</p></details>
      <details><summary>로그인이나 서버 연결이 되지 않아요.</summary><p>인터넷 연결을 확인한 뒤 다시 시도해주세요. 계속 문제가 발생하면 사용한 로그인 방식, 기기와 오류 문구를 문의 이메일로 보내주세요. Apple 로그인은 현재 준비 중이며, 실제 연결 후 제공할 예정입니다.</p></details>
      <details><summary>일정 알림이 오지 않아요.</summary><p>알림 지원 범위는 앱·웹 버전과 운영체제에 따라 다릅니다. 사용 중인 버전의 알림 설정과 기기의 알림 권한을 확인해주세요. 문의할 때는 사용 중인 환경과 알림을 설정한 시각을 함께 알려주세요.</p></details>
    </section>
    <section id="account-deletion" aria-labelledby="deletion-title"><h2 id="deletion-title">계정 삭제와 개인정보 문의</h2>
      <p>계정 삭제를 지원하는 버전에서는 앱의 ‘환경설정 → 계정·동기화 → 계정 삭제’에서 요청할 수 있습니다. 해당 메뉴가 없다면 <a href={deletion}>계정 삭제 요청 이메일</a>을 보내주세요.</p>
      <p>사용한 로그인 방식과 계정을 확인할 수 있는 이메일을 알려주세요. 다른 사람의 계정이 삭제되지 않도록 필요한 범위에서 본인 확인 후 처리합니다. 비밀번호나 인증번호를 요청하지 않습니다.</p>
      <p>계정 삭제는 해당 계정의 서버 계획·기록을 삭제하는 요청입니다. 로그인 전 기기 목록, 다른 계정, 다른 기기에 남은 오프라인 저장본과 직접 내려받은 백업 파일은 별도로 정리해야 합니다.</p>
      <p>개인정보 열람·정정·삭제·처리정지에 대한 문의도 같은 이메일로 접수합니다. 처리 항목과 보관 방식은 <Link href="/privacy/">개인정보처리방침</Link>에서 확인할 수 있습니다.</p>
    </section>
    <nav className="info-pageNav" aria-label="페이지 이동"><Link href="/todo/">oddk로 돌아가기</Link><Link href="/privacy/">개인정보처리방침</Link></nav>
  </main>;
}
