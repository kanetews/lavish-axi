/* global document, window */
// Draws the hoopssim grill page from a question list. The page supplies only data:
//   <script type="application/json" id="hoopssim-grill-data">[ {id, round, question, options: [{label, text, star}]} ]</script>
// Optional per entry: title, context, claims [{title, text}], drawings [html | {html, caption}], multi,
// and settled {answer, words, reading}. The hoopssim-grill playbook documents every field.
// Each open question card queues its own answer through window.lavish.queuePrompt; nothing is pre-selected.
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
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
    } catch {
      return [];
    }
  }

  /**
   * Splits text on blank lines; single line breaks inside a paragraph survive through CSS.
   * @param {unknown} text
   * @returns {string[]}
   */
  function paragraphs(text) {
    return String(text ?? "")
      .split(/\r?\n\s*\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  /**
   * @param {HTMLElement} parent
   * @param {unknown} text
   * @param {string} className
   * @param {string} [lead] bold label before the first paragraph
   */
  function appendParagraphs(parent, text, className, lead) {
    paragraphs(text).forEach((part, index) => {
      const p = el("p", { class: className });
      if (lead && index === 0) p.append(el("b", {}, lead + " "));
      p.append(document.createTextNode(part));
      parent.appendChild(p);
    });
  }

  /** @param {any} question */
  function roundOf(question) {
    return Number(question.round) || 1;
  }

  /** @param {any} question */
  function shortTitle(question) {
    if (question.title) return String(question.title);
    return paragraphs(question.question)[0] || String(question.id);
  }

  /** @param {any} question */
  function isSettled(question) {
    return Boolean(question.settled) && typeof question.settled === "object";
  }

  /**
   * Drawings are page content the agent wrote, inserted as markup; inline SVG is the expected form.
   * @param {any} question
   * @returns {HTMLElement | null}
   */
  function renderDrawings(question) {
    const drawings = Array.isArray(question.drawings) ? question.drawings : [];
    const wrap = el("div", { class: "hg-drawings" });
    for (const drawing of drawings) {
      const html = typeof drawing === "string" ? drawing : drawing && drawing.html;
      if (!html) continue;
      const figure = el("figure", { class: "hg-drawing" });
      const canvas = el("div", { class: "hg-drawing-body" });
      canvas.innerHTML = String(html);
      figure.appendChild(canvas);
      if (drawing && typeof drawing === "object" && drawing.caption) {
        figure.appendChild(el("figcaption", {}, String(drawing.caption)));
      }
      wrap.appendChild(figure);
    }
    return wrap.childElementCount ? wrap : null;
  }

  /**
   * @param {any} question
   * @returns {HTMLElement | null}
   */
  function renderClaims(question) {
    const claims = Array.isArray(question.claims) ? question.claims : [];
    const wrap = el("div", { class: "hg-claims" });
    for (const claim of claims) {
      if (!claim || typeof claim !== "object") continue;
      const box = el("div", { class: "hg-claim" });
      if (claim.title) box.appendChild(el("h4", { class: "hg-claim-title" }, String(claim.title)));
      appendParagraphs(box, claim.text, "hg-claim-text");
      wrap.appendChild(box);
    }
    return wrap.childElementCount ? wrap : null;
  }

  /**
   * @param {any} question
   * @returns {HTMLElement}
   */
  function renderCard(question) {
    const id = String(question.id);
    const multi = question.multi === true;
    const options = Array.isArray(question.options) ? question.options : [];
    const card = el("section", { class: "hg-card", "data-lavish-question": id });
    if (multi) card.setAttribute("data-multi", "true");

    const head = el("div", { class: "hg-card-head" });
    head.appendChild(el("span", { class: "hg-id" }, id));
    const questionText = el("div", { class: "hg-question" });
    appendParagraphs(questionText, question.question || id, "hg-question-text");
    head.appendChild(questionText);
    card.appendChild(head);

    if (question.context) {
      const context = el("div", { class: "hg-context" });
      appendParagraphs(context, question.context, "hg-context-text");
      card.appendChild(context);
    }
    const drawings = renderDrawings(question);
    if (drawings) card.appendChild(drawings);
    const claims = renderClaims(question);
    if (claims) card.appendChild(claims);

    if (multi) card.appendChild(el("p", { class: "hg-multi-hint" }, "Tick as many as apply."));
    const group = el("div", {
      class: "hg-options",
      role: multi ? "group" : "radiogroup",
      "aria-label": shortTitle(question),
    });
    options.forEach((option, index) => {
      const label = el("label", { class: "hg-option" });
      const input = /** @type {HTMLInputElement} */ (
        el("input", { type: multi ? "checkbox" : "radio", name: "hg-" + id, value: String(option.label) })
      );
      input.dataset.index = String(index);
      const body = el("span", { class: "hg-option-body" });
      const optionHead = el("span", { class: "hg-option-label" }, String(option.label));
      if (option.star) optionHead.appendChild(el("span", { class: "hg-star", title: "Backed by the evidence" }, " ⭐"));
      body.appendChild(optionHead);
      body.appendChild(el("span", { class: "hg-option-text" }, String(option.text || "")));
      label.append(input, body);
      group.appendChild(label);
    });
    card.appendChild(group);

    const note = /** @type {HTMLTextAreaElement} */ (
      el("textarea", {
        class: "hg-note",
        rows: "2",
        placeholder: multi ? "Note (optional if you ticked an option)" : "Note (optional if you picked an option)",
      })
    );
    card.appendChild(note);

    const actions = el("div", { class: "hg-actions" });
    const queue = /** @type {HTMLButtonElement} */ (
      el("button", { type: "button", class: "hg-queue" }, "Queue answer")
    );
    const clear = el("button", { type: "button", class: "hg-clear" }, multi ? "Clear ticks" : "Clear choice");
    const status = el("span", { class: "hg-status", "aria-live": "polite" });
    actions.append(queue, clear, status);
    card.appendChild(actions);

    const ticked = () =>
      /** @type {HTMLInputElement[]} */ ([...card.querySelectorAll("input[type=radio],input[type=checkbox]")]).filter(
        (input) => input.checked,
      );
    // Queue is never disabled: Lavish restores tick and note values on reload without firing events,
    // so a disabled flag derived from events would go stale. The click reads the live values instead.
    const sync = () => {
      status.textContent = "";
      card.removeAttribute("data-queued");
    };
    card.addEventListener("input", sync);
    card.addEventListener("change", sync);
    clear.addEventListener("click", () => {
      for (const input of ticked()) input.checked = false;
      sync();
    });
    queue.addEventListener("click", () => {
      const labels = ticked().map((input) => input.value);
      const noteText = note.value.trim();
      if (!labels.length && !noteText) {
        status.textContent = multi ? "Tick an option or write a note first." : "Pick an option or write a note first.";
        return;
      }
      const lines = ["Question " + id + ": " + String(question.question || "")];
      if (!labels.length) lines.push("Option: none (note only)");
      else for (const label of labels) lines.push("Option: " + label);
      if (noteText) lines.push("Note: " + noteText);
      // Agents read a pick-one `option` as a label string or null, so only tick-several sends an array.
      const option = multi ? (labels.length ? labels : null) : labels[0] || null;
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
        target: { question: id, option, note: noteText },
      });
      status.textContent = "Queued. Send from the Lavish panel.";
      card.setAttribute("data-queued", "true");
    });

    sync();
    return card;
  }

  /**
   * @param {any} question
   * @returns {HTMLElement}
   */
  function renderSettledLine(question) {
    const settled = question.settled;
    // Rendered closed on every load: Lavish replays only form controls, so a reload never reopens it.
    const line = el("details", { class: "hg-settled-item", "data-settled-question": String(question.id) });
    const summary = el("summary");
    summary.append(
      el("span", { class: "hg-id" }, String(question.id)),
      el("span", { class: "hg-settled-q" }, shortTitle(question)),
      el("span", { class: "hg-chip" }, String(settled.answer || "Settled")),
    );
    line.appendChild(summary);
    const body = el("div", { class: "hg-settled-body" });
    appendParagraphs(body, settled.words, "hg-settled-text", "Your words:");
    appendParagraphs(body, settled.reading, "hg-settled-text", "What it changes:");
    line.appendChild(body);
    return line;
  }

  /**
   * @param {any[]} questions settled entries from every round before the latest settled one
   * @returns {HTMLElement}
   */
  function renderSettledTable(questions) {
    const rounds = [...new Set(questions.map(roundOf))].sort((a, b) => a - b);
    const span =
      rounds.length === 1 ? "round " + rounds[0] : "rounds " + rounds[0] + " to " + rounds[rounds.length - 1];
    const fold = el("details", { class: "hg-settled-earlier" });
    fold.appendChild(el("summary", {}, "Settled in " + span));
    const scroll = el("div", { class: "hg-table-scroll" });
    const table = el("table", { class: "hg-settled-table" });
    const headRow = el("tr");
    for (const name of ["#", "Question", "Your answer"]) headRow.appendChild(el("th", { scope: "col" }, name));
    table.appendChild(el("thead")).appendChild(headRow);
    const tbody = el("tbody");
    for (const question of questions) {
      const row = el("tr", { "data-settled-question": String(question.id) });
      row.append(
        el("td", { class: "hg-table-id" }, String(question.id)),
        el("td", {}, shortTitle(question)),
        el("td", {}, String(question.settled.answer || "Settled")),
      );
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    fold.appendChild(scroll);
    return fold;
  }

  /**
   * @param {any[]} settled
   * @returns {HTMLElement}
   */
  function renderSettled(settled) {
    const latest = Math.max(...settled.map(roundOf));
    const section = el("section", { class: "hg-settled", "data-latest-settled-round": String(latest) });
    section.appendChild(el("h2", { class: "hg-round-title" }, "Settled"));
    section.appendChild(el("p", { class: "hg-settled-round" }, "Round " + latest));
    for (const question of settled.filter((entry) => roundOf(entry) === latest)) {
      section.appendChild(renderSettledLine(question));
    }
    const earlier = settled.filter((entry) => roundOf(entry) < latest);
    if (earlier.length) section.appendChild(renderSettledTable(earlier));
    return section;
  }

  function render() {
    const root =
      document.getElementById("hoopssim-grill") || document.body.appendChild(el("main", { id: "hoopssim-grill" }));
    const questions = readQuestions();
    const settled = questions.filter(isSettled);
    if (settled.length) root.appendChild(renderSettled(settled));

    const rounds = new Map();
    for (const question of questions) {
      if (isSettled(question)) continue;
      const round = roundOf(question);
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
