import van, { type State } from "vanjs-core";
import { renderMarkdown } from "../../../helper/markdown";

const { div, span, button, h3 } = van.tags;

/**
 * Shared ReadMore modal component.
 * Used by both masonry (homepage) and admin (memo + creative).
 *
 * @param text    - VanJS state holding the text content (null = closed)
 * @param onClose - Callback to close the modal and reset body overflow
 * @param title   - Modal title (default "Memo")
 * @param footer  - Optional footer render function for extra info (creative mode)
 */
export function ReadMoreModal({
  text,
  onClose,
  title = "Memo",
  footer,
}: {
  text: State<string | null>;
  onClose: () => void;
  title?: string;
  footer?: () => ReturnType<typeof div>;
}) {
  return div(
    {
      class: "modal-overlay",
      style: () => (text.val != null ? "display:flex" : "display:none"),
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) onClose();
      },
    },
    div(
      { class: "modal" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
        },
        h3({ style: "margin:0" }, title),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: onClose,
          },
          "\u2715",
        ),
      ),
      div(
        {
          style: "overflow-y:auto;max-height:60vh;padding-right:16px;",
        },
        div(
          {
            style:
              "font-size:15px;line-height:24px;color:#333;" +
              "white-space:pre-wrap;word-break:break-word;",
          },
          () =>
            span({
              class: "md-content",
              innerHTML: renderMarkdown(text.val || ""),
            }),
        ),
      ),
      footer?.(),
    ),
  );
}
