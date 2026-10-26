import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";

const tasks = [
  {
    title: "프로젝트 기획안 다듬기",
    category: "업무",
    time: "60분",
    done: true,
  },
  {
    title: "새로운 아이디어 정리하기",
    category: "개인",
    time: "60분",
    done: false,
  },
  {
    title: "책 읽고 생각 기록하기",
    category: "나를 위한 시간",
    time: "60분",
    done: false,
  },
];

// Static product illustration; no task mutations or connected workspace.
export function AppPreview() {
  return (
    <div className="preview-stage">
      <div className="app-window">
        <div className="window-toolbar" aria-hidden="true">
          <div className="window-dots">
            <i />
            <i />
            <i />
          </div>
          <Icon name="sun" />
        </div>
        <div className="app-window-body">
          <aside className="preview-sidebar" aria-label="예시 화면의 메뉴">
            <Brand linked={false} />
            <div className="sidebar-menu">
              <span className="active">
                <Icon name="sun" /> 오늘 <b>3</b>
              </span>
              <span>
                <Icon name="inbox" /> 할 일 모아보기
              </span>
              <span>
                <Icon name="calendar" /> 이번 주
              </span>
            </div>
            <div className="sidebar-bottom">
              <span className="profile-avatar">나</span>
              <div>
                <strong>나의 공간</strong>
              </div>
            </div>
          </aside>
          <div className="preview-content">
            <div className="preview-greeting">
              <div>
                <h3>좋은 하루를 시작해볼까요?</h3>
              </div>
              <span className="preview-date">
                <Icon name="calendar" /> 어느 화요일
              </span>
            </div>
            <div className="preview-columns">
              <section
                className="preview-task-section"
                aria-labelledby="example-tasks-title"
              >
                <div className="preview-section-title">
                  <h4 id="example-tasks-title">
                    오늘 할 일 <span>3</span>
                  </h4>
                  <span>1 / 3 완료</span>
                </div>
                <div className="preview-task-list">
                  {tasks.map((task) => (
                    <div
                      className={`preview-task${task.done ? " is-done" : ""}`}
                      key={task.title}
                    >
                      <span
                        className={`task-status${task.done ? " checked" : ""}`}
                        aria-label={task.done ? "완료" : "미완료"}
                      >
                        {task.done && <Icon name="check" />}
                      </span>
                      <div>
                        <strong>{task.title}</strong>
                        <span>
                          {task.category}
                          <i />
                          {task.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="preview-input" aria-hidden="true">
                  <Icon name="plus" />
                  <span>떠오르는 할 일을 적어보세요</span>
                  <kbd>↵</kbd>
                </div>
                <div className="progress-summary">
                  <div>
                    <strong>33%</strong>
                  </div>
                  <div className="progress-track">
                    <span />
                  </div>
                </div>
              </section>
              <section
                className="preview-schedule"
                aria-labelledby="example-schedule-title"
              >
                <div className="preview-section-title">
                  <h4 id="example-schedule-title">오늘의 리듬</h4>
                  <Icon name="clock" />
                </div>
                <div className="schedule-row">
                  <time>09:00</time>
                  <div className="schedule-block block-blue">
                    <strong>기획안 다듬기</strong>
                    <span>09:00 — 10:00</span>
                  </div>
                </div>
                <div className="schedule-row">
                  <time>10:00</time>
                  <div className="schedule-break">잠시 쉬어가기</div>
                </div>
                <div className="schedule-row">
                  <time>10:30</time>
                  <div className="schedule-block block-neutral">
                    <strong>아이디어 정리</strong>
                    <span>10:30 — 11:30</span>
                  </div>
                </div>
                <div className="schedule-row">
                  <time>14:00</time>
                  <div className="schedule-block block-neutral">
                    <strong>책 읽고 기록하기</strong>
                    <span>14:00 — 15:00</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
