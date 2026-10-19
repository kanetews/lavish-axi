import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const grillSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/grill/hoopssim-grill.js"),
  "utf8",
);

// Just enough DOM for the grill script to draw into: it only builds elements, sets attributes and text,
// and attaches listeners that these tests never fire.
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.ownText = "";
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...children) {
    for (const child of children) this.appendChild(child);
  }
  addEventListener() {}
  set textContent(value) {
    this.children = [];
    this.ownText = String(value);
  }
  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  set innerHTML(value) {
    this.ownText = String(value);
  }
  get childElementCount() {
    return this.children.filter((child) => child instanceof FakeElement).length;
  }
  *walk() {
    for (const child of this.children) {
      if (!(child instanceof FakeElement)) continue;
      yield child;
      yield* child.walk();
    }
  }
}

function renderGrill(questions) {
  const root = new FakeElement("div");
  const data = { textContent: JSON.stringify(questions) };
  const document = {
    readyState: "complete",
    body: new FakeElement("body"),
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    getElementById: (id) => (id === "hoopssim-grill" ? root : id === "hoopssim-grill-data" ? data : null),
    addEventListener() {},
  };
  vm.runInNewContext(grillSource, { document, window: {} });
  const all = [...root.walk()];
  const cards = all.filter((node) => node.getAttribute("data-lavish-question") !== null);
  return {
    cardIds: cards.map((card) => card.children[0].children[0].textContent),
    cardKey: (id) =>
      cards.find((card) => card.children[0].children[0].textContent === id)?.getAttribute("data-lavish-question"),
    roundHeadings: all.filter((node) => node.tagName === "H2").map((node) => node.textContent),
    askLine: all.find((node) => node.getAttribute("class") === "hg-round-ask")?.textContent,
  };
}

const option = (label) => ({ label, text: label + " means this." });
const firstAsk = {
  id: "1.3",
  round: 1,
  question: "Does the award go to one player?",
  options: [option("One player"), option("Shared")],
};

test("a question asked again draws under a new restore key, so Kane's earlier tick and note are not replayed into it", () => {
  const before = renderGrill([firstAsk]).cardKey("1.3");
  assert.ok(before, "the first ask is drawn as a card");
  assert.equal(renderGrill([{ ...firstAsk, context: "Added evidence." }]).cardKey("1.3"), before);

  const askedAgain = [
    { ...firstAsk, round: 2 },
    { ...firstAsk, question: "Does the award go to exactly one player, with no ties?" },
    { ...firstAsk, options: [option("One player"), option("Split between two")] },
  ];
  for (const ask of askedAgain) assert.notEqual(renderGrill([ask]).cardKey("1.3"), before);
});

test("only the latest round's open questions are drawn, under a heading that counts them", () => {
  const page = renderGrill([
    {
      ...firstAsk,
      id: "1.1",
      settled: { answer: "One", words: "One player.", reading: "No ties." },
    },
    { ...firstAsk, id: "1.2" },
    { ...firstAsk, id: "2.1", round: 2 },
    { ...firstAsk, id: "2.2", round: 2 },
  ]);
  assert.deepEqual(page.cardIds, ["2.1", "2.2"]);
  assert.deepEqual(page.roundHeadings, ["Settled", "Round 2"]);
  assert.equal(page.askLine, "2 questions to answer");
});
