"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpRight,
  HiOutlineBell,
  HiOutlineCheck,
  HiOutlineCloud,
  HiOutlineComputerDesktop,
  HiOutlineGlobeAlt,
  HiOutlineMoon,
  HiOutlineShieldCheck,
  HiOutlineSun,
} from "react-icons/hi2";
import type { Plan } from "../../supabase/functions/_shared/plan";
import { ClassificationManager } from "./classification-controls";
import { openSettingsDialog } from "./settings-events";
import {
  exportPlanBackup,
  getServerSyncSnapshot,
  getSyncSnapshot,
  subscribeSync,
} from "./sync-store";
import type { SyncStatus } from "./sync-store";

const tabs = [
  { id: "general", label: "일반" },
  { id: "classification", label: "분류·태그" },
  { id: "account", label: "계정·동기화" },
  { id: "data", label: "알림·백업" },
] as const;
type SettingsTab = (typeof tabs)[number]["id"];

function SettingsCard({ title, description, children, className = "" }: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return <section className={`oddk-settingsCard ${className}`}>
    <header className="oddk-settingsCardHeading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
    {children}
  </section>;
}

export function SettingsPanel({ plan, onSave, theme, onThemeChange, fallback }: {
  plan: Plan;
  onSave: (next: Plan, message: string) => boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  fallback: string;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [feedback, setFeedback] = useState("");
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const raw = useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot);
  const sync: SyncStatus = JSON.parse(raw);
  const syncLabel = !sync.connected ? "이 기기에 저장 중" : {
    local: "이 기기에 저장 중",
    syncing: "동기화 중",
    synced: "동기화됨",
    waiting: "저장 대기",
    conflict: "충돌 확인 필요",
    error: "연결 확인 필요",
  }[sync.phase];

  function navigateTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabButtons.current[next]?.focus();
  }

  function downloadBackup(previous = false) {
    setFeedback("");
    try {
      exportPlanBackup(fallback, previous);
      setFeedback(previous ? "보관한 백업 파일을 준비했어요." : "현재 내용의 백업 파일을 준비했어요.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "백업 파일을 만들지 못했어요.");
    }
  }

  return <div className="oddk-settingsPanel">
    <div className="oddk-settingsTabs" role="tablist" aria-label="환경설정 항목">
      {tabs.map((item, index) => <button
        key={item.id}
        ref={element => { tabButtons.current[index] = element; }}
        type="button"
        role="tab"
        id={`settings-tab-${item.id}`}
        aria-controls={`settings-panel-${item.id}`}
        aria-selected={tab === item.id}
        tabIndex={tab === item.id ? 0 : -1}
        onClick={() => setTab(item.id)}
        onKeyDown={event => navigateTab(event, index)}
      >{item.label}</button>)}
    </div>

    <div role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general" hidden={tab !== "general"}>
      <SettingsCard title="화면 테마" description="편안하게 집중할 수 있는 화면을 선택하세요.">
        <fieldset className="oddk-themeChoices">
          <legend className="oddk-srOnly">화면 테마 선택</legend>
          {([
            { value: "light", title: "라이트", description: "밝고 선명한 화면", Icon: HiOutlineSun },
            { value: "dark", title: "다크", description: "눈이 편안한 어두운 화면", Icon: HiOutlineMoon },
          ] as const).map(({ value, title, description, Icon }) => <label key={value} className="oddk-themeChoice" data-selected={theme === value}>
            <input type="radio" name="settings-theme" value={value} checked={theme === value} onChange={() => onThemeChange(value)} aria-label={`${title} 테마`} />
            <span className={`oddk-themeSymbol oddk-themeSymbol-${value}`}><Icon aria-hidden="true" /></span>
            <span className="oddk-themeChoiceCopy"><strong>{title}</strong><small>{description}</small></span>
            <span className="oddk-themeSelected" aria-hidden="true">{theme === value && <HiOutlineCheck />}</span>
          </label>)}
        </fieldset>
        <p className="oddk-settingsFootnote"><HiOutlineComputerDesktop aria-hidden="true" />이 기기의 화면에 바로 적용돼요.</p>
      </SettingsCard>

      <SettingsCard title="언어와 시간" description="날짜와 일정에 사용하는 기준이에요.">
        <dl className="oddk-settingRows">
          <div><dt>표시 언어</dt><dd>한국어 <span lang="en">Korean</span></dd></div>
          <div><dt>시간대</dt><dd>서울 <span>Asia/Seoul · UTC+9</span></dd></div>
          <div><dt>한 주의 시작</dt><dd>월요일</dd></div>
        </dl>
        <p className="oddk-settingsFootnote"><HiOutlineGlobeAlt aria-hidden="true" />현재 앱은 한국어와 한국 시간을 기준으로 동작해요.</p>
      </SettingsCard>
    </div>

    <div role="tabpanel" id="settings-panel-classification" aria-labelledby="settings-tab-classification" hidden={tab !== "classification"}>
      <SettingsCard title="분류·태그" description="할 일을 묶고, 필요한 항목을 쉽게 찾아보세요." className="oddk-settingsClassification">
        <ClassificationManager plan={plan} onSave={onSave} initiallyOpen />
      </SettingsCard>
    </div>

    <div role="tabpanel" id="settings-panel-account" aria-labelledby="settings-tab-account" hidden={tab !== "account"}>
      <SettingsCard title="내 계정" description="같은 계정으로 로그인하면 다른 기기에서도 이어서 사용할 수 있어요.">
        <div className="oddk-settingActionRow">
          <div className="oddk-settingIdentity"><span className="oddk-settingIcon"><HiOutlineCloud aria-hidden="true" /></span><div><strong>{sync.connected ? sync.displayName || sync.name : "로그인하지 않았어요"}</strong><p>{sync.connected ? sync.name : "할 일과 계획은 현재 브라우저에 저장돼요."}</p></div></div>
          <button type="button" className="oddk-settingButton" onClick={() => openSettingsDialog(sync.connected ? "profile" : "sync")}>{sync.connected ? "내 정보" : "계정 연결"}<HiOutlineArrowUpRight aria-hidden="true" /></button>
        </div>
      </SettingsCard>

      <SettingsCard title="기기 동기화">
        <div className="oddk-settingActionRow"><div className="oddk-settingCopy"><strong>저장 상태</strong><p>{sync.message}</p></div><span className="oddk-settingStatus" data-attention={sync.phase === "conflict" || sync.phase === "error"}><i aria-hidden="true" />{syncLabel}</span></div>
        <div className="oddk-settingsCardBottom"><span>할 일 · 목표 · 하루 점검</span><button type="button" className="oddk-settingTextButton" onClick={() => openSettingsDialog("sync")}>동기화 관리<HiOutlineArrowUpRight aria-hidden="true" /></button></div>
      </SettingsCard>
    </div>

    <div role="tabpanel" id="settings-panel-data" aria-labelledby="settings-tab-data" hidden={tab !== "data"}>
      <SettingsCard title="일정 알림" description="일정을 놓치지 않도록, 사용하는 기기마다 알림을 연결하세요.">
        <div className="oddk-settingActionRow"><div className="oddk-settingIdentity"><span className="oddk-settingIcon"><HiOutlineBell aria-hidden="true" /></span><div><strong>이 기기의 알림</strong><p>{sync.connected ? "연결 상태와 알림을 받을 기기를 관리해요." : "계정을 연결한 뒤 기기 알림을 설정할 수 있어요."}</p></div></div><button type="button" className="oddk-settingButton" onClick={() => openSettingsDialog(sync.connected ? "profile" : "sync")}>{sync.connected ? "알림 설정" : "로그인하고 설정"}<HiOutlineArrowUpRight aria-hidden="true" /></button></div>
      </SettingsCard>

      <SettingsCard title="데이터 백업" description="할 일과 계획을 JSON 파일로 보관할 수 있어요.">
        <div className="oddk-settingActionRow"><div className="oddk-settingCopy"><strong>현재 내용</strong><p>할 일, 목표, 날짜별 계획과 하루 점검을 함께 보관해요.</p></div><button type="button" className="oddk-settingButton" onClick={() => downloadBackup()}><HiOutlineArrowDownTray aria-hidden="true" />백업 받기</button></div>
        <div className="oddk-settingActionRow oddk-settingDivided"><div className="oddk-settingCopy"><strong>최근 보관 백업</strong><p>로그인이나 데이터 변경 전에 보관한 내용을 받아요.</p></div><button type="button" className="oddk-settingTextButton" onClick={() => downloadBackup(true)}>보관 백업 받기<HiOutlineArrowDownTray aria-hidden="true" /></button></div>
        <p className={feedback ? "oddk-settingsFeedback" : "oddk-srOnly"} role="status" aria-live="polite">{feedback}</p>
      </SettingsCard>
      <p className="oddk-settingsPrivacy"><HiOutlineShieldCheck aria-hidden="true" />백업 파일은 이 기기에 내려받아요. 안전한 곳에 보관해주세요.</p>
    </div>
  </div>;
}
