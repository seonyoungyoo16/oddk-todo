import type { Metadata } from "next";
import "./landing.css";
import { AppPreview } from "@/components/landing/app-preview";
import {
  StepIllustration,
  type StepVariant,
} from "@/components/landing/step-illustration";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button-link";
import { Icon } from "@/components/ui/icon";

const steps = [
  { variant: "collect", title: "생각나는 대로 모으고" },
  { variant: "choose", title: "오늘 할 만큼만 고르고" },
  { variant: "complete", title: "하나씩, 나답게 해내요" },
] satisfies { variant: StepVariant; title: string }[];

export const metadata: Metadata = {
  title: "oddk — 오늘 할 일, 가볍게 시작.",
  description:
    "복잡한 할 일은 한곳에, 오늘의 시간은 여유롭게. 내 속도에 맞는 하루를 시작하는 작은 계기, oddk.",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/oddk-icon.svg` },
};

export default function Home() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="main-nav" aria-label="메인 메뉴">
            <a href="#about">oddk 소개</a>
            <a href="#how-it-works">사용 방법</a>
            <a href="#preview">화면 미리보기</a>
          </nav>
          <ButtonLink href="/todo" size="small">
            시작하기 <Icon name="arrow-right" />
          </ButtonLink>
        </div>
      </header>
      <main id="main">
        <section className="hero container" aria-labelledby="hero-title">
          <h1 id="hero-title" aria-label="오늘 할 일, 가볍게 시작.">
            오늘 할 일,
            <br />
            <span className="hero-phrase" aria-hidden="true">
              {Array.from("가볍게 시작.").map((letter, index) => (
                <span
                  className="hero-letter"
                  key={index}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </h1>
          <div className="button-group hero-actions">
            <ButtonLink href="/todo">
              가볍게 시작하기 <Icon name="arrow-right" />
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary">
              조금 더 알아보기
            </ButtonLink>
          </div>
        </section>
        <section
          id="preview"
          className="preview-section container"
          aria-labelledby="preview-title"
        >
          <div className="preview-caption">
            <h2 id="preview-title" className="preview-label">
              화면 미리보기 · 예시
            </h2>
          </div>
          <AppPreview />
        </section>
        <section
          id="about"
          className="about-section section-space"
          aria-labelledby="about-title"
        >
          <div className="container">
            <div className="section-heading">
              <h2 id="about-title">
                할 일은 분명하게.
                <br />
                마음에는 여유롭게.
              </h2>
            </div>
            <div className="feature-grid">
              <article className="feature-card feature-tasks">
                <div className="feature-copy">
                  <h3>
                    머릿속 할 일을,
                    <br />
                    한곳에 꺼내두세요.
                  </h3>
                </div>
                <div className="task-illustration" aria-hidden="true">
                  <div>
                    <span className="illustration-check done">
                      <Icon name="check" />
                    </span>
                    <span className="illustration-done">생각 정리하기</span>
                    <span className="mini-tag">완료</span>
                  </div>
                  <div>
                    <span className="illustration-check" />
                    <span>가장 중요한 일 하나</span>
                    <span className="mini-tag blue">오늘</span>
                  </div>
                  <div>
                    <span className="illustration-check" />
                    <span>나를 위한 시간 갖기</span>
                    <Icon name="sun" />
                  </div>
                </div>
              </article>
              <article className="feature-card feature-time">
                <div className="feature-copy">
                  <h3>
                    빈틈없는 하루보다,
                    <br />
                    여유 있는 하루.
                  </h3>
                </div>
                <div className="time-illustration" aria-hidden="true">
                  <div className="capacity-bar">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="capacity-legend">
                    <span>
                      <i /> 계획한 시간 75%
                    </span>
                    <span>
                      <i /> 여유 시간 25%
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="how-section section-space container"
          aria-labelledby="how-title"
        >
          <div className="section-heading">
            <h2 id="how-title">모으고. 고르고. 시작하고.</h2>
          </div>
          <ol className="steps-grid">
            {steps.map((step) => (
              <li key={step.variant}>
                <StepIllustration variant={step.variant} />
                <h3>{step.title}</h3>
              </li>
            ))}
          </ol>
          <div className="planning-guide">
            <h3>한 번 적은 할 일, 계획에서 실행까지 이어져요.</h3>
            <ol>
              <li><strong>전체 할 일에 모으기</strong><p>예: ‘책 한 장 읽기’를 먼저 적어요. 날짜나 시간은 나중에 정해도 돼요.</p></li>
              <li><strong>오늘·이번 주에 배치하기</strong><p>날짜를 선택해 등록하거나, 모아 둔 할 일을 눌러 날짜를 정해요. 시작 시간과 작업·여유 시간을 입력하면 같은 할 일이 시간표에도 보여요.</p></li>
              <li><strong>목표와 연결하기</strong><p>만다라트는 큰 목표를 작은 실행으로 나누는 방법이에요. ‘독서 습관’ 목표에 ‘책 한 장 읽기’를 연결하면 목록의 완료가 목표에도 반영돼요.</p></li>
              <li><strong>하루 계획과 점검 펼치기</strong><p>ALPEN은 할 일 수집 → 시간 예상 → 여유 확보 → 우선순위 선택 → 점검의 흐름이에요. 오늘 화면에서 계획을 점검하고 시간 분석을 펼쳐 작업·여유 배분을 확인해요. 표시된 시간은 계획값이에요.</p></li>
            </ol>
            <ButtonLink href="/todo">첫 할 일 적어보기</ButtonLink>
          </div>
        </section>
        <section className="closing-section" aria-labelledby="closing-title">
          <div className="container">
            <h2 id="closing-title">
              오늘의 첫 번째 완료는,
              <br />
              시작하는 것.
            </h2>
            <ButtonLink href="#preview">
              나의 하루 미리보기 <Icon name="arrow-right" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Brand />
          </div>
          <a href="#main">
            맨 위로 <Icon name="arrow-up" />
          </a>
        </div>
      </footer>
    </div>
  );
}
