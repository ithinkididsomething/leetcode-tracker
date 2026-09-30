import type { Heatmap as HeatmapData } from "@/lib/stats";

function level(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

const LEVEL_CLASS = [
  "bg-ink-100",
  "bg-emerald-200",
  "bg-emerald-300",
  "bg-emerald-500",
  "bg-emerald-700",
];

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

/** GitHub-style contribution grid. Columns are weeks, rows run Mon..Sun. */
export function Heatmap({ heatmap }: { heatmap: HeatmapData }) {
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col gap-[3px] pr-1">
          {DAY_LABELS.map((l, i) => (
            <span
              key={i}
              className="flex h-[13px] items-center text-[10px] leading-none text-ink-400"
            >
              {l}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {heatmap.weeks.map((week) => (
            <div key={week.key} className="flex flex-col gap-[3px]">
              {week.days.map((day) => {
                const date = new Date(`${day.key}T00:00:00`);
                return (
                  <div
                    key={day.key}
                    title={
                      day.count > 0
                        ? `${day.count} solved on ${date.toLocaleDateString()}`
                        : `Nothing on ${date.toLocaleDateString()}`
                    }
                    className={`h-[13px] w-[13px] rounded-[2px] ring-1 ring-inset ring-black/5 ${
                      LEVEL_CLASS[level(day.count, heatmap.max)]
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-400">
        <span>Less</span>
        {LEVEL_CLASS.map((c, i) => (
          <span key={i} className={`h-[10px] w-[10px] rounded-[2px] ring-1 ring-inset ring-black/5 ${c}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
