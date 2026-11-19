import { exitSuggestion } from "@tiptap/suggestion";
import type { PluginKey } from "@tiptap/pm/state";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

export interface MenuItem {
  label: string;
  description?: string;
  disabled?: boolean;
}

export function createSuggestionRenderer<T extends MenuItem>(pluginKey: PluginKey) {
  let element: HTMLDivElement | null = null;
  let currentProps: SuggestionProps<T, T> | null = null;
  let selectedIndex = 0;

  const renderItems = () => {
    if (!element || !currentProps) return;
    const menu = element;
    const items = currentProps.items;
    selectedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0));
    menu.replaceChildren();
    const rect = currentProps.clientRect?.();
    if (rect) {
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 6}px`;
    }

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "suggestion-empty";
      empty.textContent = "Aucun résultat";
      menu.append(empty);
      return;
    }

    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `suggestion-option${index === selectedIndex ? " suggestion-option-active" : ""}${item.disabled ? " suggestion-option-disabled" : ""}`;
      button.disabled = Boolean(item.disabled);
      button.setAttribute("role", "option");

      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(label);
      if (item.description) {
        const description = document.createElement("small");
        description.textContent = item.description;
        button.append(description);
      }

      button.addEventListener("mouseenter", () => {
        selectedIndex = index;
        renderItems();
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (currentProps && !item.disabled) currentProps.command(item);
      });
      menu.append(button);
    });

  };

  return {
    render: () => ({
      onStart: (props: SuggestionProps<T, T>) => {
        currentProps = props;
        selectedIndex = 0;
        element = document.createElement("div");
        element.className = "suggestion-menu";
        element.setAttribute("role", "listbox");
        document.body.append(element);
        renderItems();
      },
      onUpdate: (props: SuggestionProps<T, T>) => {
        currentProps = props;
        renderItems();
      },
      onExit: () => {
        element?.remove();
        element = null;
        currentProps = null;
      },
      onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
        if (!currentProps) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIndex = (selectedIndex + 1) % Math.max(currentProps.items.length, 1);
          renderItems();
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIndex = (selectedIndex - 1 + Math.max(currentProps.items.length, 1)) % Math.max(currentProps.items.length, 1);
          renderItems();
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = currentProps.items[selectedIndex];
          if (item && !item.disabled) currentProps.command(item);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          exitSuggestion(view, pluginKey);
          return true;
        }
        return false;
      },
    }),
  };
}
