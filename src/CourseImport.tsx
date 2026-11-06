import { useRef, useState } from "react";
import type {
  CalendarPreferences,
  CoursePreview,
  CourseSelection,
  CoursePlan,
  CourseImportResult,
} from "../shared/contracts";
import { api } from "./api";
const days = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const clock = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const date = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
export function CourseImport({
  preferences,
  connected,
  onImported,
}: {
  preferences: CalendarPreferences;
  connected: boolean;
  onImported: (result: CourseImportResult) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CoursePreview | null>(null);
  const [choices, setChoices] = useState<
    Record<string, CourseSelection & { selected: boolean }>
  >({});
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [result, setResult] = useState<CourseImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "selected">("all");
  const [skipConflicts, setSkipConflicts] = useState(false);
  async function read(file: File) {
    setBusy(true);
    setError("");
    setPlan(null);
    setPreview(null);
    setResult(null);
    setSkipConflicts(false);
    setFilter("all");
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 512 * 1024)
        throw new Error("请选择不超过 512KB 的原始 .xlsx 打印课表。");
      const data = await api.coursePreview(file);
      setPreview(data);
      setChoices(
        Object.fromEntries(
          data.courses.map((c) => [
            c.id,
            {
              candidateId: c.id,
              firstPeriod: c.firstPeriod,
              lastPeriod: c.lastPeriod,
              periodConfirmed: !c.needsPeriodReview,
              selected: !c.needsPeriodReview,
            },
          ]),
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(
    id: string,
    patch: Partial<CourseSelection & { selected: boolean }>,
  ) {
    setChoices((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
    setPlan(null);
    setResult(null);
    setSkipConflicts(false);
    setError("");
  }
  function input() {
    return {
      previewId: preview!.previewId,
      preferencesVersion: preview!.preferencesVersion,
      selections: Object.values(choices)
        .filter((c) => c.selected)
        .map(({ selected, ...choice }) => choice),
    };
  }
  async function check() {
    setBusy(true);
    setError("");
    setResult(null);
    setSkipConflicts(false);
    try {
      setPlan(await api.coursePlan(input()));
    } catch (error) {
      setError((error as Error).message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const saved = await api.courseCommit({
        ...input(),
        digest: plan!.digest,
        skipConflicts,
      });
      setResult(saved);
      onImported(saved);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = Object.values(choices).filter((c) => c.selected).length;
  const setup = !!preferences.semesterStart && !!preferences.timeBlocks.length;
  const changed = preview && preferences.version !== preview.preferencesVersion;
  const shown =
    preview?.courses.filter(
      (c) =>
        filter === "all" ||
        (filter === "review" ? c.needsPeriodReview : choices[c.id]?.selected),
    ) || [];
  return (
    <section className="card course-import" id="course-import">
      <h2>导入东北大学课表</h2>
      <p className="small muted">
        教务系统「我的课表 → 打印 → Excel」导出后，选择原始 XLSX
        文件。先预览核对，再确认写入。
      </p>
      {!setup && (
        <p className="import-warning">
          请先在上方保存学期开始日期和课程时段，导入会按这些设置计算日期与钟点。
        </p>
      )}
      <input
        ref={upload}
        className="course-file-input"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="选择东北大学课表文件"
        disabled={busy || !connected || !setup}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="secondary full-width"
        disabled={busy || !connected || !setup}
        onClick={() => upload.current?.click()}
      >
        {busy ? "正在处理…" : "选择 Excel 课表"}
      </button>
      <p className="small muted">
        只支持已适配的打印格式，文件上限
        512KB；不需要学校账号密码。原文件不落盘、不发送给 AI。
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <div className="import-summary">
            <strong>{preview.termLabel}</strong>
            <span>
              {preview.courses.length} 条上课记录 · 已选 {selected} 条
            </span>
            <span>
              第 1 周依据：{preferences.semesterStart}{" "}
              所在周；课程按北京时间导入。
            </span>
          </div>
          {changed && (
            <p className="import-warning" role="alert">
              学期或时段已变化，请重新选择课表文件。
            </p>
          )}
          {preview.courses.some((c) => c.needsPeriodReview) && (
            <p className="import-warning">
              多门课共用一个合并单元格时，Excel
              没有逐门记录节次。下方只给出原单元格范围，请修改成真实节次，再勾选「已核对并选入」。这些课程默认不导入。
            </p>
          )}
          {preview.warnings.length > 0 && (
            <div className="import-warning">
              <strong>{preview.warnings.length} 条内容未能解析</strong>
              {preview.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
          {preview.unscheduled.length > 0 && (
            <details className="import-unscheduled">
              <summary>
                {preview.unscheduled.length} 门未排具体节次课程（不生成日程）
              </summary>
              {preview.unscheduled.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </details>
          )}
          <div className="import-filters" aria-label="课程筛选">
            {(
              [
                ["all", "全部"],
                ["review", "需核对"],
                ["selected", "已选"],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <fieldset
            className="import-editor"
            disabled={busy || !!result || !!changed}
          >
            <div
              className="import-courses"
              role="region"
              aria-label="待导入课程"
              tabIndex={0}
            >
              {shown.map((course) => {
                const choice = choices[course.id];
                return (
                  <article className="import-course" key={course.id}>
                    <strong>{course.title}</strong>
                    <p>
                      {days[course.weekday]} · {course.weekText}
                      {course.courseCode && ` · ${course.courseCode}`}
                    </p>
                    <p>{course.location || "地点未注明"}</p>
                    {course.teacher && <p>教师：{course.teacher}</p>}
                    {course.needsPeriodReview && (
                      <span className="review-tag">
                        需核对节次 · 原单元格 {course.sourceCell}
                      </span>
                    )}
                    <div className="generator-pair">
                      {(["firstPeriod", "lastPeriod"] as const).map(
                        (key, index) => (
                          <label key={key}>
                            {index ? "结束节次" : "开始节次"}
                            <select
                              aria-label={`${course.title} ${course.sourceCell} ${course.weekText} ${index ? "结束节次" : "开始节次"}`}
                              value={choice[key]}
                              onChange={(event) =>
                                change(course.id, {
                                  [key]: Number(event.target.value),
                                })
                              }
                            >
                              {Array.from(
                                {
                                  length: Math.max(
                                    preferences.timeBlocks.length,
                                    course.lastPeriod,
                                  ),
                                },
                                (_, i) => {
                                  const period = preferences.timeBlocks[i];
                                  return (
                                    <option
                                      key={i}
                                      value={i + 1}
                                    >{`第${i + 1}节 ${period ? `${period.startTime}—${period.endTime}` : "尚未设置"}`}</option>
                                  );
                                },
                              )}
                            </select>
                          </label>
                        ),
                      )}
                    </div>
                    <label className="import-check">
                      <input
                        type="checkbox"
                        checked={choice.selected}
                        onChange={(event) =>
                          change(course.id, {
                            selected: event.target.checked,
                            periodConfirmed: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {course.needsPeriodReview
                          ? "已核对节次并选入"
                          : "选入这条记录"}
                      </span>
                    </label>
                  </article>
                );
              })}
              {!shown.length && (
                <p className="small muted">这个筛选下没有课程。</p>
              )}
            </div>
            <button
              type="button"
              className="primary full-width"
              disabled={!selected}
              onClick={() => void check()}
            >
              检查所选 {selected} 条记录
            </button>
          </fieldset>
          {plan && (
            <div className="import-plan">
              <h3>确认本次导入</h3>
              <p className="small">
                可新增 {plan.counts.added} 次 · 重复 {plan.counts.duplicates} 次
                · 冲突 {plan.counts.conflicts} 次
              </p>
              <div
                className="import-occurrences"
                role="region"
                aria-label="具体日程预览"
                tabIndex={0}
              >
                {plan.items.map((item, index) => (
                  <div
                    key={index}
                    className={`import-occurrence ${item.status}`}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {date(item.startsAt)} {clock(item.startsAt)}—
                      {clock(item.endsAt)}
                    </span>
                    <span>{item.location}</span>
                    <span>{item.reason || "可以新增"}</span>
                  </div>
                ))}
              </div>
              {!!plan.counts.conflicts && (
                <label className="import-check">
                  <input
                    type="checkbox"
                    disabled={busy || !!result}
                    checked={skipConflicts}
                    onChange={(event) => setSkipConflicts(event.target.checked)}
                  />
                  <span>
                    仅导入无冲突的 {plan.counts.added} 次，跳过{" "}
                    {plan.counts.conflicts} 次冲突
                  </span>
                </label>
              )}
              <button
                type="button"
                className="primary full-width"
                disabled={
                  busy ||
                  !!result ||
                  !!changed ||
                  !plan.counts.added ||
                  !!(plan.counts.conflicts && !skipConflicts)
                }
                onClick={() => void commit()}
              >
                {busy ? "正在导入…" : `确认导入 ${plan.counts.added} 次安排`}
              </button>
              {!!plan.counts.conflicts && (
                <p className="small muted">
                  冲突双方均不自动取舍；可以返回上方调整选择。已有日程不会被覆盖。
                </p>
              )}
            </div>
          )}
          {result && (
            <p className="period-feedback" role="status">
              实际新增 {result.added} 次，重复跳过 {result.duplicates}{" "}
              次，冲突跳过 {result.conflicts}{" "}
              次。未选择及未排节次的课程没有导入。
            </p>
          )}
        </>
      )}
    </section>
  );
}
