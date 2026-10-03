/* global document, window */
// Draws the hoopssim grill page from a question list. The page supplies only data:
//   <script type="application/json" id="hoopssim-grill-data">[ {id, round, question, options: [{label, text, star}]} ]</script>
// Each question card queues its own answer through window.lavish.queuePrompt; nothing is pre-selected.
(function () {
  "use strict";

  /**
   * @param {string} tag
   * @param {Record<string, string>} [attrs]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** @returns {Array<any>} */
  function readQuestions() {
    const source = document.getElementById("hoopssim-grill-data");
    if (!source) return [];
    try {
      const parsed = JSON.parse(source.textContent || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * @param {any} question
   * @returns {HTMLElement}
   */
  function renderCard(question) {
    const id = String(question.id);
    const options = Array.isArray(question.options) ? question.options : [];
    const card = el("section", { class: "hg-card", "data-lavish-question": id });
    card.appendChild(el("h3", { class: "hg-question" }, String(question.question || id)));

    const group = el("div", { class: "hg-options", role: "radiogroup", "aria-label": String(question.question || id) });
    options.forEach((option, index) => {
      const label = el("label", { class: "hg-option" });
      const input = /** @type {HTMLInputElement} */ (
        el("input", { type: "radio", name: "hg-" + id, value: String(option.label) })
      );
      input.dataset.index = String(index);
      const body = el("span", { class: "hg-option-body" });
      const head = el("span", { class: "hg-option-label" }, String(option.label));
      if (option.star) head.appendChild(el("span", { class: "hg-star", title: "Backed by the evidence" }, " ⭐"));
      body.appendChild(head);
      body.appendChild(el("span", { class: "hg-option-text" }, String(option.text || "")));
      label.append(input, body);
      group.appendChild(label);
    });
    card.appendChild(group);

    const note = /** @type {HTMLTextAreaElement} */ (
      el("textarea", { class: "hg-note", rows: "2", placeholder: "Note (optional if you picked an option)" })
    );
    card.appendChild(note);

    const actions = el("div", { class: "hg-actions" });
    const queue = /** @type {HTMLButtonElement} */ (
      el("button", { type: "button", class: "hg-queue" }, "Queue answer")
    );
    const clear = el("button", { type: "button", class: "hg-clear" }, "Clear choice");
    const status = el("span", { class: "hg-status", "aria-live": "polite" });
    actions.append(queue, clear, status);
    card.appendChild(actions);

    const picked = () => /** @type {HTMLInputElement | null} */ (card.querySelector("input[type=radio]:checked"));
    // Queue is never disabled: Lavish restores radio and note values on reload without firing events,
    // so a disabled flag derived from events would go stale. The click reads the live values instead.
    const sync = () => {
      status.textContent = "";
      card.removeAttribute("data-queued");
    };
    card.addEventListener("input", sync);
    card.addEventListener("change", sync);
    clear.addEventListener("click", () => {
      const chosen = picked();
      if (chosen) chosen.checked = false;
      sync();
    });
    queue.addEventListener("click", () => {
      const chosen = picked();
      const noteText = note.value.trim();
      const optionLabel = chosen ? chosen.value : null;
      if (!optionLabel && !noteText) {
        status.textContent = "Pick an option or write a note first.";
        return;
      }
      const lines = ["Question " + id + ": " + String(question.question || "")];
      lines.push(optionLabel ? "Option: " + optionLabel : "Option: none (note only)");
      if (noteText) lines.push("Note: " + noteText);
      const lavish = /** @type {any} */ (window).lavish;
      if (!lavish || typeof lavish.queuePrompt !== "function") {
        status.textContent = "Open this page in Lavish to queue answers.";
        return;
      }
      lavish.queuePrompt(lines.join("\n"), {
        tag: "grill-answer",
        element: card,
        queueKey: "grill-" + id,
        text: "Answer to " + id,
        target: { question: id, option: optionLabel, note: noteText },
      });
      status.textContent = "Queued. Send from the Lavish panel.";
      card.setAttribute("data-queued", "true");
    });

    sync();
    status.textContent = "";
    return card;
  }

  function render() {
    const root =
      document.getElementById("hoopssim-grill") || document.body.appendChild(el("main", { id: "hoopssim-grill" }));
    const questions = readQuestions();
    const rounds = new Map();
    for (const question of questions) {
      const round = Number(question.round) || 1;
      if (!rounds.has(round)) rounds.set(round, []);
      rounds.get(round).push(question);
    }
    for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
      const section = el("section", { class: "hg-round", "data-round": String(round) });
      section.appendChild(el("h2", { class: "hg-round-title" }, "Round " + round));
      for (const question of rounds.get(round)) section.appendChild(renderCard(question));
      root.appendChild(section);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
