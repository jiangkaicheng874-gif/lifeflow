import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CalendarPreferences, TimeBlock } from "../shared/contracts";
import { api } from "./api";
import { DatePicker } from "./DatePicker";
import {
  automaticEnd,
  generateTimeBlocks,
  nextTimeBlock,
  type GeneratedTimeBlock,
  type GenerationOptions,
} from "./time-block-generator";

export function TimeBlockSettings({
  value,
  onSaved,
  connected,
}: {
  value: CalendarPreferences;
  onSaved: (value: CalendarPreferences) => void;
  connected: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<TimeBlock[]>(value.timeBlocks);
  const [generated, setGenerated] = useState<GeneratedTimeBlock[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setRows(value.timeBlocks);
  }, [value.version]);
  const first = value.timeBlocks[0];
  function values() {
    return new FormData(form.current!);
  }
  function options(): GenerationOptions {
    const data = values();
    const number = (name: string) => {
      const text = String(data.get(name) ?? "").trim();
      return text ? Number(text) : Number.NaN;
    };
    return {
      firstStart: String(data.get("firstStart") || ""),
      lessonMinutes: number("lessonMinutes"),
      breakMinutes: number("breakMinutes"),
      morningCount: number("morningCount"),
      afternoonCount: number("afternoonCount"),
      eveningCount: number("eveningCount"),
      middayBreakMinutes: number("middayBreakMinutes"),
      eveningBreakMinutes: number("eveningBreakMinutes"),
    };
  }
  // Read native form values at action time as well as handling input events.
  // Safari date/time pickers must not depend on a particular change-event order.
  function currentRows() {
    const data = values();
    return rows.map((row) => ({
      ...row,
      label: String(data.get(`${row.id}-label`) ?? row.label),
      startTime: String(data.get(`${row.id}-start`) ?? row.startTime),
      endTime: String(data.get(`${row.id}-end`) ?? row.endTime),
    }));
  }
  function report(error: unknown) {
    setFailed(true);
    setMessage((error as Error).message);
  }
  function change(
    id: string,
    field: "label" | "startTime" | "endTime",
    text: string,
  ) {
    setMessage("");
    setFailed(false);
    const edited = currentRows().map((row) =>
      row.id === id ? { ...row, [field]: text } : row,
    );
    if (field === "startTime" && text) {
      try {
        const endTime = automaticEnd(text, options().lessonMinutes);
        setRows(
          edited.map((row) => (row.id === id ? { ...row, endTime } : row)),
        );
      } catch (error) {
        setRows(
          edited.map((row) => (row.id === id ? { ...row, endTime: "" } : row)),
        );
        report(error);
      }
    } else setRows(edited);
  }
  function add() {
    try {
      const existing = currentRows();
      const next = nextTimeBlock(existing, options());
      setRows([...existing, { ...next, id: crypto.randomUUID() }]);
      setMessage("");
      setFailed(false);
    } catch (error) {
      report(error);
    }
  }
  function generate() {
    try {
      setGenerated(generateTimeBlocks(options()));
      setMessage("");
      setFailed(false);
    } catch (error) {
      setGenerated(null);
      report(error);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    const data = values();
    try {
      const saved = await api.savePreferences({
        timeBlocks: currentRows(),
        version: value.version,
        semesterStart: String(data.get("semesterStart") || "") || null,
      });
      onSaved(saved);
      setRows(saved.timeBlocks);
      setMessage("学期与时段已保存，日历会按新的设置显示。");
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card time-block-settings">
      <h2>学期与课程时段</h2>
      <p className="small muted">
        从第一节开始显示；课前、课后有安排时自动补出时间。这里只定义作息，不会生成实际课程。
      </p>
      <form ref={form} onSubmit={save}>
        <fieldset disabled={busy || !connected}>
          <DatePicker
            key={`semester-${value.version}`}
            label="学期开始日期"
            name="semesterStart"
            defaultValue={value.semesterStart || ""}
            optional
          />
          <p className="small muted">开学日期所在周为第 1 周，每周一至周日。</p>
          <div className="period-generator">
            <h3>一键生成节次</h3>
            <div className="generator-pair">
              <label>
                每日第一节
                <input
                  name="firstStart"
                  aria-label="每日第一节开始时间"
                  type="time"
                  defaultValue={first?.startTime || "08:00"}
                />
              </label>
              <label>
                每节时长（分钟）
                <input
                  name="lessonMinutes"
                  aria-label="每节时长"
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  defaultValue="45"
                />
              </label>
            </div>
            <div className="session-counts">
              <label>
                上午节数
                <input
                  name="morningCount"
                  aria-label="上午节数"
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  defaultValue="4"
                />
              </label>
              <label>
                下午节数
                <input
                  name="afternoonCount"
                  aria-label="下午节数"
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  defaultValue="4"
                />
              </label>
              <label>
                晚上节数
                <input
                  name="eveningCount"
                  aria-label="晚上节数"
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  defaultValue="2"
                />
              </label>
            </div>
            <div className="generator-advanced">
              <label>
                课间（分钟）
                <input
                  name="breakMinutes"
                  aria-label="课间时长"
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  defaultValue="10"
                />
              </label>
              <div className="generator-pair">
                <label>
                  午休（分钟）
                  <input
                    name="middayBreakMinutes"
                    aria-label="午休时长"
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    placeholder="请输入"
                  />
                </label>
                <label>
                  晚休（分钟）
                  <input
                    name="eveningBreakMinutes"
                    aria-label="晚休时长"
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    placeholder="请输入"
                  />
                </label>
              </div>
            </div>
            <p className="small muted">
              课间默认 10
              分钟。午休、晚休由你填写，分别从上一段最后一节结束起算，不再叠加课间；没有对应课程时可留空。修改下方开始时间时，按上面的课长计算结束时间。
            </p>
            <button
              className="secondary full-width"
              type="button"
              onClick={generate}
            >
              生成预览
            </button>
            {generated && (
              <div className="generated-preview">
                <h4>生成 {generated.length} 个时段</h4>
                <div className="generated-list">
                  {generated.map((row) => (
                    <div key={row.label}>
                      <strong>{row.label}</strong>
                      <span>
                        {row.startTime} — {row.endTime}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="small muted">
                  应用会替换下方的时段草稿，已有日程不变；保存后才生效。
                </p>
                <button
                  className="primary full-width"
                  type="button"
                  onClick={() => {
                    setRows(
                      generated.map((row) => ({
                        ...row,
                        id: crypto.randomUUID(),
                      })),
                    );
                    setGenerated(null);
                    setMessage("已应用到下方，请检查后保存。");
                    setFailed(false);
                  }}
                >
                  使用这些时段
                </button>
              </div>
            )}
          </div>
          <h3 className="period-list-heading">逐节调整</h3>
          {!rows.length && (
            <p className="period-empty">可以先一键生成，也可以逐节添加。</p>
          )}
          {rows.map((row, index) => (
            <div className="period-editor" key={row.id}>
              <div className="period-editor-title">
                <label>
                  时段名称
                  <input
                    name={`${row.id}-label`}
                    aria-label={`第${index + 1}个时段名称`}
                    value={row.label}
                    required
                    maxLength={16}
                    onChange={(event) =>
                      change(row.id, "label", event.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="remove-period"
                  aria-label={`移除${row.label}`}
                  onClick={() => {
                    setRows(currentRows().filter((item) => item.id !== row.id));
                    setMessage("移除将在保存后生效，不会删除已有日程。");
                    setFailed(false);
                  }}
                >
                  移除
                </button>
              </div>
              <div className="period-times">
                <label>
                  开始
                  <input
                    name={`${row.id}-start`}
                    aria-label={`第${index + 1}个时段开始`}
                    type="time"
                    required
                    value={row.startTime}
                    onInput={(event) =>
                      change(row.id, "startTime", event.currentTarget.value)
                    }
                    onChange={(event) =>
                      change(row.id, "startTime", event.target.value)
                    }
                  />
                </label>
                <span>—</span>
                <label>
                  结束
                  <input
                    name={`${row.id}-end`}
                    aria-label={`第${index + 1}个时段结束`}
                    type="time"
                    required
                    value={row.endTime}
                    onInput={(event) =>
                      change(row.id, "endTime", event.currentTarget.value)
                    }
                    onChange={(event) =>
                      change(row.id, "endTime", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <div className="period-tools">
            <button
              className="secondary"
              type="button"
              disabled={rows.length >= 24}
              onClick={add}
            >
              ＋ 添加下一节
            </button>
          </div>
          <p className="small muted">
            下一节接在最后一节结束后，自动留出课间。最多 24
            节。导入教务课表请使用下方的课表导入入口。
          </p>
          <button className="primary full-width" type="submit">
            {busy ? "正在保存…" : "保存学期与时段"}
          </button>
        </fieldset>
      </form>
      {!connected && <p className="small muted">连接服务后可以编辑。</p>}
      {message && (
        <p
          className={failed ? "form-error" : "period-feedback"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
