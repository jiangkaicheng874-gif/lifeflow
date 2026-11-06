import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, serviceAddress } from "./api";
import type { CalendarEvent } from "../shared/contracts";

type Page = "today" | "assistant" | "settings";
function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    leaf: (
      <>
        <path d="M20 4C10 2 3 7 5 14c2 7 13 5 15-10Z" />
        <path d="M4 21 15 9" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="4" />
        <path d="M8 3v4m8-4v4M4 11h16m-11 4h2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    right: <path d="m9 5 7 7-7 7" />,
    left: <path d="m15 5-7 7 7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00`);
}
function localInput(iso: string) {
  const date = new Date(iso);
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function eventsForDay(events: CalendarEvent[], key: string) {
  const start = new Date(`${key}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return events.filter(
    (event) =>
      Date.parse(event.startsAt) < +end && Date.parse(event.endsAt) > +start,
  );
}
function eventColor(id: string) {
  return ["sage", "peach", "blue", "lavender"][
    Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4
  ];
}

function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("today");
  const calendarScroll = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(dateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<CalendarEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(
    localStorage.getItem("lifeflow-theme") || "system",
  );
  const weekAnchor = dateFromKey(selected);
  weekAnchor.setDate(weekAnchor.getDate() - ((weekAnchor.getDay() + 6) % 7));
  const weekAnchorKey = dateKey(weekAnchor);
  useEffect(() => {
    if (page === "today" && calendarScroll.current)
      calendarScroll.current.scrollTop = 8 * 64;
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lifeflow-theme", theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    const start = new Date(`${weekAnchorKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setLoading(true);
    setError("");
    setEvents([]);
    Promise.all([
      api.health(),
      api.events(start.toISOString(), end.toISOString()),
    ])
      .then(([, result]) => {
        if (active) {
          setEvents(result.events);
          setConnected(true);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setConnected(false);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [weekAnchorKey, revision]);
  const day = dateFromKey(selected);
  const week = Array.from({ length: 7 }, (_, offset) => {
    const value = new Date(day);
    value.setDate(value.getDate() - ((day.getDay() + 6) % 7) + offset);
    return value;
  });
  function moveDay(offset: number) {
    const next = new Date(day);
    next.setDate(next.getDate() + offset);
    setSelected(dateKey(next));
  }
  function openEditor(value: CalendarEvent | "new") {
    setFormError("");
    setEditor(value);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const data = new FormData(event.currentTarget);
      const draft = {
        title: String(data.get("title")).trim(),
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        endsAt: new Date(String(data.get("endsAt"))).toISOString(),
      };
      if (editor && editor !== "new")
        await api.update(editor.id, draft, editor.version);
      else await api.create(draft);
      setEditor(null);
      setNotice("日程已保存");
      setRevision((value) => value + 1);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "保存失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setFormError("");
    try {
      await api.remove(deleting.id, deleting.version);
      setDeleting(null);
      setNotice("日程已删除");
      setRevision((value) => value + 1);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const navigation: { id: Page; icon: string; label: string }[] = [
    { id: "today", icon: "sun", label: "今日安排" },
    { id: "assistant", icon: "spark", label: "AI 助理" },
    { id: "settings", icon: "settings", label: "设置" },
  ];
  return (
    <div className="app-shell">
      <div className="main-shell">
        {page !== "today" && (
          <header className="secondary-topbar">
            <span>{page === "assistant" ? "AI 助理" : "设置"}</span>
            <span className={`connection ${connected ? "online" : ""}`}>
              <i />
              {loading ? "正在连接" : connected ? "服务已连接" : "服务未连接"}
            </span>
          </header>
        )}
        <main className={page === "today" ? "calendar-main" : "content-main"}>
          {page === "today" && (
            <section className="calendar-screen" aria-label="今日安排周时间表">
              <header className="calendar-topbar">
                <label className="month-picker">
                  <strong>
                    {day.getFullYear()}年{day.getMonth() + 1}月
                  </strong>
                  <span>
                    {week[0].getMonth() + 1}.{week[0].getDate()} —{" "}
                    {week[6].getMonth() + 1}.{week[6].getDate()}
                  </span>
                  <input
                    aria-label="跳转日期"
                    type="date"
                    value={selected}
                    onChange={(event) => {
                      if (event.target.value) setSelected(event.target.value);
                    }}
                  />
                </label>
                <div className="calendar-actions">
                  <button
                    className="icon-button"
                    onClick={() => moveDay(-7)}
                    aria-label="上一周"
                  >
                    <Icon name="left" size={18} />
                  </button>
                  <button
                    className="today-button"
                    onClick={() => setSelected(dateKey(new Date()))}
                  >
                    今天
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => moveDay(7)}
                    aria-label="下一周"
                  >
                    <Icon name="right" size={18} />
                  </button>
                  <button
                    className="corner-add"
                    onClick={() => openEditor("new")}
                    aria-label="新建日程"
                  >
                    <Icon name="plus" size={22} />
                  </button>
                </div>
              </header>
              <div className="calendar-weekdays">
                <span className="timezone-label">
                  UTC{day.getTimezoneOffset() <= 0 ? "+" : ""}
                  {-day.getTimezoneOffset() / 60}
                </span>
                {week.map((value) => (
                  <button
                    key={dateKey(value)}
                    className={`calendar-date ${dateKey(value) === selected ? "selected" : ""} ${dateKey(value) === dateKey(new Date()) ? "is-today" : ""}`}
                    onClick={() => setSelected(dateKey(value))}
                    aria-label={`选择 ${value.toLocaleDateString("zh-CN")}`}
                    aria-pressed={dateKey(value) === selected}
                  >
                    <span>
                      {
                        ["日", "一", "二", "三", "四", "五", "六"][
                          value.getDay()
                        ]
                      }
                    </span>
                    <strong>{value.getDate()}</strong>
                  </button>
                ))}
              </div>
              {(loading || error) && (
                <div
                  className="calendar-status"
                  role={error ? "alert" : "status"}
                >
                  {loading ? (
                    "正在读取安排…"
                  ) : (
                    <>
                      <span>{error}</span>
                      <button onClick={() => setRevision((value) => value + 1)}>
                        重试
                      </button>
                    </>
                  )}
                </div>
              )}
              <div
                className="time-scroll"
                ref={calendarScroll}
                tabIndex={0}
                aria-label="按小时浏览一周安排"
              >
                <div className="time-grid">
                  <div className="time-axis">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <span key={hour} style={{ top: hour * 64 }}>
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                  {week.map((value) => {
                    const key = dateKey(value);
                    const start = new Date(`${key}T00:00:00`);
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);
                    return (
                      <section
                        key={key}
                        className={`time-day ${key === selected ? "selected-time-day" : ""}`}
                        aria-label={`${value.toLocaleDateString("zh-CN")}日程`}
                      >
                        {!loading &&
                          !error &&
                          eventsForDay(events, key).map((item) => {
                            const begin = new Date(item.startsAt);
                            const finish = new Date(item.endsAt);
                            const from =
                              begin < start
                                ? 0
                                : begin.getHours() * 60 + begin.getMinutes();
                            const to =
                              finish >= end
                                ? 1440
                                : finish.getHours() * 60 + finish.getMinutes();
                            return (
                              <button
                                key={item.id}
                                className={`schedule-block ${eventColor(item.id)}`}
                                style={{
                                  top: (from / 60) * 64,
                                  height: Math.max(16, ((to - from) / 60) * 64),
                                }}
                                aria-label={`${item.title}，${begin.toLocaleString("zh-CN")} 至 ${finish.toLocaleString("zh-CN")}，查看或编辑`}
                                onClick={() => {
                                  setSelected(key);
                                  openEditor(item);
                                }}
                              >
                                <span className="block-title">
                                  {item.title}
                                </span>
                                <span className="block-time">
                                  {begin < start
                                    ? "续"
                                    : formatTime(item.startsAt)}
                                </span>
                                {to - from >= 60 && (
                                  <span className="block-time">
                                    {finish >= end
                                      ? "次日"
                                      : formatTime(item.endsAt)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </section>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
          {page === "assistant" && (
            <section className="single-page">
              <p className="eyebrow">YOUR PERSONAL ASSISTANT</p>
              <h1>先理解，再帮忙。</h1>
              <p className="muted">
                AI 助理将帮助你查看安排、整理想法，生成由你掌握的日程建议。
              </p>
              <div className="card assistant-placeholder">
                <Icon name="spark" size={40} />
                <h2>AI 功能尚未接入</h2>
                <p>
                  当前版本已经可以手动管理日程。
                  <br />
                  这里没有模拟回复，也不会自动修改你的安排。
                </p>
                <button className="secondary" onClick={() => setPage("today")}>
                  回到今日安排
                </button>
              </div>
            </section>
          )}
          {page === "settings" && (
            <section className="single-page">
              <p className="eyebrow">MAKE IT YOURS</p>
              <h1>我的偏好</h1>
              <p className="muted">让 LifeFlow 适合你的使用习惯。</p>
              <div className="card settings-card">
                <h2>外观</h2>
                <label>
                  主题
                  <select
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <h2>服务连接</h2>
                <p className="small muted">服务地址：{serviceAddress}</p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const token = String(data.get("token") || "").trim();
                    if (token)
                      sessionStorage.setItem("lifeflow-access-token", token);
                    else sessionStorage.removeItem("lifeflow-access-token");
                    setRevision((value) => value + 1);
                    setNotice("访问设置已更新");
                  }}
                >
                  <label>
                    本地服务访问令牌
                    <input
                      name="token"
                      type="password"
                      autoComplete="off"
                      placeholder="仅局域网连接时需要"
                      defaultValue={
                        sessionStorage.getItem("lifeflow-access-token") || ""
                      }
                    />
                  </label>
                  <p className="small muted">
                    仅保留在当前会话。关闭应用后可能需要重新填写。
                  </p>
                  <button className="primary" type="submit">
                    保存并重新连接
                  </button>
                </form>
                <h2>关于这个版本</h2>
                <p className="small muted">
                  本地个人版 v0.1 ·
                  日程与设置起步。AI、饮食和云端账号尚未开放。个人日程保存在运行服务的电脑上。
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="移动导航">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? "active" : ""}
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {editor && (
        <Modal
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form onSubmit={save}>
            <div className="modal-header">
              <h2>{editor === "new" ? "安排一件小事" : "编辑日程"}</h2>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                onClick={() => setEditor(null)}
                aria-label="关闭"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="small muted">时间会按当前设备时区保存。</p>
            <label>
              日程名称
              <input
                name="title"
                autoFocus
                required
                maxLength={120}
                placeholder="例如：读半小时书"
                defaultValue={editor === "new" ? "" : editor.title}
              />
            </label>
            <label>
              开始时间
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={
                  editor === "new"
                    ? `${selected}T09:00`
                    : localInput(editor.startsAt)
                }
              />
            </label>
            <label>
              结束时间
              <input
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={
                  editor === "new"
                    ? `${selected}T10:00`
                    : localInput(editor.endsAt)
                }
              />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="primary full-width"
              disabled={busy}
              type="submit"
            >
              {busy ? "正在保存…" : "保存日程"}
            </button>
            {editor !== "new" && (
              <button
                type="button"
                className="delete-in-editor"
                disabled={busy}
                onClick={() => {
                  setEditor(null);
                  setDeleting(editor);
                  setFormError("");
                }}
              >
                删除这项日程
              </button>
            )}
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <h2>删除这项日程？</h2>
          <p>「{deleting.title}」将从安排中移除，此操作无法撤销。</p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              保留日程
            </button>
            <button className="danger" disabled={busy} onClick={remove}>
              {busy ? "正在删除…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
