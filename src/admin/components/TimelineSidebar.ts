import van from "vanjs-core";
import type { YearGroup, MonthGroup } from "../state";
import {
  selectedMonth,
  collapsedYears,
  timelineCache,
  memos,
  selectedCreativeMonth,
  collapsedCreativeYears,
  creativeTimelineCache,
  creativeItems,
} from "../state";

const { div, span, aside } = van.tags;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function computeTimelineData(
  items: Array<{ id: number; created_at: string }>,
): YearGroup[] {
  const yearMap = new Map<
    number,
    Map<number, { count: number; firstMemoId: number }>
  >();

  for (const item of items) {
    const date = new Date(item.created_at + "Z");
    const year = date.getFullYear();
    const month = date.getMonth();

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;

    if (!monthMap.has(month)) {
      monthMap.set(month, { count: 1, firstMemoId: item.id });
    } else {
      monthMap.get(month)!.count++;
    }
  }

  const result: YearGroup[] = [];
  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a);

  for (const year of sortedYears) {
    const monthMap = yearMap.get(year)!;
    const months: MonthGroup[] = [...monthMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([m, data]) => ({
        month: m,
        name: MONTH_NAMES[m] ?? String(m + 1),
        count: data.count,
        firstMemoId: data.firstMemoId,
      }));
    result.push({ year, months });
  }

  return result;
}

function scrollToMonth(memoId: number): void {
  const el = document.querySelector(`[data-memo-id="${memoId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function scrollToCreativeItem(itemId: number): void {
  const el = document.querySelector(`[data-creative-id="${itemId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function toggleYear(year: number): void {
  const current = new Set(collapsedYears.val);
  if (current.has(year)) {
    current.delete(year);
  } else {
    current.add(year);
  }
  collapsedYears.val = current;
}

function toggleCreativeYear(year: number): void {
  const current = new Set(collapsedCreativeYears.val);
  if (current.has(year)) {
    current.delete(year);
  } else {
    current.add(year);
  }
  collapsedCreativeYears.val = current;
}

export function TimelineSidebar() {
  return aside({ class: "timeline-sidebar" }, () => {
    const currentMemos = memos.val;
    if (timelineCache.memos !== currentMemos) {
      timelineCache.data = computeTimelineData(currentMemos);
      timelineCache.memos = currentMemos;
    }
    const groups = timelineCache.data || [];
    if (groups.length === 0) return div();
    return div(
      ...groups.map((group) => {
        const isCollapsed = collapsedYears.val.has(group.year);
        return div(
          div(
            {
              class: "timeline-year",
              onclick: () => toggleYear(group.year),
            },
            span(String(group.year)),
            span({ class: "arrow" }, isCollapsed ? "\u25B8" : "\u25BE"),
          ),
          isCollapsed
            ? ""
            : div(
                { class: "timeline-months" },
                ...group.months.map((m) => {
                  const key = `${group.year}-${String(m.month + 1).padStart(2, "0")}`;
                  return div(
                    {
                      class: () =>
                        "timeline-month" +
                        (selectedMonth.val === key ? " active" : ""),
                      onclick: () => {
                        selectedMonth.val = key;
                        scrollToMonth(m.firstMemoId);
                      },
                    },
                    span(m.name),
                    span({ class: "count" }, String(m.count)),
                  );
                }),
              ),
        );
      }),
    );
  });
}

export function CreativeTimelineSidebar() {
  return aside({ class: "timeline-sidebar" }, () => {
    const currentItems = creativeItems.val;
    if (creativeTimelineCache.items !== currentItems) {
      creativeTimelineCache.data = computeTimelineData(currentItems);
      creativeTimelineCache.items = currentItems;
    }
    const groups = creativeTimelineCache.data || [];
    if (groups.length === 0) return div();
    return div(
      ...groups.map((group) => {
        const isCollapsed = collapsedCreativeYears.val.has(group.year);
        return div(
          div(
            {
              class: "timeline-year",
              onclick: () => toggleCreativeYear(group.year),
            },
            span(String(group.year)),
            span({ class: "arrow" }, isCollapsed ? "\u25B8" : "\u25BE"),
          ),
          isCollapsed
            ? ""
            : div(
                { class: "timeline-months" },
                ...group.months.map((m) => {
                  const key = `${group.year}-${String(m.month + 1).padStart(2, "0")}`;
                  return div(
                    {
                      class: () =>
                        "timeline-month" +
                        (selectedCreativeMonth.val === key ? " active" : ""),
                      onclick: () => {
                        selectedCreativeMonth.val = key;
                        scrollToCreativeItem(m.firstMemoId);
                      },
                    },
                    span(m.name),
                    span({ class: "count" }, String(m.count)),
                  );
                }),
              ),
        );
      }),
    );
  });
}
