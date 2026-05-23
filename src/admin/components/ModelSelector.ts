import van from "vanjs-core";
import { svgChevronDown } from "../../helper/svgHelper";
import { selectedProvider, selectedModel } from "../ai-state";
import { aiModels, aiModelsOpen } from "../state";
import { saveModelSelection } from "../actions/ai";

const { div, span } = van.tags;

export function ModelSelector() {
  return div(
    {
      class: () => "model-select" + (aiModelsOpen.val ? " open" : ""),
      tabindex: "0",
      onblur: (e: FocusEvent) => {
        const tgt = e.relatedTarget as HTMLElement | null;
        const el = e.currentTarget as HTMLElement;
        if (!tgt || !el.contains(tgt)) {
          aiModelsOpen.val = false;
        }
      },
    },
    div(
      {
        class: "model-select-trigger",
        onclick: () => (aiModelsOpen.val = !aiModelsOpen.val),
      },
      span({ class: "model-select-label" }, () => {
        const prov = aiModels.val.find((p) => p.id === selectedProvider.val);
        const name = prov ? `${prov.name}/${selectedModel.val}` : "无可用模型";
        return name;
      }),
      span(
        {
          class: () => "model-select-arrow" + (aiModelsOpen.val ? " open" : ""),
        },
        svgChevronDown(),
      ),
    ),
    div(
      { class: "model-select-dropdown" },
      aiModels.val.flatMap((prov) => [
        div({ class: "model-select-group" }, prov.name),
        ...prov.models.map((m) =>
          div(
            {
              class: () =>
                "model-select-option" +
                (selectedProvider.val === prov.id && selectedModel.val === m
                  ? " active"
                  : ""),
              onclick: () => {
                selectedProvider.val = prov.id;
                selectedModel.val = m;
                saveModelSelection(prov.id, m);
                aiModelsOpen.val = false;
              },
            },
            m,
          ),
        ),
      ]),
    ),
  );
}
