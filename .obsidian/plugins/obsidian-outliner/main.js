'use strict';

var obsidian = require('obsidian');
var view = require('@codemirror/view');
var language = require('@codemirror/language');
var state = require('@codemirror/state');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

class MoveCursorToPreviousUnfoldedLine {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = this.root.getListUnderCursor();
        const cursor = this.root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => {
            return (cursor.ch === l.from.ch + list.getCheckboxLength() &&
                cursor.line === l.from.line);
        });
        if (lineNo === 0) {
            this.moveCursorToPreviousUnfoldedItem(root, cursor);
        }
        else if (lineNo > 0) {
            this.moveCursorToPreviousNoteLine(root, lines, lineNo);
        }
    }
    moveCursorToPreviousNoteLine(root, lines, lineNo) {
        this.stopPropagation = true;
        this.updated = true;
        root.replaceCursor(lines[lineNo - 1].to);
    }
    moveCursorToPreviousUnfoldedItem(root, cursor) {
        const prev = root.getListUnderLine(cursor.line - 1);
        if (!prev) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        if (prev.isFolded()) {
            const foldRoot = prev.getTopFoldRoot();
            const firstLineEnd = foldRoot.getLinesInfo()[0].to;
            root.replaceCursor(firstLineEnd);
        }
        else {
            root.replaceCursor(prev.getLastLineContentEnd());
        }
    }
}

function getEditorFromState(state) {
    const { editor } = state.field(obsidian.editorInfoField);
    if (!editor) {
        return null;
    }
    return new MyEditor(editor);
}
function foldInside(view, from, to) {
    let found = null;
    language.foldedRanges(view.state).between(from, to, (from, to) => {
        if (!found || found.from > from)
            found = { from, to };
    });
    return found;
}
class MyEditor {
    constructor(e) {
        this.e = e;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.view = this.e.cm;
    }
    getCursor() {
        return this.e.getCursor();
    }
    getLine(n) {
        return this.e.getLine(n);
    }
    lastLine() {
        return this.e.lastLine();
    }
    listSelections() {
        return this.e.listSelections();
    }
    getRange(from, to) {
        return this.e.getRange(from, to);
    }
    replaceRange(replacement, from, to) {
        return this.e.replaceRange(replacement, from, to);
    }
    setSelections(selections) {
        this.e.setSelections(selections);
    }
    setValue(text) {
        this.e.setValue(text);
    }
    getValue() {
        return this.e.getValue();
    }
    offsetToPos(offset) {
        return this.e.offsetToPos(offset);
    }
    posToOffset(pos) {
        return this.e.posToOffset(pos);
    }
    fold(n) {
        const { view } = this;
        const l = view.lineBlockAt(view.state.doc.line(n + 1).from);
        const range = language.foldable(view.state, l.from, l.to);
        if (!range || range.from === range.to) {
            return;
        }
        view.dispatch({ effects: [language.foldEffect.of(range)] });
    }
    unfold(n) {
        const { view } = this;
        const l = view.lineBlockAt(view.state.doc.line(n + 1).from);
        const range = foldInside(view, l.from, l.to);
        if (!range) {
            return;
        }
        view.dispatch({ effects: [language.unfoldEffect.of(range)] });
    }
    getAllFoldedLines() {
        const c = language.foldedRanges(this.view.state).iter();
        const res = [];
        while (c.value) {
            res.push(this.offsetToPos(c.from).line);
            c.next();
        }
        return res;
    }
    triggerOnKeyDown(e) {
        view.runScopeHandlers(this.view, e, "editor");
    }
    getZoomRange() {
        if (!window.ObsidianZoomPlugin) {
            return null;
        }
        return window.ObsidianZoomPlugin.getZoomRange(this.e);
    }
    zoomOut() {
        if (!window.ObsidianZoomPlugin) {
            return;
        }
        window.ObsidianZoomPlugin.zoomOut(this.e);
    }
    zoomIn(line) {
        if (!window.ObsidianZoomPlugin) {
            return;
        }
        window.ObsidianZoomPlugin.zoomIn(this.e, line);
    }
    tryRefreshZoom(line) {
        if (!window.ObsidianZoomPlugin) {
            return;
        }
        if (window.ObsidianZoomPlugin.refreshZoom) {
            window.ObsidianZoomPlugin.refreshZoom(this.e);
        }
        else {
            window.ObsidianZoomPlugin.zoomIn(this.e, line);
        }
    }
}

function createKeymapRunCallback(config) {
    const check = config.check || (() => true);
    const { run } = config;
    return (view) => {
        const editor = getEditorFromState(view.state);
        if (!check(editor)) {
            return false;
        }
        const { shouldUpdate, shouldStopPropagation } = run(editor);
        return shouldUpdate || shouldStopPropagation;
    };
}

class ArrowLeftAndCtrlArrowLeftBehaviourOverride {
    constructor(plugin, settings, imeDetector, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return (this.settings.keepCursorWithinContent !== "never" &&
                !this.imeDetector.isOpened());
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new MoveCursorToPreviousUnfoldedLine(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "ArrowLeft",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
                {
                    win: "c-ArrowLeft",
                    linux: "c-ArrowLeft",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function cmpPos(a, b) {
    return a.line - b.line || a.ch - b.ch;
}
function maxPos(a, b) {
    return cmpPos(a, b) < 0 ? b : a;
}
function minPos(a, b) {
    return cmpPos(a, b) < 0 ? a : b;
}
function isRangesIntersects(a, b) {
    return cmpPos(a[1], b[0]) >= 0 && cmpPos(a[0], b[1]) <= 0;
}
function recalculateNumericBullets(root) {
    function visit(parent) {
        let index = 1;
        for (const child of parent.getChildren()) {
            if (/\d+\./.test(child.getBullet())) {
                child.replateBullet(`${index++}.`);
            }
            visit(child);
        }
    }
    visit(root);
}
let idSeq = 0;
class List {
    constructor(root, indent, bullet, optionalCheckbox, spaceAfterBullet, firstLine, foldRoot) {
        this.root = root;
        this.indent = indent;
        this.bullet = bullet;
        this.optionalCheckbox = optionalCheckbox;
        this.spaceAfterBullet = spaceAfterBullet;
        this.foldRoot = foldRoot;
        this.parent = null;
        this.children = [];
        this.notesIndent = null;
        this.lines = [];
        this.id = idSeq++;
        this.lines.push(firstLine);
    }
    getID() {
        return this.id;
    }
    getNotesIndent() {
        return this.notesIndent;
    }
    setNotesIndent(notesIndent) {
        if (this.notesIndent !== null) {
            throw new Error(`Notes indent already provided`);
        }
        this.notesIndent = notesIndent;
    }
    addLine(text) {
        if (this.notesIndent === null) {
            throw new Error(`Unable to add line, notes indent should be provided first`);
        }
        this.lines.push(text);
    }
    replaceLines(lines) {
        if (lines.length > 1 && this.notesIndent === null) {
            throw new Error(`Unable to add line, notes indent should be provided first`);
        }
        this.lines = lines;
    }
    getLineCount() {
        return this.lines.length;
    }
    getRoot() {
        return this.root;
    }
    getChildren() {
        return this.children.concat();
    }
    getLinesInfo() {
        const startLine = this.root.getContentLinesRangeOf(this)[0];
        return this.lines.map((row, i) => {
            const line = startLine + i;
            const startCh = i === 0 ? this.getContentStartCh() : this.notesIndent.length;
            const endCh = startCh + row.length;
            return {
                text: row,
                from: { line, ch: startCh },
                to: { line, ch: endCh },
            };
        });
    }
    getLines() {
        return this.lines.concat();
    }
    getFirstLineContentStart() {
        const startLine = this.root.getContentLinesRangeOf(this)[0];
        return {
            line: startLine,
            ch: this.getContentStartCh(),
        };
    }
    getFirstLineContentStartAfterCheckbox() {
        const startLine = this.root.getContentLinesRangeOf(this)[0];
        return {
            line: startLine,
            ch: this.getContentStartCh() + this.getCheckboxLength(),
        };
    }
    getLastLineContentEnd() {
        const endLine = this.root.getContentLinesRangeOf(this)[1];
        const endCh = this.lines.length === 1
            ? this.getContentStartCh() + this.lines[0].length
            : this.notesIndent.length + this.lines[this.lines.length - 1].length;
        return {
            line: endLine,
            ch: endCh,
        };
    }
    getContentEndIncludingChildren() {
        return this.getLastChild().getLastLineContentEnd();
    }
    getLastChild() {
        let lastChild = this;
        while (!lastChild.isEmpty()) {
            lastChild = lastChild.getChildren().last();
        }
        return lastChild;
    }
    getContentStartCh() {
        return this.indent.length + this.bullet.length + 1;
    }
    isFolded() {
        if (this.foldRoot) {
            return true;
        }
        if (this.parent) {
            return this.parent.isFolded();
        }
        return false;
    }
    isFoldRoot() {
        return this.foldRoot;
    }
    getTopFoldRoot() {
        let tmp = this;
        let foldRoot = null;
        while (tmp) {
            if (tmp.isFoldRoot()) {
                foldRoot = tmp;
            }
            tmp = tmp.parent;
        }
        return foldRoot;
    }
    getLevel() {
        if (!this.parent) {
            return 0;
        }
        return this.parent.getLevel() + 1;
    }
    unindentContent(from, till) {
        this.indent = this.indent.slice(0, from) + this.indent.slice(till);
        if (this.notesIndent !== null) {
            this.notesIndent =
                this.notesIndent.slice(0, from) + this.notesIndent.slice(till);
        }
        for (const child of this.children) {
            child.unindentContent(from, till);
        }
    }
    indentContent(indentPos, indentChars) {
        this.indent =
            this.indent.slice(0, indentPos) +
                indentChars +
                this.indent.slice(indentPos);
        if (this.notesIndent !== null) {
            this.notesIndent =
                this.notesIndent.slice(0, indentPos) +
                    indentChars +
                    this.notesIndent.slice(indentPos);
        }
        for (const child of this.children) {
            child.indentContent(indentPos, indentChars);
        }
    }
    getFirstLineIndent() {
        return this.indent;
    }
    getBullet() {
        return this.bullet;
    }
    getSpaceAfterBullet() {
        return this.spaceAfterBullet;
    }
    getCheckboxLength() {
        return this.optionalCheckbox.length;
    }
    replateBullet(bullet) {
        this.bullet = bullet;
    }
    getParent() {
        return this.parent;
    }
    addBeforeAll(list) {
        this.children.unshift(list);
        list.parent = this;
    }
    addAfterAll(list) {
        this.children.push(list);
        list.parent = this;
    }
    removeChild(list) {
        const i = this.children.indexOf(list);
        this.children.splice(i, 1);
        list.parent = null;
    }
    addBefore(before, list) {
        const i = this.children.indexOf(before);
        this.children.splice(i, 0, list);
        list.parent = this;
    }
    addAfter(before, list) {
        const i = this.children.indexOf(before);
        this.children.splice(i + 1, 0, list);
        list.parent = this;
    }
    getPrevSiblingOf(list) {
        const i = this.children.indexOf(list);
        return i > 0 ? this.children[i - 1] : null;
    }
    getNextSiblingOf(list) {
        const i = this.children.indexOf(list);
        return i >= 0 && i < this.children.length ? this.children[i + 1] : null;
    }
    isEmpty() {
        return this.children.length === 0;
    }
    print() {
        let res = "";
        for (let i = 0; i < this.lines.length; i++) {
            res +=
                i === 0
                    ? this.indent + this.bullet + this.spaceAfterBullet
                    : this.notesIndent;
            res += this.lines[i];
            res += "\n";
        }
        for (const child of this.children) {
            res += child.print();
        }
        return res;
    }
    clone(newRoot) {
        const clone = new List(newRoot, this.indent, this.bullet, this.optionalCheckbox, this.spaceAfterBullet, "", this.foldRoot);
        clone.id = this.id;
        clone.lines = this.lines.concat();
        clone.notesIndent = this.notesIndent;
        for (const child of this.children) {
            clone.addAfterAll(child.clone(newRoot));
        }
        return clone;
    }
}
class Root {
    constructor(start, end, selections) {
        this.start = start;
        this.end = end;
        this.rootList = new List(this, "", "", "", "", "", false);
        this.selections = [];
        this.replaceSelections(selections);
    }
    getRootList() {
        return this.rootList;
    }
    getContentRange() {
        return [this.getContentStart(), this.getContentEnd()];
    }
    getContentStart() {
        return Object.assign({}, this.start);
    }
    getContentEnd() {
        return Object.assign({}, this.end);
    }
    getSelections() {
        return this.selections.map((s) => ({
            anchor: Object.assign({}, s.anchor),
            head: Object.assign({}, s.head),
        }));
    }
    hasSingleCursor() {
        if (!this.hasSingleSelection()) {
            return false;
        }
        const selection = this.selections[0];
        return (selection.anchor.line === selection.head.line &&
            selection.anchor.ch === selection.head.ch);
    }
    hasSingleSelection() {
        return this.selections.length === 1;
    }
    getSelection() {
        const selection = this.selections[this.selections.length - 1];
        const from = selection.anchor.ch > selection.head.ch
            ? selection.head.ch
            : selection.anchor.ch;
        const to = selection.anchor.ch > selection.head.ch
            ? selection.anchor.ch
            : selection.head.ch;
        return Object.assign(Object.assign({}, selection), { from,
            to });
    }
    getCursor() {
        return Object.assign({}, this.selections[this.selections.length - 1].head);
    }
    replaceCursor(cursor) {
        this.selections = [{ anchor: cursor, head: cursor }];
    }
    replaceSelections(selections) {
        if (selections.length < 1) {
            throw new Error(`Unable to create Root without selections`);
        }
        this.selections = selections;
    }
    getListUnderCursor() {
        return this.getListUnderLine(this.getCursor().line);
    }
    getListUnderLine(line) {
        if (line < this.start.line || line > this.end.line) {
            return;
        }
        let result = null;
        let index = this.start.line;
        const visitArr = (ll) => {
            for (const l of ll) {
                const listFromLine = index;
                const listTillLine = listFromLine + l.getLineCount() - 1;
                if (line >= listFromLine && line <= listTillLine) {
                    result = l;
                }
                else {
                    index = listTillLine + 1;
                    visitArr(l.getChildren());
                }
                if (result !== null) {
                    return;
                }
            }
        };
        visitArr(this.rootList.getChildren());
        return result;
    }
    getContentLinesRangeOf(list) {
        let result = null;
        let line = this.start.line;
        const visitArr = (ll) => {
            for (const l of ll) {
                const listFromLine = line;
                const listTillLine = listFromLine + l.getLineCount() - 1;
                if (l === list) {
                    result = [listFromLine, listTillLine];
                }
                else {
                    line = listTillLine + 1;
                    visitArr(l.getChildren());
                }
                if (result !== null) {
                    return;
                }
            }
        };
        visitArr(this.rootList.getChildren());
        return result;
    }
    getChildren() {
        return this.rootList.getChildren();
    }
    print() {
        let res = "";
        for (const child of this.rootList.getChildren()) {
            res += child.print();
        }
        return res.replace(/\n$/, "");
    }
    clone() {
        const clone = new Root(Object.assign({}, this.start), Object.assign({}, this.end), this.getSelections());
        clone.rootList = this.rootList.clone(clone);
        return clone;
    }
}

class DeleteTillPreviousLineContentEnd {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const cursor = root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => cursor.ch === l.from.ch && cursor.line === l.from.line);
        if (lineNo === 0) {
            this.mergeWithPreviousItem(root, cursor, list);
        }
        else if (lineNo > 0) {
            this.mergeNotes(root, cursor, list, lines, lineNo);
        }
    }
    mergeNotes(root, cursor, list, lines, lineNo) {
        this.stopPropagation = true;
        this.updated = true;
        const prevLineNo = lineNo - 1;
        root.replaceCursor({
            line: cursor.line - 1,
            ch: lines[prevLineNo].text.length + lines[prevLineNo].from.ch,
        });
        lines[prevLineNo].text += lines[lineNo].text;
        lines.splice(lineNo, 1);
        list.replaceLines(lines.map((l) => l.text));
    }
    mergeWithPreviousItem(root, cursor, list) {
        if (root.getChildren()[0] === list && list.isEmpty()) {
            return;
        }
        this.stopPropagation = true;
        const prev = root.getListUnderLine(cursor.line - 1);
        if (!prev) {
            return;
        }
        const bothAreEmpty = prev.isEmpty() && list.isEmpty();
        const prevIsEmptyAndSameLevel = prev.isEmpty() && !list.isEmpty() && prev.getLevel() === list.getLevel();
        const listIsEmptyAndPrevIsParent = list.isEmpty() && prev.getLevel() === list.getLevel() - 1;
        if (bothAreEmpty || prevIsEmptyAndSameLevel || listIsEmptyAndPrevIsParent) {
            this.updated = true;
            const parent = list.getParent();
            const prevEnd = prev.getLastLineContentEnd();
            if (!prev.getNotesIndent() && list.getNotesIndent()) {
                prev.setNotesIndent(prev.getFirstLineIndent() +
                    list.getNotesIndent().slice(list.getFirstLineIndent().length));
            }
            const oldLines = prev.getLines();
            const newLines = list.getLines();
            oldLines[oldLines.length - 1] += newLines[0];
            const resultLines = oldLines.concat(newLines.slice(1));
            prev.replaceLines(resultLines);
            parent.removeChild(list);
            for (const c of list.getChildren()) {
                list.removeChild(c);
                prev.addAfterAll(c);
            }
            root.replaceCursor(prevEnd);
            recalculateNumericBullets(root);
        }
    }
}

class BackspaceBehaviourOverride {
    constructor(plugin, settings, imeDetector, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return (this.settings.keepCursorWithinContent !== "never" &&
                !this.imeDetector.isOpened());
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new DeleteTillPreviousLineContentEnd(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "Backspace",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

const BETTER_LISTS_BODY_CLASS = "outliner-plugin-better-lists";
class BetterListsStyles {
    constructor(settings, obsidianSettings) {
        this.settings = settings;
        this.obsidianSettings = obsidianSettings;
        this.updateBodyClass = () => {
            const shouldExists = this.obsidianSettings.isDefaultThemeEnabled() &&
                this.settings.betterListsStyles;
            const exists = document.body.classList.contains(BETTER_LISTS_BODY_CLASS);
            if (shouldExists && !exists) {
                document.body.classList.add(BETTER_LISTS_BODY_CLASS);
            }
            if (!shouldExists && exists) {
                document.body.classList.remove(BETTER_LISTS_BODY_CLASS);
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateBodyClass();
            this.updateBodyClassInterval = window.setInterval(() => {
                this.updateBodyClass();
            }, 1000);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            clearInterval(this.updateBodyClassInterval);
            document.body.classList.remove(BETTER_LISTS_BODY_CLASS);
        });
    }
}

class SelectAllContent {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleSelection()) {
            return;
        }
        const selection = root.getSelections()[0];
        const [rootStart, rootEnd] = root.getContentRange();
        const selectionFrom = minPos(selection.anchor, selection.head);
        const selectionTo = maxPos(selection.anchor, selection.head);
        if (selectionFrom.line < rootStart.line ||
            selectionTo.line > rootEnd.line) {
            return false;
        }
        if (selectionFrom.line === rootStart.line &&
            selectionFrom.ch === rootStart.ch &&
            selectionTo.line === rootEnd.line &&
            selectionTo.ch === rootEnd.ch) {
            return false;
        }
        const list = root.getListUnderCursor();
        const contentStart = list.getFirstLineContentStartAfterCheckbox();
        const contentEnd = list.getLastLineContentEnd();
        const listUnderSelectionFrom = root.getListUnderLine(selectionFrom.line);
        const listStart = listUnderSelectionFrom.getFirstLineContentStartAfterCheckbox();
        const listEnd = listUnderSelectionFrom.getContentEndIncludingChildren();
        this.stopPropagation = true;
        this.updated = true;
        if (selectionFrom.line === contentStart.line &&
            selectionFrom.ch === contentStart.ch &&
            selectionTo.line === contentEnd.line &&
            selectionTo.ch === contentEnd.ch) {
            if (list.getChildren().length) {
                // select sub lists
                root.replaceSelections([
                    { anchor: contentStart, head: list.getContentEndIncludingChildren() },
                ]);
            }
            else {
                // select whole list
                root.replaceSelections([{ anchor: rootStart, head: rootEnd }]);
            }
        }
        else if (listStart.ch == selectionFrom.ch &&
            listEnd.line == selectionTo.line &&
            listEnd.ch == selectionTo.ch) {
            // select whole list
            root.replaceSelections([{ anchor: rootStart, head: rootEnd }]);
        }
        else if ((selectionFrom.line > contentStart.line ||
            (selectionFrom.line == contentStart.line &&
                selectionFrom.ch >= contentStart.ch)) &&
            (selectionTo.line < contentEnd.line ||
                (selectionTo.line == contentEnd.line &&
                    selectionTo.ch <= contentEnd.ch))) {
            // select whole line
            root.replaceSelections([{ anchor: contentStart, head: contentEnd }]);
        }
        else {
            this.stopPropagation = false;
            this.updated = false;
            return false;
        }
        return true;
    }
}

class CtrlAAndCmdABehaviourOverride {
    constructor(plugin, settings, imeDetector, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return (this.settings.overrideSelectAllBehaviour && !this.imeDetector.isOpened());
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new SelectAllContent(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "c-a",
                    mac: "m-a",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class DeleteTillNextLineContentStart {
    constructor(root) {
        this.root = root;
        this.deleteTillPreviousLineContentEnd =
            new DeleteTillPreviousLineContentEnd(root);
    }
    shouldStopPropagation() {
        return this.deleteTillPreviousLineContentEnd.shouldStopPropagation();
    }
    shouldUpdate() {
        return this.deleteTillPreviousLineContentEnd.shouldUpdate();
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const cursor = root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => cursor.ch === l.to.ch && cursor.line === l.to.line);
        if (lineNo === lines.length - 1) {
            const nextLine = lines[lineNo].to.line + 1;
            const nextList = root.getListUnderLine(nextLine);
            if (!nextList) {
                return;
            }
            root.replaceCursor(nextList.getFirstLineContentStart());
            this.deleteTillPreviousLineContentEnd.perform();
        }
        else if (lineNo >= 0) {
            root.replaceCursor(lines[lineNo + 1].from);
            this.deleteTillPreviousLineContentEnd.perform();
        }
    }
}

class DeleteBehaviourOverride {
    constructor(plugin, settings, imeDetector, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return (this.settings.keepCursorWithinContent !== "never" &&
                !this.imeDetector.isOpened());
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new DeleteTillNextLineContentStart(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "Delete",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class MoveListToDifferentPosition {
    constructor(root, listToMove, placeToMove, whereToMove, defaultIndentChars) {
        this.root = root;
        this.listToMove = listToMove;
        this.placeToMove = placeToMove;
        this.whereToMove = whereToMove;
        this.defaultIndentChars = defaultIndentChars;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        if (this.listToMove === this.placeToMove) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const cursorAnchor = this.calculateCursorAnchor();
        this.moveList();
        this.changeIndent();
        this.restoreCursor(cursorAnchor);
        recalculateNumericBullets(this.root);
    }
    calculateCursorAnchor() {
        const cursorLine = this.root.getCursor().line;
        const lines = [
            this.listToMove.getFirstLineContentStart().line,
            this.listToMove.getLastLineContentEnd().line,
            this.placeToMove.getFirstLineContentStart().line,
            this.placeToMove.getLastLineContentEnd().line,
        ];
        const listStartLine = Math.min(...lines);
        const listEndLine = Math.max(...lines);
        if (cursorLine < listStartLine || cursorLine > listEndLine) {
            return null;
        }
        const cursor = this.root.getCursor();
        const cursorList = this.root.getListUnderLine(cursor.line);
        const cursorListStart = cursorList.getFirstLineContentStart();
        const lineDiff = cursor.line - cursorListStart.line;
        const chDiff = cursor.ch - cursorListStart.ch;
        return { cursorList, lineDiff, chDiff };
    }
    moveList() {
        this.listToMove.getParent().removeChild(this.listToMove);
        switch (this.whereToMove) {
            case "before":
                this.placeToMove
                    .getParent()
                    .addBefore(this.placeToMove, this.listToMove);
                break;
            case "after":
                this.placeToMove
                    .getParent()
                    .addAfter(this.placeToMove, this.listToMove);
                break;
            case "inside":
                this.placeToMove.addBeforeAll(this.listToMove);
                break;
        }
    }
    changeIndent() {
        const oldIndent = this.listToMove.getFirstLineIndent();
        const newIndent = this.whereToMove === "inside"
            ? this.placeToMove.getFirstLineIndent() + this.defaultIndentChars
            : this.placeToMove.getFirstLineIndent();
        this.listToMove.unindentContent(0, oldIndent.length);
        this.listToMove.indentContent(0, newIndent);
    }
    restoreCursor(cursorAnchor) {
        if (cursorAnchor) {
            const cursorListStart = cursorAnchor.cursorList.getFirstLineContentStart();
            this.root.replaceCursor({
                line: cursorListStart.line + cursorAnchor.lineDiff,
                ch: cursorListStart.ch + cursorAnchor.chDiff,
            });
        }
        else {
            // When you move a list, the screen scrolls to the cursor.
            // It is better to move the cursor into the viewport than let the screen scroll.
            this.root.replaceCursor(this.listToMove.getLastLineContentEnd());
        }
    }
}

const BODY_CLASS = "outliner-plugin-dnd";
class DragAndDrop {
    constructor(plugin, settings, obisidian, parser, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.obisidian = obisidian;
        this.parser = parser;
        this.operationPerformer = operationPerformer;
        this.preStart = null;
        this.state = null;
        this.handleSettingsChange = () => {
            if (!isFeatureSupported()) {
                return;
            }
            if (this.settings.dragAndDrop) {
                document.body.classList.add(BODY_CLASS);
            }
            else {
                document.body.classList.remove(BODY_CLASS);
            }
        };
        this.handleMouseDown = (e) => {
            if (!isFeatureSupported() ||
                !this.settings.dragAndDrop ||
                !isClickOnBullet(e)) {
                return;
            }
            const view = getEditorViewFromHTMLElement(e.target);
            if (!view) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.preStart = {
                x: e.x,
                y: e.y,
                view,
            };
        };
        this.handleMouseMove = (e) => {
            if (this.preStart) {
                this.startDragging();
            }
            if (this.state) {
                this.detectAndDrawDropZone(e.x, e.y);
            }
        };
        this.handleMouseUp = () => {
            if (this.preStart) {
                this.preStart = null;
            }
            if (this.state) {
                this.stopDragging();
            }
        };
        this.handleKeyDown = (e) => {
            if (this.state && e.code === "Escape") {
                this.cancelDragging();
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension([
                draggingLinesStateField,
                droppingLinesStateField,
            ]);
            this.enableFeatureToggle();
            this.createDropZone();
            this.addEventListeners();
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.removeEventListeners();
            this.removeDropZone();
            this.disableFeatureToggle();
        });
    }
    enableFeatureToggle() {
        this.settings.onChange(this.handleSettingsChange);
        this.handleSettingsChange();
    }
    disableFeatureToggle() {
        this.settings.removeCallback(this.handleSettingsChange);
        document.body.classList.remove(BODY_CLASS);
    }
    createDropZone() {
        this.dropZonePadding = document.createElement("div");
        this.dropZonePadding.classList.add("outliner-plugin-drop-zone-padding");
        this.dropZone = document.createElement("div");
        this.dropZone.classList.add("outliner-plugin-drop-zone");
        this.dropZone.style.display = "none";
        this.dropZone.appendChild(this.dropZonePadding);
        document.body.appendChild(this.dropZone);
    }
    removeDropZone() {
        document.body.removeChild(this.dropZone);
        this.dropZonePadding = null;
        this.dropZone = null;
    }
    addEventListeners() {
        document.addEventListener("mousedown", this.handleMouseDown, {
            capture: true,
        });
        document.addEventListener("mousemove", this.handleMouseMove);
        document.addEventListener("mouseup", this.handleMouseUp);
        document.addEventListener("keydown", this.handleKeyDown);
    }
    removeEventListeners() {
        document.removeEventListener("mousedown", this.handleMouseDown, {
            capture: true,
        });
        document.removeEventListener("mousemove", this.handleMouseMove);
        document.removeEventListener("mouseup", this.handleMouseUp);
        document.removeEventListener("keydown", this.handleKeyDown);
    }
    startDragging() {
        const { x, y, view } = this.preStart;
        this.preStart = null;
        const editor = getEditorFromState(view.state);
        const pos = editor.offsetToPos(view.posAtCoords({ x, y }));
        const root = this.parser.parse(editor, pos);
        const list = root.getListUnderLine(pos.line);
        const state = new DragAndDropState(view, editor, root, list);
        if (!state.hasDropVariants()) {
            return;
        }
        this.state = state;
        this.highlightDraggingLines();
    }
    detectAndDrawDropZone(x, y) {
        this.state.calculateNearestDropVariant(x, y);
        this.drawDropZone();
    }
    cancelDragging() {
        this.state.dropVariant = null;
        this.stopDragging();
    }
    stopDragging() {
        this.unhightlightDraggingLines();
        this.hideDropZone();
        this.applyChanges();
        this.state = null;
    }
    applyChanges() {
        if (!this.state.dropVariant) {
            return;
        }
        const { state } = this;
        const { dropVariant, editor, root, list } = state;
        const newRoot = this.parser.parse(editor, root.getContentStart());
        if (!isSameRoots(root, newRoot)) {
            new obsidian.Notice(`The item cannot be moved. The page content changed during the move.`, 5000);
            return;
        }
        this.operationPerformer.eval(root, new MoveListToDifferentPosition(root, list, dropVariant.placeToMove, dropVariant.whereToMove, this.obisidian.getDefaultIndentChars()), editor);
    }
    highlightDraggingLines() {
        const { state } = this;
        const { list, editor, view } = state;
        const lines = [];
        const fromLine = list.getFirstLineContentStart().line;
        const tillLine = list.getContentEndIncludingChildren().line;
        for (let i = fromLine; i <= tillLine; i++) {
            lines.push(editor.posToOffset({ line: i, ch: 0 }));
        }
        view.dispatch({
            effects: [dndStarted.of(lines)],
        });
        document.body.classList.add("outliner-plugin-dragging");
    }
    unhightlightDraggingLines() {
        document.body.classList.remove("outliner-plugin-dragging");
        this.state.view.dispatch({
            effects: [dndEnded.of()],
        });
    }
    drawDropZone() {
        const { state } = this;
        const { view, editor, dropVariant } = state;
        const newParent = dropVariant.whereToMove === "inside"
            ? dropVariant.placeToMove
            : dropVariant.placeToMove.getParent();
        const newParentIsRootList = !newParent.getParent();
        {
            const width = Math.round(view.contentDOM.offsetWidth -
                (dropVariant.left - this.state.leftPadding));
            this.dropZone.style.display = "block";
            this.dropZone.style.top = dropVariant.top + "px";
            this.dropZone.style.left = dropVariant.left + "px";
            this.dropZone.style.width = width + "px";
        }
        {
            const level = newParent.getLevel();
            const indentWidth = this.state.tabWidth;
            const width = indentWidth * level;
            const dashPadding = 3;
            const dashWidth = indentWidth - dashPadding;
            const color = getComputedStyle(document.body).getPropertyValue("--color-accent");
            this.dropZonePadding.style.width = `${width}px`;
            this.dropZonePadding.style.marginLeft = `-${width}px`;
            this.dropZonePadding.style.backgroundImage = `url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20${width}%204%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cline%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%22${width}%22%20y2%3D%220%22%20stroke%3D%22${color}%22%20stroke-width%3D%228%22%20stroke-dasharray%3D%22${dashWidth}%20${dashPadding}%22%2F%3E%3C%2Fsvg%3E')`;
        }
        this.state.view.dispatch({
            effects: [
                dndMoved.of(newParentIsRootList
                    ? null
                    : editor.posToOffset({
                        line: newParent.getFirstLineContentStart().line,
                        ch: 0,
                    })),
            ],
        });
    }
    hideDropZone() {
        this.dropZone.style.display = "none";
    }
}
class DragAndDropState {
    constructor(view, editor, root, list) {
        this.view = view;
        this.editor = editor;
        this.root = root;
        this.list = list;
        this.dropVariants = new Map();
        this.dropVariant = null;
        this.leftPadding = 0;
        this.tabWidth = 0;
        this.collectDropVariants();
        this.calculateLeftPadding();
        this.calculateTabWidth();
    }
    getDropVariants() {
        return Array.from(this.dropVariants.values());
    }
    hasDropVariants() {
        return this.dropVariants.size > 0;
    }
    calculateNearestDropVariant(x, y) {
        const { view, editor } = this;
        const dropVariants = this.getDropVariants();
        for (const v of dropVariants) {
            const { placeToMove } = v;
            v.left = this.leftPadding + (v.level - 1) * this.tabWidth;
            const positionAfterList = v.whereToMove === "after" || v.whereToMove === "inside";
            const line = positionAfterList
                ? placeToMove.getContentEndIncludingChildren().line
                : placeToMove.getFirstLineContentStart().line;
            const linePos = editor.posToOffset({
                line,
                ch: 0,
            });
            v.top = view.coordsAtPos(linePos, -1).top;
            if (positionAfterList) {
                v.top += view.lineBlockAt(linePos).height;
            }
            // Better vertical alignment
            v.top -= 8;
        }
        const nearestLineTop = dropVariants
            .sort((a, b) => Math.abs(y - a.top) - Math.abs(y - b.top))
            .first().top;
        const variansOnNearestLine = dropVariants.filter((v) => Math.abs(v.top - nearestLineTop) <= 4);
        this.dropVariant = variansOnNearestLine
            .sort((a, b) => Math.abs(x - a.left) - Math.abs(x - b.left))
            .first();
    }
    addDropVariant(v) {
        this.dropVariants.set(`${v.line} ${v.level}`, v);
    }
    collectDropVariants() {
        const visit = (lists) => {
            for (const placeToMove of lists) {
                const lineBefore = placeToMove.getFirstLineContentStart().line;
                const lineAfter = placeToMove.getContentEndIncludingChildren().line + 1;
                const level = placeToMove.getLevel();
                this.addDropVariant({
                    line: lineBefore,
                    level,
                    left: 0,
                    top: 0,
                    placeToMove,
                    whereToMove: "before",
                });
                this.addDropVariant({
                    line: lineAfter,
                    level,
                    left: 0,
                    top: 0,
                    placeToMove,
                    whereToMove: "after",
                });
                if (placeToMove === this.list) {
                    continue;
                }
                if (placeToMove.isEmpty()) {
                    this.addDropVariant({
                        line: lineAfter,
                        level: level + 1,
                        left: 0,
                        top: 0,
                        placeToMove,
                        whereToMove: "inside",
                    });
                }
                else {
                    visit(placeToMove.getChildren());
                }
            }
        };
        visit(this.root.getChildren());
    }
    calculateLeftPadding() {
        this.leftPadding = this.view.coordsAtPos(0, -1).left;
    }
    calculateTabWidth() {
        const { view } = this;
        const singleIndent = language.indentString(view.state, language.getIndentUnit(view.state));
        for (let i = 1; i <= view.state.doc.lines; i++) {
            const line = view.state.doc.line(i);
            if (line.text.startsWith(singleIndent)) {
                const a = view.coordsAtPos(line.from, -1);
                const b = view.coordsAtPos(line.from + singleIndent.length, -1);
                this.tabWidth = b.left - a.left;
                return;
            }
        }
        this.tabWidth = view.defaultCharacterWidth * language.getIndentUnit(view.state);
    }
}
const dndStarted = state.StateEffect.define({
    map: (lines, change) => lines.map((l) => change.mapPos(l)),
});
const dndMoved = state.StateEffect.define({
    map: (line, change) => (line !== null ? change.mapPos(line) : line),
});
const dndEnded = state.StateEffect.define();
const draggingLineDecoration = view.Decoration.line({
    class: "outliner-plugin-dragging-line",
});
const droppingLineDecoration = view.Decoration.line({
    class: "outliner-plugin-dropping-line",
});
const draggingLinesStateField = state.StateField.define({
    create: () => view.Decoration.none,
    update: (dndState, tr) => {
        dndState = dndState.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(dndStarted)) {
                dndState = dndState.update({
                    add: e.value.map((l) => draggingLineDecoration.range(l, l)),
                });
            }
            if (e.is(dndEnded)) {
                dndState = view.Decoration.none;
            }
        }
        return dndState;
    },
    provide: (f) => view.EditorView.decorations.from(f),
});
const droppingLinesStateField = state.StateField.define({
    create: () => view.Decoration.none,
    update: (dndDroppingState, tr) => {
        dndDroppingState = dndDroppingState.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(dndMoved)) {
                dndDroppingState =
                    e.value === null
                        ? view.Decoration.none
                        : view.Decoration.set(droppingLineDecoration.range(e.value, e.value));
            }
            if (e.is(dndEnded)) {
                dndDroppingState = view.Decoration.none;
            }
        }
        return dndDroppingState;
    },
    provide: (f) => view.EditorView.decorations.from(f),
});
function getEditorViewFromHTMLElement(e) {
    while (e && !e.classList.contains("cm-editor")) {
        e = e.parentElement;
    }
    if (!e) {
        return null;
    }
    return view.EditorView.findFromDOM(e);
}
function isClickOnBullet(e) {
    let el = e.target;
    while (el) {
        if (el.classList.contains("cm-formatting-list") ||
            el.classList.contains("cm-fold-indicator") ||
            el.classList.contains("task-list-item-checkbox")) {
            return true;
        }
        el = el.parentElement;
    }
    return false;
}
function isSameRoots(a, b) {
    const [aStart, aEnd] = a.getContentRange();
    const [bStart, bEnd] = b.getContentRange();
    if (cmpPos(aStart, bStart) !== 0 || cmpPos(aEnd, bEnd) !== 0) {
        return false;
    }
    return a.print() === b.print();
}
function isFeatureSupported() {
    return obsidian.Platform.isDesktop;
}

class KeepCursorOutsideFoldedLines {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        if (!list.isFolded()) {
            return;
        }
        const foldRoot = list.getTopFoldRoot();
        const firstLineEnd = foldRoot.getLinesInfo()[0].to;
        if (cursor.line > firstLineEnd.line) {
            this.updated = true;
            this.stopPropagation = true;
            root.replaceCursor(firstLineEnd);
        }
    }
}

class KeepCursorWithinListContent {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const contentStart = list.getFirstLineContentStartAfterCheckbox();
        const linePrefix = contentStart.line === cursor.line
            ? contentStart.ch
            : list.getNotesIndent().length;
        if (cursor.ch < linePrefix) {
            this.updated = true;
            this.stopPropagation = true;
            root.replaceCursor({
                line: cursor.line,
                ch: linePrefix,
            });
        }
    }
}

class EditorSelectionsBehaviourOverride {
    constructor(plugin, settings, parser, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.parser = parser;
        this.operationPerformer = operationPerformer;
        this.transactionExtender = (tr) => {
            if (this.settings.keepCursorWithinContent === "never" || !tr.selection) {
                return null;
            }
            const editor = getEditorFromState(tr.startState);
            setTimeout(() => {
                this.handleSelectionsChanges(editor);
            }, 0);
            return null;
        };
        this.handleSelectionsChanges = (editor) => {
            const root = this.parser.parse(editor);
            if (!root) {
                return;
            }
            {
                const { shouldStopPropagation } = this.operationPerformer.eval(root, new KeepCursorOutsideFoldedLines(root), editor);
                if (shouldStopPropagation) {
                    return;
                }
            }
            this.operationPerformer.eval(root, new KeepCursorWithinListContent(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.EditorState.transactionExtender.of(this.transactionExtender));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

const checkboxRe = `\\[[^\\[\\]]\\][ \t]`;

function isEmptyLineOrEmptyCheckbox(line) {
    return line === "" || line === "[ ] ";
}

class CreateNewItem {
    constructor(root, defaultIndentChars, getZoomRange) {
        this.root = root;
        this.defaultIndentChars = defaultIndentChars;
        this.getZoomRange = getZoomRange;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleSelection()) {
            return;
        }
        const selection = root.getSelection();
        if (!selection || selection.anchor.line !== selection.head.line) {
            return;
        }
        const list = root.getListUnderCursor();
        const lines = list.getLinesInfo();
        if (lines.length === 1 && isEmptyLineOrEmptyCheckbox(lines[0].text)) {
            return;
        }
        const cursor = root.getCursor();
        const lineUnderCursor = lines.find((l) => l.from.line === cursor.line);
        if (cursor.ch < lineUnderCursor.from.ch) {
            return;
        }
        const { oldLines, newLines } = lines.reduce((acc, line) => {
            if (cursor.line > line.from.line) {
                acc.oldLines.push(line.text);
            }
            else if (cursor.line === line.from.line) {
                const left = line.text.slice(0, selection.from - line.from.ch);
                const right = line.text.slice(selection.to - line.from.ch);
                acc.oldLines.push(left);
                acc.newLines.push(right);
            }
            else if (cursor.line < line.from.line) {
                acc.newLines.push(line.text);
            }
            return acc;
        }, {
            oldLines: [],
            newLines: [],
        });
        const codeBlockBacticks = oldLines.join("\n").split("```").length - 1;
        const isInsideCodeblock = codeBlockBacticks > 0 && codeBlockBacticks % 2 !== 0;
        if (isInsideCodeblock) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const zoomRange = this.getZoomRange.getZoomRange();
        const listIsZoomingRoot = Boolean(zoomRange &&
            list.getFirstLineContentStart().line >= zoomRange.from.line &&
            list.getLastLineContentEnd().line <= zoomRange.from.line);
        const hasChildren = !list.isEmpty();
        const childIsFolded = list.isFoldRoot();
        const endPos = list.getLastLineContentEnd();
        const endOfLine = cursor.line === endPos.line && cursor.ch === endPos.ch;
        const onChildLevel = listIsZoomingRoot || (hasChildren && !childIsFolded && endOfLine);
        const indent = onChildLevel
            ? hasChildren
                ? list.getChildren()[0].getFirstLineIndent()
                : list.getFirstLineIndent() + this.defaultIndentChars
            : list.getFirstLineIndent();
        const bullet = onChildLevel && hasChildren
            ? list.getChildren()[0].getBullet()
            : list.getBullet();
        const spaceAfterBullet = onChildLevel && hasChildren
            ? list.getChildren()[0].getSpaceAfterBullet()
            : list.getSpaceAfterBullet();
        const prefix = oldLines[0].match(checkboxRe) ? "[ ] " : "";
        const newList = new List(list.getRoot(), indent, bullet, prefix, spaceAfterBullet, prefix + newLines.shift(), false);
        if (newLines.length > 0) {
            newList.setNotesIndent(list.getNotesIndent());
            for (const line of newLines) {
                newList.addLine(line);
            }
        }
        if (onChildLevel) {
            list.addBeforeAll(newList);
        }
        else {
            if (!childIsFolded || !endOfLine) {
                const children = list.getChildren();
                for (const child of children) {
                    list.removeChild(child);
                    newList.addAfterAll(child);
                }
            }
            list.getParent().addAfter(list, newList);
        }
        list.replaceLines(oldLines);
        const newListStart = newList.getFirstLineContentStart();
        root.replaceCursor({
            line: newListStart.line,
            ch: newListStart.ch + prefix.length,
        });
        recalculateNumericBullets(root);
    }
}

class OutdentList {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        if (!grandParent) {
            return;
        }
        this.updated = true;
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        const indentRmFrom = parent.getFirstLineIndent().length;
        const indentRmTill = list.getFirstLineIndent().length;
        parent.removeChild(list);
        grandParent.addAfter(parent, list);
        list.unindentContent(indentRmFrom, indentRmTill);
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const chDiff = indentRmTill - indentRmFrom;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch - chDiff,
        });
        recalculateNumericBullets(root);
    }
}

class OutdentListIfItsEmpty {
    constructor(root) {
        this.root = root;
        this.outdentList = new OutdentList(root);
    }
    shouldStopPropagation() {
        return this.outdentList.shouldStopPropagation();
    }
    shouldUpdate() {
        return this.outdentList.shouldUpdate();
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const lines = list.getLines();
        if (lines.length > 1 ||
            !isEmptyLineOrEmptyCheckbox(lines[0]) ||
            list.getLevel() === 1) {
            return;
        }
        this.outdentList.perform();
    }
}

class EnterBehaviourOverride {
    constructor(plugin, settings, imeDetector, obsidianSettings, parser, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.obsidianSettings = obsidianSettings;
        this.parser = parser;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return this.settings.overrideEnterBehaviour && !this.imeDetector.isOpened();
        };
        this.run = (editor) => {
            const root = this.parser.parse(editor);
            if (!root) {
                return {
                    shouldUpdate: false,
                    shouldStopPropagation: false,
                };
            }
            {
                const res = this.operationPerformer.eval(root, new OutdentListIfItsEmpty(root), editor);
                if (res.shouldStopPropagation) {
                    return res;
                }
            }
            {
                const defaultIndentChars = this.obsidianSettings.getDefaultIndentChars();
                const zoomRange = editor.getZoomRange();
                const getZoomRange = {
                    getZoomRange: () => zoomRange,
                };
                const res = this.operationPerformer.eval(root, new CreateNewItem(root, defaultIndentChars, getZoomRange), editor);
                if (res.shouldUpdate && zoomRange) {
                    editor.tryRefreshZoom(zoomRange.from.line);
                }
                return res;
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "Enter",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function createEditorCallback(cb) {
    return (editor) => {
        const myEditor = new MyEditor(editor);
        const shouldStopPropagation = cb(myEditor);
        if (!shouldStopPropagation &&
            window.event &&
            window.event.type === "keydown") {
            myEditor.triggerOnKeyDown(window.event);
        }
    };
}

class ListsFoldingCommands {
    constructor(plugin, obsidianSettings) {
        this.plugin = plugin;
        this.obsidianSettings = obsidianSettings;
        this.fold = (editor) => {
            return this.setFold(editor, "fold");
        };
        this.unfold = (editor) => {
            return this.setFold(editor, "unfold");
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addCommand({
                id: "fold",
                icon: "chevrons-down-up",
                name: "Fold the list",
                editorCallback: createEditorCallback(this.fold),
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: "ArrowUp",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "unfold",
                icon: "chevrons-up-down",
                name: "Unfold the list",
                editorCallback: createEditorCallback(this.unfold),
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: "ArrowDown",
                    },
                ],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    setFold(editor, type) {
        if (!this.obsidianSettings.getFoldSettings().foldIndent) {
            new obsidian.Notice(`Unable to ${type} because folding is disabled. Please enable "Fold indent" in Obsidian settings.`, 5000);
            return true;
        }
        const cursor = editor.getCursor();
        if (type === "fold") {
            editor.fold(cursor.line);
        }
        else {
            editor.unfold(cursor.line);
        }
        return true;
    }
}

class IndentList {
    constructor(root, defaultIndentChars) {
        this.root = root;
        this.defaultIndentChars = defaultIndentChars;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const prev = parent.getPrevSiblingOf(list);
        if (!prev) {
            return;
        }
        this.updated = true;
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        const indentPos = list.getFirstLineIndent().length;
        let indentChars = "";
        if (indentChars === "" && !prev.isEmpty()) {
            indentChars = prev
                .getChildren()[0]
                .getFirstLineIndent()
                .slice(prev.getFirstLineIndent().length);
        }
        if (indentChars === "") {
            indentChars = list
                .getFirstLineIndent()
                .slice(parent.getFirstLineIndent().length);
        }
        if (indentChars === "" && !list.isEmpty()) {
            indentChars = list.getChildren()[0].getFirstLineIndent();
        }
        if (indentChars === "") {
            indentChars = this.defaultIndentChars;
        }
        parent.removeChild(list);
        prev.addAfterAll(list);
        list.indentContent(indentPos, indentChars);
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch + indentChars.length,
        });
        recalculateNumericBullets(root);
    }
}

class MoveListDown {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        const next = parent.getNextSiblingOf(list);
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        if (!next && grandParent) {
            const newParent = grandParent.getNextSiblingOf(parent);
            if (newParent) {
                this.updated = true;
                parent.removeChild(list);
                newParent.addBeforeAll(list);
            }
        }
        else if (next) {
            this.updated = true;
            parent.removeChild(list);
            parent.addAfter(next, list);
        }
        if (!this.updated) {
            return;
        }
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch,
        });
        recalculateNumericBullets(root);
    }
}

class MoveListUp {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        const prev = parent.getPrevSiblingOf(list);
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        if (!prev && grandParent) {
            const newParent = grandParent.getPrevSiblingOf(parent);
            if (newParent) {
                this.updated = true;
                parent.removeChild(list);
                newParent.addAfterAll(list);
            }
        }
        else if (prev) {
            this.updated = true;
            parent.removeChild(list);
            parent.addBefore(prev, list);
        }
        if (!this.updated) {
            return;
        }
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch,
        });
        recalculateNumericBullets(root);
    }
}

class ListsMovementCommands {
    constructor(plugin, obsidianSettings, operationPerformer) {
        this.plugin = plugin;
        this.obsidianSettings = obsidianSettings;
        this.operationPerformer = operationPerformer;
        this.moveListDown = (editor) => {
            const { shouldStopPropagation } = this.operationPerformer.perform((root) => new MoveListDown(root), editor);
            return shouldStopPropagation;
        };
        this.moveListUp = (editor) => {
            const { shouldStopPropagation } = this.operationPerformer.perform((root) => new MoveListUp(root), editor);
            return shouldStopPropagation;
        };
        this.indentList = (editor) => {
            const { shouldStopPropagation } = this.operationPerformer.perform((root) => new IndentList(root, this.obsidianSettings.getDefaultIndentChars()), editor);
            return shouldStopPropagation;
        };
        this.outdentList = (editor) => {
            const { shouldStopPropagation } = this.operationPerformer.perform((root) => new OutdentList(root), editor);
            return shouldStopPropagation;
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addCommand({
                id: "move-list-item-up",
                icon: "arrow-up",
                name: "Move list and sublists up",
                editorCallback: createEditorCallback(this.moveListUp),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: "ArrowUp",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "move-list-item-down",
                icon: "arrow-down",
                name: "Move list and sublists down",
                editorCallback: createEditorCallback(this.moveListDown),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: "ArrowDown",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "indent-list",
                icon: "indent",
                name: "Indent the list and sublists",
                editorCallback: createEditorCallback(this.indentList),
                hotkeys: [],
            });
            this.plugin.addCommand({
                id: "outdent-list",
                icon: "outdent",
                name: "Outdent the list and sublists",
                editorCallback: createEditorCallback(this.outdentList),
                hotkeys: [],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class DeleteTillCurrentLineContentStart {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => l.from.line === cursor.line);
        lines[lineNo].text = lines[lineNo].text.slice(cursor.ch - lines[lineNo].from.ch);
        list.replaceLines(lines.map((l) => l.text));
        root.replaceCursor(lines[lineNo].from);
    }
}

class MetaBackspaceBehaviourOverride {
    constructor(plugin, settings, imeDetector, operationPerformer) {
        this.plugin = plugin;
        this.settings = settings;
        this.imeDetector = imeDetector;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return (this.settings.keepCursorWithinContent !== "never" &&
                !this.imeDetector.isOpened());
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new DeleteTillCurrentLineContentStart(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    mac: "m-Backspace",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ObsidianOutlinerPluginSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin, settings) {
        super(app, plugin);
        this.settings = settings;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName("Stick the cursor to the content")
            .setDesc("Don't let the cursor move to the bullet position.")
            .addDropdown((dropdown) => {
            dropdown
                .addOptions({
                never: "Never",
                "bullet-only": "Stick cursor out of bullets",
                "bullet-and-checkbox": "Stick cursor out of bullets and checkboxes",
            })
                .setValue(this.settings.keepCursorWithinContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.keepCursorWithinContent = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Tab key")
            .setDesc("Make Tab and Shift-Tab behave the same as other outliners.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.settings.overrideTabBehaviour)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.overrideTabBehaviour = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Enter key")
            .setDesc("Make the Enter key behave the same as other outliners.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.settings.overrideEnterBehaviour)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.overrideEnterBehaviour = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Ctrl+A or Cmd+A behavior")
            .setDesc("Press the hotkey once to select the current list item. Press the hotkey twice to select the entire list.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.settings.overrideSelectAllBehaviour)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.overrideSelectAllBehaviour = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Improve the style of your lists")
            .setDesc("Styles are only compatible with built-in Obsidian themes and may not be compatible with other themes.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.settings.betterListsStyles)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.betterListsStyles = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Draw vertical indentation lines")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.verticalLines).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.verticalLines = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Vertical indentation line click action")
            .addDropdown((dropdown) => {
            dropdown
                .addOptions({
                none: "None",
                "zoom-in": "Zoom In",
                "toggle-folding": "Toggle Folding",
            })
                .setValue(this.settings.verticalLinesAction)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.verticalLinesAction = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl).setName("Drag-and-Drop").addToggle((toggle) => {
            toggle.setValue(this.settings.dragAndDrop).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.dragAndDrop = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Debug mode")
            .setDesc("Open DevTools (Command+Option+I or Control+Shift+I) to copy the debug logs.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.debug).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.debug = value;
                yield this.settings.save();
            }));
        });
    }
}
class SettingsTab {
    constructor(plugin, settings) {
        this.plugin = plugin;
        this.settings = settings;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addSettingTab(new ObsidianOutlinerPluginSettingTab(this.plugin.app, this.plugin, this.settings));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ShiftTabBehaviourOverride {
    constructor(plugin, imeDetector, settings, operationPerformer) {
        this.plugin = plugin;
        this.imeDetector = imeDetector;
        this.settings = settings;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return this.settings.overrideTabBehaviour && !this.imeDetector.isOpened();
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new OutdentList(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "s-Tab",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class SystemInfoModal extends obsidian.Modal {
    constructor(app, settings) {
        super(app);
        this.settings = settings;
    }
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            this.titleEl.setText("System Information");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const app = this.app;
            const data = {
                process: {
                    arch: process.arch,
                    platform: process.platform,
                },
                app: {
                    internalPlugins: {
                        config: app.internalPlugins.config,
                    },
                    isMobile: app.isMobile,
                    plugins: {
                        enabledPlugins: Array.from(app.plugins.enabledPlugins),
                        manifests: Object.keys(app.plugins.manifests).reduce((acc, key) => {
                            acc[key] = {
                                version: app.plugins.manifests[key].version,
                            };
                            return acc;
                        }, {}),
                    },
                    vault: {
                        config: app.vault.config,
                    },
                },
                plugin: {
                    settings: { values: this.settings.getValues() },
                },
            };
            const text = JSON.stringify(data, null, 2);
            const pre = this.contentEl.createEl("pre");
            pre.setText(text);
            pre.setCssStyles({
                overflow: "scroll",
                maxHeight: "300px",
            });
            const button = this.contentEl.createEl("button");
            button.setText("Copy and Close");
            button.onClickEvent(() => {
                navigator.clipboard.writeText("```json\n" + text + "\n```");
                this.close();
            });
        });
    }
}
class SystemInfo {
    constructor(plugin, settings) {
        this.plugin = plugin;
        this.settings = settings;
        this.callback = () => {
            const modal = new SystemInfoModal(this.plugin.app, this.settings);
            modal.open();
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addCommand({
                id: "system-info",
                name: "Show System Info",
                callback: this.callback,
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift", "Alt"],
                        key: "I",
                    },
                ],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class TabBehaviourOverride {
    constructor(plugin, imeDetector, obsidianSettings, settings, operationPerformer) {
        this.plugin = plugin;
        this.imeDetector = imeDetector;
        this.obsidianSettings = obsidianSettings;
        this.settings = settings;
        this.operationPerformer = operationPerformer;
        this.check = () => {
            return this.settings.overrideTabBehaviour && !this.imeDetector.isOpened();
        };
        this.run = (editor) => {
            return this.operationPerformer.perform((root) => new IndentList(root, this.obsidianSettings.getDefaultIndentChars()), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "Tab",
                    run: createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

const VERTICAL_LINES_BODY_CLASS = "outliner-plugin-vertical-lines";
class VerticalLinesPluginValue {
    constructor(settings, obsidianSettings, parser, view) {
        this.settings = settings;
        this.obsidianSettings = obsidianSettings;
        this.parser = parser;
        this.view = view;
        this.lineElements = [];
        this.waitForEditor = () => {
            const editor = getEditorFromState(this.view.state);
            if (!editor) {
                setTimeout(this.waitForEditor, 0);
                return;
            }
            this.editor = editor;
            this.scheduleRecalculate();
        };
        this.onScroll = (e) => {
            const { scrollLeft, scrollTop } = e.target;
            this.scroller.scrollTo(scrollLeft, scrollTop);
        };
        this.scheduleRecalculate = () => {
            clearTimeout(this.scheduled);
            this.scheduled = setTimeout(this.calculate, 0);
        };
        this.calculate = () => {
            this.lines = [];
            if (this.settings.verticalLines &&
                this.obsidianSettings.isDefaultThemeEnabled() &&
                this.view.viewportLineBlocks.length > 0 &&
                this.view.visibleRanges.length > 0) {
                const fromLine = this.editor.offsetToPos(this.view.viewport.from).line;
                const toLine = this.editor.offsetToPos(this.view.viewport.to).line;
                const lists = this.parser.parseRange(this.editor, fromLine, toLine);
                for (const list of lists) {
                    this.lastLine = list.getContentEnd().line;
                    for (const c of list.getChildren()) {
                        this.recursive(c);
                    }
                }
                this.lines.sort((a, b) => a.top === b.top ? a.left - b.left : a.top - b.top);
            }
            this.updateDom();
        };
        this.onClick = (e) => {
            e.preventDefault();
            const line = this.lines[Number(e.target.dataset.index)];
            switch (this.settings.verticalLinesAction) {
                case "zoom-in":
                    this.zoomIn(line);
                    break;
                case "toggle-folding":
                    this.toggleFolding(line);
                    break;
            }
        };
        this.view.scrollDOM.addEventListener("scroll", this.onScroll);
        this.settings.onChange(this.scheduleRecalculate);
        this.prepareDom();
        this.waitForEditor();
    }
    prepareDom() {
        this.contentContainer = document.createElement("div");
        this.contentContainer.classList.add("outliner-plugin-list-lines-content-container");
        this.scroller = document.createElement("div");
        this.scroller.classList.add("outliner-plugin-list-lines-scroller");
        this.scroller.appendChild(this.contentContainer);
        this.view.dom.appendChild(this.scroller);
    }
    update(update) {
        if (update.docChanged ||
            update.viewportChanged ||
            update.geometryChanged ||
            update.transactions.some((tr) => tr.reconfigured)) {
            this.scheduleRecalculate();
        }
    }
    getNextSibling(list) {
        let listTmp = list;
        let p = listTmp.getParent();
        while (p) {
            const nextSibling = p.getNextSiblingOf(listTmp);
            if (nextSibling) {
                return nextSibling;
            }
            listTmp = p;
            p = listTmp.getParent();
        }
        return null;
    }
    recursive(list, parentCtx = {}) {
        const children = list.getChildren();
        if (children.length === 0) {
            return;
        }
        const fromOffset = this.editor.posToOffset({
            line: list.getFirstLineContentStart().line,
            ch: list.getFirstLineIndent().length,
        });
        const nextSibling = this.getNextSibling(list);
        const tillOffset = this.editor.posToOffset({
            line: nextSibling
                ? nextSibling.getFirstLineContentStart().line - 1
                : this.lastLine,
            ch: 0,
        });
        let visibleFrom = this.view.visibleRanges[0].from;
        let visibleTo = this.view.visibleRanges[this.view.visibleRanges.length - 1].to;
        const zoomRange = this.editor.getZoomRange();
        if (zoomRange) {
            visibleFrom = Math.max(visibleFrom, this.editor.posToOffset(zoomRange.from));
            visibleTo = Math.min(visibleTo, this.editor.posToOffset(zoomRange.to));
        }
        if (fromOffset > visibleTo || tillOffset < visibleFrom) {
            return;
        }
        const coords = this.view.coordsAtPos(fromOffset, 1);
        if (parentCtx.rootLeft === undefined) {
            parentCtx.rootLeft = coords.left;
        }
        const left = Math.floor(coords.right - parentCtx.rootLeft);
        const top = visibleFrom > 0 && fromOffset < visibleFrom
            ? -20
            : this.view.lineBlockAt(fromOffset).top;
        const bottom = tillOffset > visibleTo
            ? this.view.lineBlockAt(visibleTo - 1).bottom
            : this.view.lineBlockAt(tillOffset).bottom;
        const height = bottom - top;
        if (height > 0 && !list.isFolded()) {
            const nextSibling = list.getParent().getNextSiblingOf(list);
            const hasNextSibling = !!nextSibling &&
                this.editor.posToOffset(nextSibling.getFirstLineContentStart()) <=
                    visibleTo;
            this.lines.push({
                top,
                left,
                height: `calc(${height}px ${hasNextSibling ? "- 1.5em" : "- 2em"})`,
                list,
            });
        }
        for (const child of children) {
            if (!child.isEmpty()) {
                this.recursive(child, parentCtx);
            }
        }
    }
    zoomIn(line) {
        const editor = getEditorFromState(this.view.state);
        editor.zoomIn(line.list.getFirstLineContentStart().line);
    }
    toggleFolding(line) {
        const { list } = line;
        if (list.isEmpty()) {
            return;
        }
        let needToUnfold = true;
        const linesToToggle = [];
        for (const c of list.getChildren()) {
            if (c.isEmpty()) {
                continue;
            }
            if (!c.isFolded()) {
                needToUnfold = false;
            }
            linesToToggle.push(c.getFirstLineContentStart().line);
        }
        const editor = getEditorFromState(this.view.state);
        for (const l of linesToToggle) {
            if (needToUnfold) {
                editor.unfold(l);
            }
            else {
                editor.fold(l);
            }
        }
    }
    updateDom() {
        const cmScroll = this.view.scrollDOM;
        const cmContent = this.view.contentDOM;
        const cmContentContainer = cmContent.parentElement;
        const cmSizer = cmContentContainer.parentElement;
        /**
         * Obsidian can add additional elements into Content Manager.
         * The most obvious case is the 'embedded-backlinks' core plugin that adds a menu inside a Content Manager.
         * We must take heights of all of these elements into account
         * to be able to calculate the correct size of lines' container.
         */
        let cmSizerChildrenSumHeight = 0;
        for (let i = 0; i < cmSizer.children.length; i++) {
            cmSizerChildrenSumHeight += cmSizer.children[i].clientHeight;
        }
        this.scroller.style.top = cmScroll.offsetTop + "px";
        this.contentContainer.style.height = cmSizerChildrenSumHeight + "px";
        this.contentContainer.style.marginLeft =
            cmContentContainer.offsetLeft + "px";
        this.contentContainer.style.marginTop =
            cmContent.firstElementChild.offsetTop - 24 + "px";
        for (let i = 0; i < this.lines.length; i++) {
            if (this.lineElements.length === i) {
                const e = document.createElement("div");
                e.classList.add("outliner-plugin-list-line");
                e.dataset.index = String(i);
                e.addEventListener("mousedown", this.onClick);
                this.contentContainer.appendChild(e);
                this.lineElements.push(e);
            }
            const l = this.lines[i];
            const e = this.lineElements[i];
            e.style.top = l.top + "px";
            e.style.left = l.left + "px";
            e.style.height = l.height;
            e.style.display = "block";
        }
        for (let i = this.lines.length; i < this.lineElements.length; i++) {
            const e = this.lineElements[i];
            e.style.top = "0px";
            e.style.left = "0px";
            e.style.height = "0px";
            e.style.display = "none";
        }
    }
    destroy() {
        this.settings.removeCallback(this.scheduleRecalculate);
        this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
        this.view.dom.removeChild(this.scroller);
        clearTimeout(this.scheduled);
    }
}
class VerticalLines {
    constructor(plugin, settings, obsidianSettings, parser) {
        this.plugin = plugin;
        this.settings = settings;
        this.obsidianSettings = obsidianSettings;
        this.parser = parser;
        this.updateBodyClass = () => {
            const shouldExists = this.obsidianSettings.isDefaultThemeEnabled() &&
                this.settings.verticalLines;
            const exists = document.body.classList.contains(VERTICAL_LINES_BODY_CLASS);
            if (shouldExists && !exists) {
                document.body.classList.add(VERTICAL_LINES_BODY_CLASS);
            }
            if (!shouldExists && exists) {
                document.body.classList.remove(VERTICAL_LINES_BODY_CLASS);
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateBodyClass();
            this.updateBodyClassInterval = window.setInterval(() => {
                this.updateBodyClass();
            }, 1000);
            this.plugin.registerEditorExtension(view.ViewPlugin.define((view) => new VerticalLinesPluginValue(this.settings, this.obsidianSettings, this.parser, view)));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            clearInterval(this.updateBodyClassInterval);
            document.body.classList.remove(VERTICAL_LINES_BODY_CLASS);
        });
    }
}

class ChangesApplicator {
    apply(editor, prevRoot, newRoot) {
        const changes = this.calculateChanges(editor, prevRoot, newRoot);
        if (changes) {
            const { replacement, changeFrom, changeTo } = changes;
            const { unfold, fold } = this.calculateFoldingOprations(prevRoot, newRoot, changeFrom, changeTo);
            for (const line of unfold) {
                editor.unfold(line);
            }
            editor.replaceRange(replacement, changeFrom, changeTo);
            for (const line of fold) {
                editor.fold(line);
            }
        }
        editor.setSelections(newRoot.getSelections());
    }
    calculateChanges(editor, prevRoot, newRoot) {
        const rootRange = prevRoot.getContentRange();
        const oldString = editor.getRange(rootRange[0], rootRange[1]);
        const newString = newRoot.print();
        const changeFrom = Object.assign({}, rootRange[0]);
        const changeTo = Object.assign({}, rootRange[1]);
        let oldTmp = oldString;
        let newTmp = newString;
        while (true) {
            const nlIndex = oldTmp.lastIndexOf("\n");
            if (nlIndex < 0) {
                break;
            }
            const oldLine = oldTmp.slice(nlIndex);
            const newLine = newTmp.slice(-oldLine.length);
            if (oldLine !== newLine) {
                break;
            }
            oldTmp = oldTmp.slice(0, -oldLine.length);
            newTmp = newTmp.slice(0, -oldLine.length);
            const nlIndex2 = oldTmp.lastIndexOf("\n");
            changeTo.ch =
                nlIndex2 >= 0 ? oldTmp.length - nlIndex2 - 1 : oldTmp.length;
            changeTo.line--;
        }
        while (true) {
            const nlIndex = oldTmp.indexOf("\n");
            if (nlIndex < 0) {
                break;
            }
            const oldLine = oldTmp.slice(0, nlIndex + 1);
            const newLine = newTmp.slice(0, oldLine.length);
            if (oldLine !== newLine) {
                break;
            }
            changeFrom.line++;
            oldTmp = oldTmp.slice(oldLine.length);
            newTmp = newTmp.slice(oldLine.length);
        }
        if (oldTmp === newTmp) {
            return null;
        }
        return {
            replacement: newTmp,
            changeFrom,
            changeTo,
        };
    }
    calculateFoldingOprations(prevRoot, newRoot, changeFrom, changeTo) {
        const changedRange = [changeFrom, changeTo];
        const prevLists = getAllChildren(prevRoot);
        const newLists = getAllChildren(newRoot);
        const unfold = [];
        const fold = [];
        for (const prevList of prevLists.values()) {
            if (!prevList.isFoldRoot()) {
                continue;
            }
            const newList = newLists.get(prevList.getID());
            if (!newList) {
                continue;
            }
            const prevListRange = [
                prevList.getFirstLineContentStart(),
                prevList.getContentEndIncludingChildren(),
            ];
            if (isRangesIntersects(prevListRange, changedRange)) {
                unfold.push(prevList.getFirstLineContentStart().line);
                fold.push(newList.getFirstLineContentStart().line);
            }
        }
        unfold.sort((a, b) => b - a);
        fold.sort((a, b) => b - a);
        return { unfold, fold };
    }
}
function getAllChildrenReduceFn(acc, child) {
    acc.set(child.getID(), child);
    child.getChildren().reduce(getAllChildrenReduceFn, acc);
    return acc;
}
function getAllChildren(root) {
    return root.getChildren().reduce(getAllChildrenReduceFn, new Map());
}

class IMEDetector {
    constructor() {
        this.composition = false;
        this.onCompositionStart = () => {
            this.composition = true;
        };
        this.onCompositionEnd = () => {
            this.composition = false;
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            document.addEventListener("compositionstart", this.onCompositionStart);
            document.addEventListener("compositionend", this.onCompositionEnd);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            document.removeEventListener("compositionend", this.onCompositionEnd);
            document.removeEventListener("compositionstart", this.onCompositionStart);
        });
    }
    isOpened() {
        return this.composition && obsidian.Platform.isDesktop;
    }
}

class Logger {
    constructor(settings) {
        this.settings = settings;
    }
    log(method, ...args) {
        if (!this.settings.debug) {
            return;
        }
        console.info(method, ...args);
    }
    bind(method) {
        return (...args) => this.log(method, ...args);
    }
}

function getHiddenObsidianConfig(app) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return app.vault.config;
}
class ObsidianSettings {
    constructor(app) {
        this.app = app;
    }
    isLegacyEditorEnabled() {
        const config = Object.assign({ legacyEditor: false }, getHiddenObsidianConfig(this.app));
        return config.legacyEditor;
    }
    isDefaultThemeEnabled() {
        const config = Object.assign({ cssTheme: "" }, getHiddenObsidianConfig(this.app));
        return config.cssTheme === "";
    }
    getTabsSettings() {
        return Object.assign({ useTab: true, tabSize: 4 }, getHiddenObsidianConfig(this.app));
    }
    getFoldSettings() {
        return Object.assign({ foldIndent: true }, getHiddenObsidianConfig(this.app));
    }
    getDefaultIndentChars() {
        const { useTab, tabSize } = this.getTabsSettings();
        return useTab ? "\t" : new Array(tabSize).fill(" ").join("");
    }
}

class OperationPerformer {
    constructor(parser, changesApplicator) {
        this.parser = parser;
        this.changesApplicator = changesApplicator;
    }
    eval(root, op, editor) {
        const prevRoot = root.clone();
        op.perform();
        if (op.shouldUpdate()) {
            this.changesApplicator.apply(editor, prevRoot, root);
        }
        return {
            shouldUpdate: op.shouldUpdate(),
            shouldStopPropagation: op.shouldStopPropagation(),
        };
    }
    perform(cb, editor, cursor = editor.getCursor()) {
        const root = this.parser.parse(editor, cursor);
        if (!root) {
            return { shouldUpdate: false, shouldStopPropagation: false };
        }
        const op = cb(root);
        return this.eval(root, op, editor);
    }
}

const bulletSignRe = `(?:[-*+]|\\d+\\.)`;
const optionalCheckboxRe = `(?:${checkboxRe})?`;
const listItemWithoutSpacesRe = new RegExp(`^${bulletSignRe}( |\t)`);
const listItemRe = new RegExp(`^[ \t]*${bulletSignRe}( |\t)`);
const stringWithSpacesRe = new RegExp(`^[ \t]+`);
const parseListItemRe = new RegExp(`^([ \t]*)(${bulletSignRe})( |\t)(${optionalCheckboxRe})(.*)$`);
class Parser {
    constructor(logger, settings) {
        this.logger = logger;
        this.settings = settings;
    }
    parseRange(editor, fromLine = 0, toLine = editor.lastLine()) {
        const lists = [];
        for (let i = fromLine; i <= toLine; i++) {
            const line = editor.getLine(i);
            if (i === fromLine || this.isListItem(line)) {
                const list = this.parseWithLimits(editor, i, fromLine, toLine);
                if (list) {
                    lists.push(list);
                    i = list.getContentEnd().line;
                }
            }
        }
        return lists;
    }
    parse(editor, cursor = editor.getCursor()) {
        return this.parseWithLimits(editor, cursor.line, 0, editor.lastLine());
    }
    parseWithLimits(editor, parsingStartLine, limitFrom, limitTo) {
        const d = this.logger.bind("parseList");
        const error = (msg) => {
            d(msg);
            return null;
        };
        const line = editor.getLine(parsingStartLine);
        let listLookingPos = null;
        if (this.isListItem(line)) {
            listLookingPos = parsingStartLine;
        }
        else if (this.isLineWithIndent(line)) {
            let listLookingPosSearch = parsingStartLine - 1;
            while (listLookingPosSearch >= 0) {
                const line = editor.getLine(listLookingPosSearch);
                if (this.isListItem(line)) {
                    listLookingPos = listLookingPosSearch;
                    break;
                }
                else if (this.isLineWithIndent(line)) {
                    listLookingPosSearch--;
                }
                else {
                    break;
                }
            }
        }
        if (listLookingPos === null) {
            return null;
        }
        let listStartLine = null;
        let listStartLineLookup = listLookingPos;
        while (listStartLineLookup >= 0) {
            const line = editor.getLine(listStartLineLookup);
            if (!this.isListItem(line) && !this.isLineWithIndent(line)) {
                break;
            }
            if (this.isListItemWithoutSpaces(line)) {
                listStartLine = listStartLineLookup;
                if (listStartLineLookup <= limitFrom) {
                    break;
                }
            }
            listStartLineLookup--;
        }
        if (listStartLine === null) {
            return null;
        }
        let listEndLine = listLookingPos;
        let listEndLineLookup = listLookingPos;
        while (listEndLineLookup <= editor.lastLine()) {
            const line = editor.getLine(listEndLineLookup);
            if (!this.isListItem(line) && !this.isLineWithIndent(line)) {
                break;
            }
            if (!this.isEmptyLine(line)) {
                listEndLine = listEndLineLookup;
            }
            if (listEndLineLookup >= limitTo) {
                listEndLine = limitTo;
                break;
            }
            listEndLineLookup++;
        }
        if (listStartLine > parsingStartLine || listEndLine < parsingStartLine) {
            return null;
        }
        // if the last line contains only spaces and that's incorrect indent, then ignore the last line
        // https://github.com/vslinko/obsidian-outliner/issues/368
        if (listEndLine > listStartLine) {
            const lastLine = editor.getLine(listEndLine);
            if (lastLine.trim().length === 0) {
                const prevLine = editor.getLine(listEndLine - 1);
                const [, prevLineIndent] = /^(\s*)/.exec(prevLine);
                if (!lastLine.startsWith(prevLineIndent)) {
                    listEndLine--;
                }
            }
        }
        const root = new Root({ line: listStartLine, ch: 0 }, { line: listEndLine, ch: editor.getLine(listEndLine).length }, editor.listSelections().map((r) => ({
            anchor: { line: r.anchor.line, ch: r.anchor.ch },
            head: { line: r.head.line, ch: r.head.ch },
        })));
        let currentParent = root.getRootList();
        let currentList = null;
        let currentIndent = "";
        const foldedLines = editor.getAllFoldedLines();
        for (let l = listStartLine; l <= listEndLine; l++) {
            const line = editor.getLine(l);
            const matches = parseListItemRe.exec(line);
            if (matches) {
                const [, indent, bullet, spaceAfterBullet] = matches;
                let [, , , , optionalCheckbox, content] = matches;
                content = optionalCheckbox + content;
                if (this.settings.keepCursorWithinContent !== "bullet-and-checkbox") {
                    optionalCheckbox = "";
                }
                const compareLength = Math.min(currentIndent.length, indent.length);
                const indentSlice = indent.slice(0, compareLength);
                const currentIndentSlice = currentIndent.slice(0, compareLength);
                if (indentSlice !== currentIndentSlice) {
                    const expected = currentIndentSlice
                        .replace(/ /g, "S")
                        .replace(/\t/g, "T");
                    const got = indentSlice.replace(/ /g, "S").replace(/\t/g, "T");
                    return error(`Unable to parse list: expected indent "${expected}", got "${got}"`);
                }
                if (indent.length > currentIndent.length) {
                    currentParent = currentList;
                    currentIndent = indent;
                }
                else if (indent.length < currentIndent.length) {
                    while (currentParent.getFirstLineIndent().length >= indent.length &&
                        currentParent.getParent()) {
                        currentParent = currentParent.getParent();
                    }
                    currentIndent = indent;
                }
                const foldRoot = foldedLines.includes(l);
                currentList = new List(root, indent, bullet, optionalCheckbox, spaceAfterBullet, content, foldRoot);
                currentParent.addAfterAll(currentList);
            }
            else if (this.isLineWithIndent(line)) {
                if (!currentList) {
                    return error(`Unable to parse list: expected list item, got empty line`);
                }
                const indentToCheck = currentList.getNotesIndent() || currentIndent;
                if (line.indexOf(indentToCheck) !== 0) {
                    const expected = indentToCheck.replace(/ /g, "S").replace(/\t/g, "T");
                    const got = line
                        .match(/^[ \t]*/)[0]
                        .replace(/ /g, "S")
                        .replace(/\t/g, "T");
                    return error(`Unable to parse list: expected indent "${expected}", got "${got}"`);
                }
                if (!currentList.getNotesIndent()) {
                    const matches = line.match(/^[ \t]+/);
                    if (!matches || matches[0].length <= currentIndent.length) {
                        if (/^\s+$/.test(line)) {
                            continue;
                        }
                        return error(`Unable to parse list: expected some indent, got no indent`);
                    }
                    currentList.setNotesIndent(matches[0]);
                }
                currentList.addLine(line.slice(currentList.getNotesIndent().length));
            }
            else {
                return error(`Unable to parse list: expected list item or note, got "${line}"`);
            }
        }
        return root;
    }
    isEmptyLine(line) {
        return line.length === 0;
    }
    isLineWithIndent(line) {
        return stringWithSpacesRe.test(line);
    }
    isListItem(line) {
        return listItemRe.test(line);
    }
    isListItemWithoutSpaces(line) {
        return listItemWithoutSpacesRe.test(line);
    }
}

const DEFAULT_SETTINGS = {
    styleLists: true,
    debug: false,
    stickCursor: "bullet-and-checkbox",
    betterEnter: true,
    betterTab: true,
    selectAll: true,
    listLines: false,
    listLineAction: "toggle-folding",
    dnd: true,
    previousRelease: null,
};
class Settings {
    constructor(storage) {
        this.storage = storage;
        this.callbacks = new Set();
    }
    get keepCursorWithinContent() {
        // Adaptor for users migrating from older version of the plugin.
        if (this.values.stickCursor === true) {
            return "bullet-and-checkbox";
        }
        else if (this.values.stickCursor === false) {
            return "never";
        }
        return this.values.stickCursor;
    }
    set keepCursorWithinContent(value) {
        this.set("stickCursor", value);
    }
    get overrideTabBehaviour() {
        return this.values.betterTab;
    }
    set overrideTabBehaviour(value) {
        this.set("betterTab", value);
    }
    get overrideEnterBehaviour() {
        return this.values.betterEnter;
    }
    set overrideEnterBehaviour(value) {
        this.set("betterEnter", value);
    }
    get overrideSelectAllBehaviour() {
        return this.values.selectAll;
    }
    set overrideSelectAllBehaviour(value) {
        this.set("selectAll", value);
    }
    get betterListsStyles() {
        return this.values.styleLists;
    }
    set betterListsStyles(value) {
        this.set("styleLists", value);
    }
    get verticalLines() {
        return this.values.listLines;
    }
    set verticalLines(value) {
        this.set("listLines", value);
    }
    get verticalLinesAction() {
        return this.values.listLineAction;
    }
    set verticalLinesAction(value) {
        this.set("listLineAction", value);
    }
    get dragAndDrop() {
        return this.values.dnd;
    }
    set dragAndDrop(value) {
        this.set("dnd", value);
    }
    get debug() {
        return this.values.debug;
    }
    set debug(value) {
        this.set("debug", value);
    }
    get previousRelease() {
        return this.values.previousRelease;
    }
    set previousRelease(value) {
        this.set("previousRelease", value);
    }
    onChange(cb) {
        this.callbacks.add(cb);
    }
    removeCallback(cb) {
        this.callbacks.delete(cb);
    }
    reset() {
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            this.set(k, v);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.values = Object.assign({}, DEFAULT_SETTINGS, yield this.storage.loadData());
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage.saveData(this.values);
        });
    }
    getValues() {
        return Object.assign({}, this.values);
    }
    set(key, value) {
        this.values[key] = value;
        for (const cb of this.callbacks) {
            cb();
        }
    }
}

class ObsidianOutlinerPlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Loading obsidian-outliner`);
            yield this.prepareSettings();
            this.obsidianSettings = new ObsidianSettings(this.app);
            this.logger = new Logger(this.settings);
            this.parser = new Parser(this.logger, this.settings);
            this.changesApplicator = new ChangesApplicator();
            this.operationPerformer = new OperationPerformer(this.parser, this.changesApplicator);
            this.imeDetector = new IMEDetector();
            yield this.imeDetector.load();
            this.features = [
                // service features
                // new ReleaseNotesAnnouncement(this, this.settings),
                new SettingsTab(this, this.settings),
                new SystemInfo(this, this.settings),
                // general features
                new ListsMovementCommands(this, this.obsidianSettings, this.operationPerformer),
                new ListsFoldingCommands(this, this.obsidianSettings),
                // features based on settings.keepCursorWithinContent
                new EditorSelectionsBehaviourOverride(this, this.settings, this.parser, this.operationPerformer),
                new ArrowLeftAndCtrlArrowLeftBehaviourOverride(this, this.settings, this.imeDetector, this.operationPerformer),
                new BackspaceBehaviourOverride(this, this.settings, this.imeDetector, this.operationPerformer),
                new MetaBackspaceBehaviourOverride(this, this.settings, this.imeDetector, this.operationPerformer),
                new DeleteBehaviourOverride(this, this.settings, this.imeDetector, this.operationPerformer),
                // features based on settings.overrideTabBehaviour
                new TabBehaviourOverride(this, this.imeDetector, this.obsidianSettings, this.settings, this.operationPerformer),
                new ShiftTabBehaviourOverride(this, this.imeDetector, this.settings, this.operationPerformer),
                // features based on settings.overrideEnterBehaviour
                new EnterBehaviourOverride(this, this.settings, this.imeDetector, this.obsidianSettings, this.parser, this.operationPerformer),
                // features based on settings.overrideSelectAllBehaviour
                new CtrlAAndCmdABehaviourOverride(this, this.settings, this.imeDetector, this.operationPerformer),
                // features based on settings.betterListsStyles
                new BetterListsStyles(this.settings, this.obsidianSettings),
                // features based on settings.verticalLines
                new VerticalLines(this, this.settings, this.obsidianSettings, this.parser),
                // features based on settings.dragAndDrop
                new DragAndDrop(this, this.settings, this.obsidianSettings, this.parser, this.operationPerformer),
            ];
            for (const feature of this.features) {
                yield feature.load();
            }
        });
    }
    onunload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Unloading obsidian-outliner`);
            yield this.imeDetector.unload();
            for (const feature of this.features) {
                yield feature.unload();
            }
        });
    }
    prepareSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = new Settings(this);
            yield this.settings.load();
        });
    }
}

module.exports = ObsidianOutlinerPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9vcGVyYXRpb25zL01vdmVDdXJzb3JUb1ByZXZpb3VzVW5mb2xkZWRMaW5lLnRzIiwic3JjL2VkaXRvci9pbmRleC50cyIsInNyYy91dGlscy9jcmVhdGVLZXltYXBSdW5DYWxsYmFjay50cyIsInNyYy9mZWF0dXJlcy9BcnJvd0xlZnRBbmRDdHJsQXJyb3dMZWZ0QmVoYXZpb3VyT3ZlcnJpZGUudHMiLCJzcmMvcm9vdC9pbmRleC50cyIsInNyYy9vcGVyYXRpb25zL0RlbGV0ZVRpbGxQcmV2aW91c0xpbmVDb250ZW50RW5kLnRzIiwic3JjL2ZlYXR1cmVzL0JhY2tzcGFjZUJlaGF2aW91ck92ZXJyaWRlLnRzIiwic3JjL2ZlYXR1cmVzL0JldHRlckxpc3RzU3R5bGVzLnRzIiwic3JjL29wZXJhdGlvbnMvU2VsZWN0QWxsQ29udGVudC50cyIsInNyYy9mZWF0dXJlcy9DdHJsQUFuZENtZEFCZWhhdmlvdXJPdmVycmlkZS50cyIsInNyYy9vcGVyYXRpb25zL0RlbGV0ZVRpbGxOZXh0TGluZUNvbnRlbnRTdGFydC50cyIsInNyYy9mZWF0dXJlcy9EZWxldGVCZWhhdmlvdXJPdmVycmlkZS50cyIsInNyYy9vcGVyYXRpb25zL01vdmVMaXN0VG9EaWZmZXJlbnRQb3NpdGlvbi50cyIsInNyYy9mZWF0dXJlcy9EcmFnQW5kRHJvcC50cyIsInNyYy9vcGVyYXRpb25zL0tlZXBDdXJzb3JPdXRzaWRlRm9sZGVkTGluZXMudHMiLCJzcmMvb3BlcmF0aW9ucy9LZWVwQ3Vyc29yV2l0aGluTGlzdENvbnRlbnQudHMiLCJzcmMvZmVhdHVyZXMvRWRpdG9yU2VsZWN0aW9uc0JlaGF2aW91ck92ZXJyaWRlLnRzIiwic3JjL3V0aWxzL2NoZWNrYm94UmUudHMiLCJzcmMvdXRpbHMvaXNFbXB0eUxpbmVPckVtcHR5Q2hlY2tib3gudHMiLCJzcmMvb3BlcmF0aW9ucy9DcmVhdGVOZXdJdGVtLnRzIiwic3JjL29wZXJhdGlvbnMvT3V0ZGVudExpc3QudHMiLCJzcmMvb3BlcmF0aW9ucy9PdXRkZW50TGlzdElmSXRzRW1wdHkudHMiLCJzcmMvZmVhdHVyZXMvRW50ZXJCZWhhdmlvdXJPdmVycmlkZS50cyIsInNyYy91dGlscy9jcmVhdGVFZGl0b3JDYWxsYmFjay50cyIsInNyYy9mZWF0dXJlcy9MaXN0c0ZvbGRpbmdDb21tYW5kcy50cyIsInNyYy9vcGVyYXRpb25zL0luZGVudExpc3QudHMiLCJzcmMvb3BlcmF0aW9ucy9Nb3ZlTGlzdERvd24udHMiLCJzcmMvb3BlcmF0aW9ucy9Nb3ZlTGlzdFVwLnRzIiwic3JjL2ZlYXR1cmVzL0xpc3RzTW92ZW1lbnRDb21tYW5kcy50cyIsInNyYy9vcGVyYXRpb25zL0RlbGV0ZVRpbGxDdXJyZW50TGluZUNvbnRlbnRTdGFydC50cyIsInNyYy9mZWF0dXJlcy9NZXRhQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGUudHMiLCJzcmMvZmVhdHVyZXMvU2V0dGluZ3NUYWIudHMiLCJzcmMvZmVhdHVyZXMvU2hpZnRUYWJCZWhhdmlvdXJPdmVycmlkZS50cyIsInNyYy9mZWF0dXJlcy9TeXN0ZW1JbmZvLnRzIiwic3JjL2ZlYXR1cmVzL1RhYkJlaGF2aW91ck92ZXJyaWRlLnRzIiwic3JjL2ZlYXR1cmVzL1ZlcnRpY2FsTGluZXMudHMiLCJzcmMvc2VydmljZXMvQ2hhbmdlc0FwcGxpY2F0b3IudHMiLCJzcmMvc2VydmljZXMvSU1FRGV0ZWN0b3IudHMiLCJzcmMvc2VydmljZXMvTG9nZ2VyLnRzIiwic3JjL3NlcnZpY2VzL09ic2lkaWFuU2V0dGluZ3MudHMiLCJzcmMvc2VydmljZXMvT3BlcmF0aW9uUGVyZm9ybWVyLnRzIiwic3JjL3NlcnZpY2VzL1BhcnNlci50cyIsInNyYy9zZXJ2aWNlcy9TZXR0aW5ncy50cyIsInNyYy9PYnNpZGlhbk91dGxpbmVyUGx1Z2luLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uXHJcblxyXG5QZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcclxucHVycG9zZSB3aXRoIG9yIHdpdGhvdXQgZmVlIGlzIGhlcmVieSBncmFudGVkLlxyXG5cclxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVMgV0lUSFxyXG5SRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFlcclxuQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUiBBTlkgU1BFQ0lBTCwgRElSRUNULFxyXG5JTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST01cclxuTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1JcclxuT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUlxyXG5QRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG4vKiBnbG9iYWwgUmVmbGVjdCwgUHJvbWlzZSwgU3VwcHJlc3NlZEVycm9yLCBTeW1ib2wgKi9cclxuXHJcbnZhciBleHRlbmRTdGF0aWNzID0gZnVuY3Rpb24oZCwgYikge1xyXG4gICAgZXh0ZW5kU3RhdGljcyA9IE9iamVjdC5zZXRQcm90b3R5cGVPZiB8fFxyXG4gICAgICAgICh7IF9fcHJvdG9fXzogW10gfSBpbnN0YW5jZW9mIEFycmF5ICYmIGZ1bmN0aW9uIChkLCBiKSB7IGQuX19wcm90b19fID0gYjsgfSkgfHxcclxuICAgICAgICBmdW5jdGlvbiAoZCwgYikgeyBmb3IgKHZhciBwIGluIGIpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYiwgcCkpIGRbcF0gPSBiW3BdOyB9O1xyXG4gICAgcmV0dXJuIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19leHRlbmRzKGQsIGIpIHtcclxuICAgIGlmICh0eXBlb2YgYiAhPT0gXCJmdW5jdGlvblwiICYmIGIgIT09IG51bGwpXHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNsYXNzIGV4dGVuZHMgdmFsdWUgXCIgKyBTdHJpbmcoYikgKyBcIiBpcyBub3QgYSBjb25zdHJ1Y3RvciBvciBudWxsXCIpO1xyXG4gICAgZXh0ZW5kU3RhdGljcyhkLCBiKTtcclxuICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxyXG4gICAgZC5wcm90b3R5cGUgPSBiID09PSBudWxsID8gT2JqZWN0LmNyZWF0ZShiKSA6IChfXy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgbmV3IF9fKCkpO1xyXG59XHJcblxyXG5leHBvcnQgdmFyIF9fYXNzaWduID0gZnVuY3Rpb24oKSB7XHJcbiAgICBfX2Fzc2lnbiA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gX19hc3NpZ24odCkge1xyXG4gICAgICAgIGZvciAodmFyIHMsIGkgPSAxLCBuID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IG47IGkrKykge1xyXG4gICAgICAgICAgICBzID0gYXJndW1lbnRzW2ldO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkpIHRbcF0gPSBzW3BdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdDtcclxuICAgIH1cclxuICAgIHJldHVybiBfX2Fzc2lnbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19yZXN0KHMsIGUpIHtcclxuICAgIHZhciB0ID0ge307XHJcbiAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkgJiYgZS5pbmRleE9mKHApIDwgMClcclxuICAgICAgICB0W3BdID0gc1twXTtcclxuICAgIGlmIChzICE9IG51bGwgJiYgdHlwZW9mIE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMgPT09IFwiZnVuY3Rpb25cIilcclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMocyk7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChlLmluZGV4T2YocFtpXSkgPCAwICYmIE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGUuY2FsbChzLCBwW2ldKSlcclxuICAgICAgICAgICAgICAgIHRbcFtpXV0gPSBzW3BbaV1dO1xyXG4gICAgICAgIH1cclxuICAgIHJldHVybiB0O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYykge1xyXG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoLCByID0gYyA8IDMgPyB0YXJnZXQgOiBkZXNjID09PSBudWxsID8gZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBrZXkpIDogZGVzYywgZDtcclxuICAgIGlmICh0eXBlb2YgUmVmbGVjdCA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgUmVmbGVjdC5kZWNvcmF0ZSA9PT0gXCJmdW5jdGlvblwiKSByID0gUmVmbGVjdC5kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYyk7XHJcbiAgICBlbHNlIGZvciAodmFyIGkgPSBkZWNvcmF0b3JzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBpZiAoZCA9IGRlY29yYXRvcnNbaV0pIHIgPSAoYyA8IDMgPyBkKHIpIDogYyA+IDMgPyBkKHRhcmdldCwga2V5LCByKSA6IGQodGFyZ2V0LCBrZXkpKSB8fCByO1xyXG4gICAgcmV0dXJuIGMgPiAzICYmIHIgJiYgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwga2V5LCByKSwgcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcGFyYW0ocGFyYW1JbmRleCwgZGVjb3JhdG9yKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKHRhcmdldCwga2V5KSB7IGRlY29yYXRvcih0YXJnZXQsIGtleSwgcGFyYW1JbmRleCk7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXNEZWNvcmF0ZShjdG9yLCBkZXNjcmlwdG9ySW4sIGRlY29yYXRvcnMsIGNvbnRleHRJbiwgaW5pdGlhbGl6ZXJzLCBleHRyYUluaXRpYWxpemVycykge1xyXG4gICAgZnVuY3Rpb24gYWNjZXB0KGYpIHsgaWYgKGYgIT09IHZvaWQgMCAmJiB0eXBlb2YgZiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRnVuY3Rpb24gZXhwZWN0ZWRcIik7IHJldHVybiBmOyB9XHJcbiAgICB2YXIga2luZCA9IGNvbnRleHRJbi5raW5kLCBrZXkgPSBraW5kID09PSBcImdldHRlclwiID8gXCJnZXRcIiA6IGtpbmQgPT09IFwic2V0dGVyXCIgPyBcInNldFwiIDogXCJ2YWx1ZVwiO1xyXG4gICAgdmFyIHRhcmdldCA9ICFkZXNjcmlwdG9ySW4gJiYgY3RvciA/IGNvbnRleHRJbltcInN0YXRpY1wiXSA/IGN0b3IgOiBjdG9yLnByb3RvdHlwZSA6IG51bGw7XHJcbiAgICB2YXIgZGVzY3JpcHRvciA9IGRlc2NyaXB0b3JJbiB8fCAodGFyZ2V0ID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGNvbnRleHRJbi5uYW1lKSA6IHt9KTtcclxuICAgIHZhciBfLCBkb25lID0gZmFsc2U7XHJcbiAgICBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIHZhciBjb250ZXh0ID0ge307XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4pIGNvbnRleHRbcF0gPSBwID09PSBcImFjY2Vzc1wiID8ge30gOiBjb250ZXh0SW5bcF07XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4uYWNjZXNzKSBjb250ZXh0LmFjY2Vzc1twXSA9IGNvbnRleHRJbi5hY2Nlc3NbcF07XHJcbiAgICAgICAgY29udGV4dC5hZGRJbml0aWFsaXplciA9IGZ1bmN0aW9uIChmKSB7IGlmIChkb25lKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IGFkZCBpbml0aWFsaXplcnMgYWZ0ZXIgZGVjb3JhdGlvbiBoYXMgY29tcGxldGVkXCIpOyBleHRyYUluaXRpYWxpemVycy5wdXNoKGFjY2VwdChmIHx8IG51bGwpKTsgfTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gKDAsIGRlY29yYXRvcnNbaV0pKGtpbmQgPT09IFwiYWNjZXNzb3JcIiA/IHsgZ2V0OiBkZXNjcmlwdG9yLmdldCwgc2V0OiBkZXNjcmlwdG9yLnNldCB9IDogZGVzY3JpcHRvcltrZXldLCBjb250ZXh0KTtcclxuICAgICAgICBpZiAoa2luZCA9PT0gXCJhY2Nlc3NvclwiKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IHZvaWQgMCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IG51bGwgfHwgdHlwZW9mIHJlc3VsdCAhPT0gXCJvYmplY3RcIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZFwiKTtcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmdldCkpIGRlc2NyaXB0b3IuZ2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LnNldCkpIGRlc2NyaXB0b3Iuc2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmluaXQpKSBpbml0aWFsaXplcnMudW5zaGlmdChfKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoXyA9IGFjY2VwdChyZXN1bHQpKSB7XHJcbiAgICAgICAgICAgIGlmIChraW5kID09PSBcImZpZWxkXCIpIGluaXRpYWxpemVycy51bnNoaWZ0KF8pO1xyXG4gICAgICAgICAgICBlbHNlIGRlc2NyaXB0b3Jba2V5XSA9IF87XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKHRhcmdldCkgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgY29udGV4dEluLm5hbWUsIGRlc2NyaXB0b3IpO1xyXG4gICAgZG9uZSA9IHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19ydW5Jbml0aWFsaXplcnModGhpc0FyZywgaW5pdGlhbGl6ZXJzLCB2YWx1ZSkge1xyXG4gICAgdmFyIHVzZVZhbHVlID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluaXRpYWxpemVycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhbHVlID0gdXNlVmFsdWUgPyBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnLCB2YWx1ZSkgOiBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnKTtcclxuICAgIH1cclxuICAgIHJldHVybiB1c2VWYWx1ZSA/IHZhbHVlIDogdm9pZCAwO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcHJvcEtleSh4KSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHggPT09IFwic3ltYm9sXCIgPyB4IDogXCJcIi5jb25jYXQoeCk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19zZXRGdW5jdGlvbk5hbWUoZiwgbmFtZSwgcHJlZml4KSB7XHJcbiAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3ltYm9sXCIpIG5hbWUgPSBuYW1lLmRlc2NyaXB0aW9uID8gXCJbXCIuY29uY2F0KG5hbWUuZGVzY3JpcHRpb24sIFwiXVwiKSA6IFwiXCI7XHJcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KGYsIFwibmFtZVwiLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IHByZWZpeCA/IFwiXCIuY29uY2F0KHByZWZpeCwgXCIgXCIsIG5hbWUpIDogbmFtZSB9KTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX21ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QubWV0YWRhdGEgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIFJlZmxlY3QubWV0YWRhdGEobWV0YWRhdGFLZXksIG1ldGFkYXRhVmFsdWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdGVyKHRoaXNBcmcsIF9hcmd1bWVudHMsIFAsIGdlbmVyYXRvcikge1xyXG4gICAgZnVuY3Rpb24gYWRvcHQodmFsdWUpIHsgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgUCA/IHZhbHVlIDogbmV3IFAoZnVuY3Rpb24gKHJlc29sdmUpIHsgcmVzb2x2ZSh2YWx1ZSk7IH0pOyB9XHJcbiAgICByZXR1cm4gbmV3IChQIHx8IChQID0gUHJvbWlzZSkpKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBmdW5jdGlvbiBmdWxmaWxsZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3IubmV4dCh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gcmVqZWN0ZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3JbXCJ0aHJvd1wiXSh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gc3RlcChyZXN1bHQpIHsgcmVzdWx0LmRvbmUgPyByZXNvbHZlKHJlc3VsdC52YWx1ZSkgOiBhZG9wdChyZXN1bHQudmFsdWUpLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCk7IH1cclxuICAgICAgICBzdGVwKChnZW5lcmF0b3IgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSkpLm5leHQoKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZ2VuZXJhdG9yKHRoaXNBcmcsIGJvZHkpIHtcclxuICAgIHZhciBfID0geyBsYWJlbDogMCwgc2VudDogZnVuY3Rpb24oKSB7IGlmICh0WzBdICYgMSkgdGhyb3cgdFsxXTsgcmV0dXJuIHRbMV07IH0sIHRyeXM6IFtdLCBvcHM6IFtdIH0sIGYsIHksIHQsIGc7XHJcbiAgICByZXR1cm4gZyA9IHsgbmV4dDogdmVyYigwKSwgXCJ0aHJvd1wiOiB2ZXJiKDEpLCBcInJldHVyblwiOiB2ZXJiKDIpIH0sIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiAoZ1tTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KSwgZztcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyByZXR1cm4gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHN0ZXAoW24sIHZdKTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc3RlcChvcCkge1xyXG4gICAgICAgIGlmIChmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiR2VuZXJhdG9yIGlzIGFscmVhZHkgZXhlY3V0aW5nLlwiKTtcclxuICAgICAgICB3aGlsZSAoZyAmJiAoZyA9IDAsIG9wWzBdICYmIChfID0gMCkpLCBfKSB0cnkge1xyXG4gICAgICAgICAgICBpZiAoZiA9IDEsIHkgJiYgKHQgPSBvcFswXSAmIDIgPyB5W1wicmV0dXJuXCJdIDogb3BbMF0gPyB5W1widGhyb3dcIl0gfHwgKCh0ID0geVtcInJldHVyblwiXSkgJiYgdC5jYWxsKHkpLCAwKSA6IHkubmV4dCkgJiYgISh0ID0gdC5jYWxsKHksIG9wWzFdKSkuZG9uZSkgcmV0dXJuIHQ7XHJcbiAgICAgICAgICAgIGlmICh5ID0gMCwgdCkgb3AgPSBbb3BbMF0gJiAyLCB0LnZhbHVlXTtcclxuICAgICAgICAgICAgc3dpdGNoIChvcFswXSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAwOiBjYXNlIDE6IHQgPSBvcDsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDQ6IF8ubGFiZWwrKzsgcmV0dXJuIHsgdmFsdWU6IG9wWzFdLCBkb25lOiBmYWxzZSB9O1xyXG4gICAgICAgICAgICAgICAgY2FzZSA1OiBfLmxhYmVsKys7IHkgPSBvcFsxXTsgb3AgPSBbMF07IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgY2FzZSA3OiBvcCA9IF8ub3BzLnBvcCgpOyBfLnRyeXMucG9wKCk7IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBpZiAoISh0ID0gXy50cnlzLCB0ID0gdC5sZW5ndGggPiAwICYmIHRbdC5sZW5ndGggLSAxXSkgJiYgKG9wWzBdID09PSA2IHx8IG9wWzBdID09PSAyKSkgeyBfID0gMDsgY29udGludWU7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BbMF0gPT09IDMgJiYgKCF0IHx8IChvcFsxXSA+IHRbMF0gJiYgb3BbMV0gPCB0WzNdKSkpIHsgXy5sYWJlbCA9IG9wWzFdOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcFswXSA9PT0gNiAmJiBfLmxhYmVsIDwgdFsxXSkgeyBfLmxhYmVsID0gdFsxXTsgdCA9IG9wOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIF8ubGFiZWwgPCB0WzJdKSB7IF8ubGFiZWwgPSB0WzJdOyBfLm9wcy5wdXNoKG9wKTsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAodFsyXSkgXy5vcHMucG9wKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXy50cnlzLnBvcCgpOyBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcCA9IGJvZHkuY2FsbCh0aGlzQXJnLCBfKTtcclxuICAgICAgICB9IGNhdGNoIChlKSB7IG9wID0gWzYsIGVdOyB5ID0gMDsgfSBmaW5hbGx5IHsgZiA9IHQgPSAwOyB9XHJcbiAgICAgICAgaWYgKG9wWzBdICYgNSkgdGhyb3cgb3BbMV07IHJldHVybiB7IHZhbHVlOiBvcFswXSA/IG9wWzFdIDogdm9pZCAwLCBkb25lOiB0cnVlIH07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCB2YXIgX19jcmVhdGVCaW5kaW5nID0gT2JqZWN0LmNyZWF0ZSA/IChmdW5jdGlvbihvLCBtLCBrLCBrMikge1xyXG4gICAgaWYgKGsyID09PSB1bmRlZmluZWQpIGsyID0gaztcclxuICAgIHZhciBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihtLCBrKTtcclxuICAgIGlmICghZGVzYyB8fCAoXCJnZXRcIiBpbiBkZXNjID8gIW0uX19lc01vZHVsZSA6IGRlc2Mud3JpdGFibGUgfHwgZGVzYy5jb25maWd1cmFibGUpKSB7XHJcbiAgICAgICAgZGVzYyA9IHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG1ba107IH0gfTtcclxuICAgIH1cclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvLCBrMiwgZGVzYyk7XHJcbn0pIDogKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgb1trMl0gPSBtW2tdO1xyXG59KTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2V4cG9ydFN0YXIobSwgbykge1xyXG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAocCAhPT0gXCJkZWZhdWx0XCIgJiYgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvLCBwKSkgX19jcmVhdGVCaW5kaW5nKG8sIG0sIHApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX192YWx1ZXMobykge1xyXG4gICAgdmFyIHMgPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgU3ltYm9sLml0ZXJhdG9yLCBtID0gcyAmJiBvW3NdLCBpID0gMDtcclxuICAgIGlmIChtKSByZXR1cm4gbS5jYWxsKG8pO1xyXG4gICAgaWYgKG8gJiYgdHlwZW9mIG8ubGVuZ3RoID09PSBcIm51bWJlclwiKSByZXR1cm4ge1xyXG4gICAgICAgIG5leHQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKG8gJiYgaSA+PSBvLmxlbmd0aCkgbyA9IHZvaWQgMDtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IG8gJiYgb1tpKytdLCBkb25lOiAhbyB9O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKHMgPyBcIk9iamVjdCBpcyBub3QgaXRlcmFibGUuXCIgOiBcIlN5bWJvbC5pdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3JlYWQobywgbikge1xyXG4gICAgdmFyIG0gPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgb1tTeW1ib2wuaXRlcmF0b3JdO1xyXG4gICAgaWYgKCFtKSByZXR1cm4gbztcclxuICAgIHZhciBpID0gbS5jYWxsKG8pLCByLCBhciA9IFtdLCBlO1xyXG4gICAgdHJ5IHtcclxuICAgICAgICB3aGlsZSAoKG4gPT09IHZvaWQgMCB8fCBuLS0gPiAwKSAmJiAhKHIgPSBpLm5leHQoKSkuZG9uZSkgYXIucHVzaChyLnZhbHVlKTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlcnJvcikgeyBlID0geyBlcnJvcjogZXJyb3IgfTsgfVxyXG4gICAgZmluYWxseSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKHIgJiYgIXIuZG9uZSAmJiAobSA9IGlbXCJyZXR1cm5cIl0pKSBtLmNhbGwoaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbmFsbHkgeyBpZiAoZSkgdGhyb3cgZS5lcnJvcjsgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkKCkge1xyXG4gICAgZm9yICh2YXIgYXIgPSBbXSwgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgYXIgPSBhci5jb25jYXQoX19yZWFkKGFyZ3VtZW50c1tpXSkpO1xyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkQXJyYXlzKCkge1xyXG4gICAgZm9yICh2YXIgcyA9IDAsIGkgPSAwLCBpbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBpbDsgaSsrKSBzICs9IGFyZ3VtZW50c1tpXS5sZW5ndGg7XHJcbiAgICBmb3IgKHZhciByID0gQXJyYXkocyksIGsgPSAwLCBpID0gMDsgaSA8IGlsOyBpKyspXHJcbiAgICAgICAgZm9yICh2YXIgYSA9IGFyZ3VtZW50c1tpXSwgaiA9IDAsIGpsID0gYS5sZW5ndGg7IGogPCBqbDsgaisrLCBrKyspXHJcbiAgICAgICAgICAgIHJba10gPSBhW2pdO1xyXG4gICAgcmV0dXJuIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZEFycmF5KHRvLCBmcm9tLCBwYWNrKSB7XHJcbiAgICBpZiAocGFjayB8fCBhcmd1bWVudHMubGVuZ3RoID09PSAyKSBmb3IgKHZhciBpID0gMCwgbCA9IGZyb20ubGVuZ3RoLCBhcjsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIGlmIChhciB8fCAhKGkgaW4gZnJvbSkpIHtcclxuICAgICAgICAgICAgaWYgKCFhcikgYXIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChmcm9tLCAwLCBpKTtcclxuICAgICAgICAgICAgYXJbaV0gPSBmcm9tW2ldO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0by5jb25jYXQoYXIgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZnJvbSkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdCh2KSB7XHJcbiAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIF9fYXdhaXQgPyAodGhpcy52ID0gdiwgdGhpcykgOiBuZXcgX19hd2FpdCh2KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXN5bmNHZW5lcmF0b3IodGhpc0FyZywgX2FyZ3VtZW50cywgZ2VuZXJhdG9yKSB7XHJcbiAgICBpZiAoIVN5bWJvbC5hc3luY0l0ZXJhdG9yKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3ltYm9sLmFzeW5jSXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgdmFyIGcgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSksIGksIHEgPSBbXTtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyBpZiAoZ1tuXSkgaVtuXSA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAoYSwgYikgeyBxLnB1c2goW24sIHYsIGEsIGJdKSA+IDEgfHwgcmVzdW1lKG4sIHYpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gcmVzdW1lKG4sIHYpIHsgdHJ5IHsgc3RlcChnW25dKHYpKTsgfSBjYXRjaCAoZSkgeyBzZXR0bGUocVswXVszXSwgZSk7IH0gfVxyXG4gICAgZnVuY3Rpb24gc3RlcChyKSB7IHIudmFsdWUgaW5zdGFuY2VvZiBfX2F3YWl0ID8gUHJvbWlzZS5yZXNvbHZlKHIudmFsdWUudikudGhlbihmdWxmaWxsLCByZWplY3QpIDogc2V0dGxlKHFbMF1bMl0sIHIpOyB9XHJcbiAgICBmdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7IHJlc3VtZShcIm5leHRcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiByZWplY3QodmFsdWUpIHsgcmVzdW1lKFwidGhyb3dcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiBzZXR0bGUoZiwgdikgeyBpZiAoZih2KSwgcS5zaGlmdCgpLCBxLmxlbmd0aCkgcmVzdW1lKHFbMF1bMF0sIHFbMF1bMV0pOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jRGVsZWdhdG9yKG8pIHtcclxuICAgIHZhciBpLCBwO1xyXG4gICAgcmV0dXJuIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiLCBmdW5jdGlvbiAoZSkgeyB0aHJvdyBlOyB9KSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobiwgZikgeyBpW25dID0gb1tuXSA/IGZ1bmN0aW9uICh2KSB7IHJldHVybiAocCA9ICFwKSA/IHsgdmFsdWU6IF9fYXdhaXQob1tuXSh2KSksIGRvbmU6IGZhbHNlIH0gOiBmID8gZih2KSA6IHY7IH0gOiBmOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jVmFsdWVzKG8pIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgbSA9IG9bU3ltYm9sLmFzeW5jSXRlcmF0b3JdLCBpO1xyXG4gICAgcmV0dXJuIG0gPyBtLmNhbGwobykgOiAobyA9IHR5cGVvZiBfX3ZhbHVlcyA9PT0gXCJmdW5jdGlvblwiID8gX192YWx1ZXMobykgOiBvW1N5bWJvbC5pdGVyYXRvcl0oKSwgaSA9IHt9LCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIpLCBpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGkpO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IGlbbl0gPSBvW25dICYmIGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7IHYgPSBvW25dKHYpLCBzZXR0bGUocmVzb2x2ZSwgcmVqZWN0LCB2LmRvbmUsIHYudmFsdWUpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgZCwgdikgeyBQcm9taXNlLnJlc29sdmUodikudGhlbihmdW5jdGlvbih2KSB7IHJlc29sdmUoeyB2YWx1ZTogdiwgZG9uZTogZCB9KTsgfSwgcmVqZWN0KTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tYWtlVGVtcGxhdGVPYmplY3QoY29va2VkLCByYXcpIHtcclxuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkpIHsgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNvb2tlZCwgXCJyYXdcIiwgeyB2YWx1ZTogcmF3IH0pOyB9IGVsc2UgeyBjb29rZWQucmF3ID0gcmF3OyB9XHJcbiAgICByZXR1cm4gY29va2VkO1xyXG59O1xyXG5cclxudmFyIF9fc2V0TW9kdWxlRGVmYXVsdCA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgdikge1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIFwiZGVmYXVsdFwiLCB7IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiB2IH0pO1xyXG59KSA6IGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIG9bXCJkZWZhdWx0XCJdID0gdjtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydFN0YXIobW9kKSB7XHJcbiAgICBpZiAobW9kICYmIG1vZC5fX2VzTW9kdWxlKSByZXR1cm4gbW9kO1xyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgaWYgKG1vZCAhPSBudWxsKSBmb3IgKHZhciBrIGluIG1vZCkgaWYgKGsgIT09IFwiZGVmYXVsdFwiICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb2QsIGspKSBfX2NyZWF0ZUJpbmRpbmcocmVzdWx0LCBtb2QsIGspO1xyXG4gICAgX19zZXRNb2R1bGVEZWZhdWx0KHJlc3VsdCwgbW9kKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydERlZmF1bHQobW9kKSB7XHJcbiAgICByZXR1cm4gKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgPyBtb2QgOiB7IGRlZmF1bHQ6IG1vZCB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEdldChyZWNlaXZlciwgc3RhdGUsIGtpbmQsIGYpIHtcclxuICAgIGlmIChraW5kID09PSBcImFcIiAmJiAhZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlByaXZhdGUgYWNjZXNzb3Igd2FzIGRlZmluZWQgd2l0aG91dCBhIGdldHRlclwiKTtcclxuICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyICE9PSBzdGF0ZSB8fCAhZiA6ICFzdGF0ZS5oYXMocmVjZWl2ZXIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHJlYWQgcHJpdmF0ZSBtZW1iZXIgZnJvbSBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIGtpbmQgPT09IFwibVwiID8gZiA6IGtpbmQgPT09IFwiYVwiID8gZi5jYWxsKHJlY2VpdmVyKSA6IGYgPyBmLnZhbHVlIDogc3RhdGUuZ2V0KHJlY2VpdmVyKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fY2xhc3NQcml2YXRlRmllbGRTZXQocmVjZWl2ZXIsIHN0YXRlLCB2YWx1ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwibVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBtZXRob2QgaXMgbm90IHdyaXRhYmxlXCIpO1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgc2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3Qgd3JpdGUgcHJpdmF0ZSBtZW1iZXIgdG8gYW4gb2JqZWN0IHdob3NlIGNsYXNzIGRpZCBub3QgZGVjbGFyZSBpdFwiKTtcclxuICAgIHJldHVybiAoa2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIsIHZhbHVlKSA6IGYgPyBmLnZhbHVlID0gdmFsdWUgOiBzdGF0ZS5zZXQocmVjZWl2ZXIsIHZhbHVlKSksIHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEluKHN0YXRlLCByZWNlaXZlcikge1xyXG4gICAgaWYgKHJlY2VpdmVyID09PSBudWxsIHx8ICh0eXBlb2YgcmVjZWl2ZXIgIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHJlY2VpdmVyICE9PSBcImZ1bmN0aW9uXCIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHVzZSAnaW4nIG9wZXJhdG9yIG9uIG5vbi1vYmplY3RcIik7XHJcbiAgICByZXR1cm4gdHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciA9PT0gc3RhdGUgOiBzdGF0ZS5oYXMocmVjZWl2ZXIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hZGREaXNwb3NhYmxlUmVzb3VyY2UoZW52LCB2YWx1ZSwgYXN5bmMpIHtcclxuICAgIGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZSAhPT0gdm9pZCAwKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZC5cIik7XHJcbiAgICAgICAgdmFyIGRpc3Bvc2U7XHJcbiAgICAgICAgaWYgKGFzeW5jKSB7XHJcbiAgICAgICAgICAgIGlmICghU3ltYm9sLmFzeW5jRGlzcG9zZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5hc3luY0Rpc3Bvc2UgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgICAgICAgICBkaXNwb3NlID0gdmFsdWVbU3ltYm9sLmFzeW5jRGlzcG9zZV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChkaXNwb3NlID09PSB2b2lkIDApIHtcclxuICAgICAgICAgICAgaWYgKCFTeW1ib2wuZGlzcG9zZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5kaXNwb3NlIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgICAgICAgICAgZGlzcG9zZSA9IHZhbHVlW1N5bWJvbC5kaXNwb3NlXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHR5cGVvZiBkaXNwb3NlICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJPYmplY3Qgbm90IGRpc3Bvc2FibGUuXCIpO1xyXG4gICAgICAgIGVudi5zdGFjay5wdXNoKHsgdmFsdWU6IHZhbHVlLCBkaXNwb3NlOiBkaXNwb3NlLCBhc3luYzogYXN5bmMgfSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChhc3luYykge1xyXG4gICAgICAgIGVudi5zdGFjay5wdXNoKHsgYXN5bmM6IHRydWUgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdmFsdWU7XHJcbn1cclxuXHJcbnZhciBfU3VwcHJlc3NlZEVycm9yID0gdHlwZW9mIFN1cHByZXNzZWRFcnJvciA9PT0gXCJmdW5jdGlvblwiID8gU3VwcHJlc3NlZEVycm9yIDogZnVuY3Rpb24gKGVycm9yLCBzdXBwcmVzc2VkLCBtZXNzYWdlKSB7XHJcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihtZXNzYWdlKTtcclxuICAgIHJldHVybiBlLm5hbWUgPSBcIlN1cHByZXNzZWRFcnJvclwiLCBlLmVycm9yID0gZXJyb3IsIGUuc3VwcHJlc3NlZCA9IHN1cHByZXNzZWQsIGU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kaXNwb3NlUmVzb3VyY2VzKGVudikge1xyXG4gICAgZnVuY3Rpb24gZmFpbChlKSB7XHJcbiAgICAgICAgZW52LmVycm9yID0gZW52Lmhhc0Vycm9yID8gbmV3IF9TdXBwcmVzc2VkRXJyb3IoZSwgZW52LmVycm9yLCBcIkFuIGVycm9yIHdhcyBzdXBwcmVzc2VkIGR1cmluZyBkaXNwb3NhbC5cIikgOiBlO1xyXG4gICAgICAgIGVudi5oYXNFcnJvciA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBuZXh0KCkge1xyXG4gICAgICAgIHdoaWxlIChlbnYuc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHZhciByZWMgPSBlbnYuc3RhY2sucG9wKCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gcmVjLmRpc3Bvc2UgJiYgcmVjLmRpc3Bvc2UuY2FsbChyZWMudmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlYy5hc3luYykgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLnRoZW4obmV4dCwgZnVuY3Rpb24oZSkgeyBmYWlsKGUpOyByZXR1cm4gbmV4dCgpOyB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgZmFpbChlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZW52Lmhhc0Vycm9yKSB0aHJvdyBlbnYuZXJyb3I7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV4dCgpO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgICBfX2V4dGVuZHM6IF9fZXh0ZW5kcyxcclxuICAgIF9fYXNzaWduOiBfX2Fzc2lnbixcclxuICAgIF9fcmVzdDogX19yZXN0LFxyXG4gICAgX19kZWNvcmF0ZTogX19kZWNvcmF0ZSxcclxuICAgIF9fcGFyYW06IF9fcGFyYW0sXHJcbiAgICBfX21ldGFkYXRhOiBfX21ldGFkYXRhLFxyXG4gICAgX19hd2FpdGVyOiBfX2F3YWl0ZXIsXHJcbiAgICBfX2dlbmVyYXRvcjogX19nZW5lcmF0b3IsXHJcbiAgICBfX2NyZWF0ZUJpbmRpbmc6IF9fY3JlYXRlQmluZGluZyxcclxuICAgIF9fZXhwb3J0U3RhcjogX19leHBvcnRTdGFyLFxyXG4gICAgX192YWx1ZXM6IF9fdmFsdWVzLFxyXG4gICAgX19yZWFkOiBfX3JlYWQsXHJcbiAgICBfX3NwcmVhZDogX19zcHJlYWQsXHJcbiAgICBfX3NwcmVhZEFycmF5czogX19zcHJlYWRBcnJheXMsXHJcbiAgICBfX3NwcmVhZEFycmF5OiBfX3NwcmVhZEFycmF5LFxyXG4gICAgX19hd2FpdDogX19hd2FpdCxcclxuICAgIF9fYXN5bmNHZW5lcmF0b3I6IF9fYXN5bmNHZW5lcmF0b3IsXHJcbiAgICBfX2FzeW5jRGVsZWdhdG9yOiBfX2FzeW5jRGVsZWdhdG9yLFxyXG4gICAgX19hc3luY1ZhbHVlczogX19hc3luY1ZhbHVlcyxcclxuICAgIF9fbWFrZVRlbXBsYXRlT2JqZWN0OiBfX21ha2VUZW1wbGF0ZU9iamVjdCxcclxuICAgIF9faW1wb3J0U3RhcjogX19pbXBvcnRTdGFyLFxyXG4gICAgX19pbXBvcnREZWZhdWx0OiBfX2ltcG9ydERlZmF1bHQsXHJcbiAgICBfX2NsYXNzUHJpdmF0ZUZpZWxkR2V0OiBfX2NsYXNzUHJpdmF0ZUZpZWxkR2V0LFxyXG4gICAgX19jbGFzc1ByaXZhdGVGaWVsZFNldDogX19jbGFzc1ByaXZhdGVGaWVsZFNldCxcclxuICAgIF9fY2xhc3NQcml2YXRlRmllbGRJbjogX19jbGFzc1ByaXZhdGVGaWVsZEluLFxyXG4gICAgX19hZGREaXNwb3NhYmxlUmVzb3VyY2U6IF9fYWRkRGlzcG9zYWJsZVJlc291cmNlLFxyXG4gICAgX19kaXNwb3NlUmVzb3VyY2VzOiBfX2Rpc3Bvc2VSZXNvdXJjZXMsXHJcbn07XHJcbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBMaXN0TGluZSwgUG9zaXRpb24sIFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmUgaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ID0gdGhpcy5yb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGN1cnNvciA9IHRoaXMucm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXNJbmZvKCk7XG4gICAgY29uc3QgbGluZU5vID0gbGluZXMuZmluZEluZGV4KChsKSA9PiB7XG4gICAgICByZXR1cm4gKFxuICAgICAgICBjdXJzb3IuY2ggPT09IGwuZnJvbS5jaCArIGxpc3QuZ2V0Q2hlY2tib3hMZW5ndGgoKSAmJlxuICAgICAgICBjdXJzb3IubGluZSA9PT0gbC5mcm9tLmxpbmVcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpZiAobGluZU5vID09PSAwKSB7XG4gICAgICB0aGlzLm1vdmVDdXJzb3JUb1ByZXZpb3VzVW5mb2xkZWRJdGVtKHJvb3QsIGN1cnNvcik7XG4gICAgfSBlbHNlIGlmIChsaW5lTm8gPiAwKSB7XG4gICAgICB0aGlzLm1vdmVDdXJzb3JUb1ByZXZpb3VzTm90ZUxpbmUocm9vdCwgbGluZXMsIGxpbmVObyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlQ3Vyc29yVG9QcmV2aW91c05vdGVMaW5lKFxuICAgIHJvb3Q6IFJvb3QsXG4gICAgbGluZXM6IExpc3RMaW5lW10sXG4gICAgbGluZU5vOiBudW1iZXIsXG4gICkge1xuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgcm9vdC5yZXBsYWNlQ3Vyc29yKGxpbmVzW2xpbmVObyAtIDFdLnRvKTtcbiAgfVxuXG4gIHByaXZhdGUgbW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZEl0ZW0ocm9vdDogUm9vdCwgY3Vyc29yOiBQb3NpdGlvbikge1xuICAgIGNvbnN0IHByZXYgPSByb290LmdldExpc3RVbmRlckxpbmUoY3Vyc29yLmxpbmUgLSAxKTtcblxuICAgIGlmICghcHJldikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgaWYgKHByZXYuaXNGb2xkZWQoKSkge1xuICAgICAgY29uc3QgZm9sZFJvb3QgPSBwcmV2LmdldFRvcEZvbGRSb290KCk7XG4gICAgICBjb25zdCBmaXJzdExpbmVFbmQgPSBmb2xkUm9vdC5nZXRMaW5lc0luZm8oKVswXS50bztcbiAgICAgIHJvb3QucmVwbGFjZUN1cnNvcihmaXJzdExpbmVFbmQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByb290LnJlcGxhY2VDdXJzb3IocHJldi5nZXRMYXN0TGluZUNvbnRlbnRFbmQoKSk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3IsIGVkaXRvckluZm9GaWVsZCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQge1xuICBmb2xkRWZmZWN0LFxuICBmb2xkYWJsZSxcbiAgZm9sZGVkUmFuZ2VzLFxuICB1bmZvbGRFZmZlY3QsXG59IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcsIHJ1blNjb3BlSGFuZGxlcnMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5leHBvcnQgY2xhc3MgTXlFZGl0b3JQb3NpdGlvbiB7XG4gIGxpbmU6IG51bWJlcjtcbiAgY2g6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIE15RWRpdG9yUmFuZ2Uge1xuICBmcm9tOiBNeUVkaXRvclBvc2l0aW9uO1xuICB0bzogTXlFZGl0b3JQb3NpdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIE15RWRpdG9yU2VsZWN0aW9uIHtcbiAgYW5jaG9yOiBNeUVkaXRvclBvc2l0aW9uO1xuICBoZWFkOiBNeUVkaXRvclBvc2l0aW9uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWRpdG9yRnJvbVN0YXRlKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICBjb25zdCB7IGVkaXRvciB9ID0gc3RhdGUuZmllbGQoZWRpdG9ySW5mb0ZpZWxkKTtcblxuICBpZiAoIWVkaXRvcikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBNeUVkaXRvcihlZGl0b3IpO1xufVxuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGludGVyZmFjZSBXaW5kb3cge1xuICAgIE9ic2lkaWFuWm9vbVBsdWdpbj86IHtcbiAgICAgIGdldFpvb21SYW5nZShlOiBFZGl0b3IpOiBNeUVkaXRvclJhbmdlO1xuICAgICAgem9vbU91dChlOiBFZGl0b3IpOiB2b2lkO1xuICAgICAgem9vbUluKGU6IEVkaXRvciwgbGluZTogbnVtYmVyKTogdm9pZDtcbiAgICAgIHJlZnJlc2hab29tPyhlOiBFZGl0b3IpOiB2b2lkO1xuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gZm9sZEluc2lkZSh2aWV3OiBFZGl0b3JWaWV3LCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpIHtcbiAgbGV0IGZvdW5kOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gIGZvbGRlZFJhbmdlcyh2aWV3LnN0YXRlKS5iZXR3ZWVuKGZyb20sIHRvLCAoZnJvbSwgdG8pID0+IHtcbiAgICBpZiAoIWZvdW5kIHx8IGZvdW5kLmZyb20gPiBmcm9tKSBmb3VuZCA9IHsgZnJvbSwgdG8gfTtcbiAgfSk7XG4gIHJldHVybiBmb3VuZDtcbn1cblxuZXhwb3J0IGNsYXNzIE15RWRpdG9yIHtcbiAgcHJpdmF0ZSB2aWV3OiBFZGl0b3JWaWV3O1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZTogRWRpdG9yKSB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICB0aGlzLnZpZXcgPSAodGhpcy5lIGFzIGFueSkuY207XG4gIH1cblxuICBnZXRDdXJzb3IoKTogTXlFZGl0b3JQb3NpdGlvbiB7XG4gICAgcmV0dXJuIHRoaXMuZS5nZXRDdXJzb3IoKTtcbiAgfVxuXG4gIGdldExpbmUobjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5lLmdldExpbmUobik7XG4gIH1cblxuICBsYXN0TGluZSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmUubGFzdExpbmUoKTtcbiAgfVxuXG4gIGxpc3RTZWxlY3Rpb25zKCk6IE15RWRpdG9yU2VsZWN0aW9uW10ge1xuICAgIHJldHVybiB0aGlzLmUubGlzdFNlbGVjdGlvbnMoKTtcbiAgfVxuXG4gIGdldFJhbmdlKGZyb206IE15RWRpdG9yUG9zaXRpb24sIHRvOiBNeUVkaXRvclBvc2l0aW9uKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5lLmdldFJhbmdlKGZyb20sIHRvKTtcbiAgfVxuXG4gIHJlcGxhY2VSYW5nZShcbiAgICByZXBsYWNlbWVudDogc3RyaW5nLFxuICAgIGZyb206IE15RWRpdG9yUG9zaXRpb24sXG4gICAgdG86IE15RWRpdG9yUG9zaXRpb24sXG4gICk6IHZvaWQge1xuICAgIHJldHVybiB0aGlzLmUucmVwbGFjZVJhbmdlKHJlcGxhY2VtZW50LCBmcm9tLCB0byk7XG4gIH1cblxuICBzZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnM6IE15RWRpdG9yU2VsZWN0aW9uW10pOiB2b2lkIHtcbiAgICB0aGlzLmUuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcbiAgfVxuXG4gIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuZS5zZXRWYWx1ZSh0ZXh0KTtcbiAgfVxuXG4gIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuZS5nZXRWYWx1ZSgpO1xuICB9XG5cbiAgb2Zmc2V0VG9Qb3Mob2Zmc2V0OiBudW1iZXIpOiBNeUVkaXRvclBvc2l0aW9uIHtcbiAgICByZXR1cm4gdGhpcy5lLm9mZnNldFRvUG9zKG9mZnNldCk7XG4gIH1cblxuICBwb3NUb09mZnNldChwb3M6IE15RWRpdG9yUG9zaXRpb24pOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmUucG9zVG9PZmZzZXQocG9zKTtcbiAgfVxuXG4gIGZvbGQobjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgeyB2aWV3IH0gPSB0aGlzO1xuICAgIGNvbnN0IGwgPSB2aWV3LmxpbmVCbG9ja0F0KHZpZXcuc3RhdGUuZG9jLmxpbmUobiArIDEpLmZyb20pO1xuICAgIGNvbnN0IHJhbmdlID0gZm9sZGFibGUodmlldy5zdGF0ZSwgbC5mcm9tLCBsLnRvKTtcblxuICAgIGlmICghcmFuZ2UgfHwgcmFuZ2UuZnJvbSA9PT0gcmFuZ2UudG8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2aWV3LmRpc3BhdGNoKHsgZWZmZWN0czogW2ZvbGRFZmZlY3Qub2YocmFuZ2UpXSB9KTtcbiAgfVxuXG4gIHVuZm9sZChuOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB7IHZpZXcgfSA9IHRoaXM7XG4gICAgY29uc3QgbCA9IHZpZXcubGluZUJsb2NrQXQodmlldy5zdGF0ZS5kb2MubGluZShuICsgMSkuZnJvbSk7XG4gICAgY29uc3QgcmFuZ2UgPSBmb2xkSW5zaWRlKHZpZXcsIGwuZnJvbSwgbC50byk7XG5cbiAgICBpZiAoIXJhbmdlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmlldy5kaXNwYXRjaCh7IGVmZmVjdHM6IFt1bmZvbGRFZmZlY3Qub2YocmFuZ2UpXSB9KTtcbiAgfVxuXG4gIGdldEFsbEZvbGRlZExpbmVzKCk6IG51bWJlcltdIHtcbiAgICBjb25zdCBjID0gZm9sZGVkUmFuZ2VzKHRoaXMudmlldy5zdGF0ZSkuaXRlcigpO1xuICAgIGNvbnN0IHJlczogbnVtYmVyW10gPSBbXTtcbiAgICB3aGlsZSAoYy52YWx1ZSkge1xuICAgICAgcmVzLnB1c2godGhpcy5vZmZzZXRUb1BvcyhjLmZyb20pLmxpbmUpO1xuICAgICAgYy5uZXh0KCk7XG4gICAgfVxuICAgIHJldHVybiByZXM7XG4gIH1cblxuICB0cmlnZ2VyT25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBydW5TY29wZUhhbmRsZXJzKHRoaXMudmlldywgZSwgXCJlZGl0b3JcIik7XG4gIH1cblxuICBnZXRab29tUmFuZ2UoKTogTXlFZGl0b3JSYW5nZSB8IG51bGwge1xuICAgIGlmICghd2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHdpbmRvdy5PYnNpZGlhblpvb21QbHVnaW4uZ2V0Wm9vbVJhbmdlKHRoaXMuZSk7XG4gIH1cblxuICB6b29tT3V0KCkge1xuICAgIGlmICghd2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdpbmRvdy5PYnNpZGlhblpvb21QbHVnaW4uem9vbU91dCh0aGlzLmUpO1xuICB9XG5cbiAgem9vbUluKGxpbmU6IG51bWJlcikge1xuICAgIGlmICghd2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdpbmRvdy5PYnNpZGlhblpvb21QbHVnaW4uem9vbUluKHRoaXMuZSwgbGluZSk7XG4gIH1cblxuICB0cnlSZWZyZXNoWm9vbShsaW5lOiBudW1iZXIpIHtcbiAgICBpZiAoIXdpbmRvdy5PYnNpZGlhblpvb21QbHVnaW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAod2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbi5yZWZyZXNoWm9vbSkge1xuICAgICAgd2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbi5yZWZyZXNoWm9vbSh0aGlzLmUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB3aW5kb3cuT2JzaWRpYW5ab29tUGx1Z2luLnpvb21Jbih0aGlzLmUsIGxpbmUpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IE15RWRpdG9yLCBnZXRFZGl0b3JGcm9tU3RhdGUgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayhjb25maWc6IHtcbiAgY2hlY2s/OiAoZWRpdG9yOiBNeUVkaXRvcikgPT4gYm9vbGVhbjtcbiAgcnVuOiAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHNob3VsZFVwZGF0ZTogYm9vbGVhbjtcbiAgICBzaG91bGRTdG9wUHJvcGFnYXRpb246IGJvb2xlYW47XG4gIH07XG59KSB7XG4gIGNvbnN0IGNoZWNrID0gY29uZmlnLmNoZWNrIHx8ICgoKSA9PiB0cnVlKTtcbiAgY29uc3QgeyBydW4gfSA9IGNvbmZpZztcblxuICByZXR1cm4gKHZpZXc6IEVkaXRvclZpZXcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBlZGl0b3IgPSBnZXRFZGl0b3JGcm9tU3RhdGUodmlldy5zdGF0ZSk7XG5cbiAgICBpZiAoIWNoZWNrKGVkaXRvcikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNob3VsZFVwZGF0ZSwgc2hvdWxkU3RvcFByb3BhZ2F0aW9uIH0gPSBydW4oZWRpdG9yKTtcblxuICAgIHJldHVybiBzaG91bGRVcGRhdGUgfHwgc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmUgfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9Nb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkTGluZVwiO1xuaW1wb3J0IHsgSU1FRGV0ZWN0b3IgfSBmcm9tIFwiLi4vc2VydmljZXMvSU1FRGV0ZWN0b3JcIjtcbmltcG9ydCB7IE9wZXJhdGlvblBlcmZvcm1lciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PcGVyYXRpb25QZXJmb3JtZXJcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5pbXBvcnQgeyBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayB9IGZyb20gXCIuLi91dGlscy9jcmVhdGVLZXltYXBSdW5DYWxsYmFja1wiO1xuXG5leHBvcnQgY2xhc3MgQXJyb3dMZWZ0QW5kQ3RybEFycm93TGVmdEJlaGF2aW91ck92ZXJyaWRlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBpbWVEZXRlY3RvcjogSU1FRGV0ZWN0b3IsXG4gICAgcHJpdmF0ZSBvcGVyYXRpb25QZXJmb3JtZXI6IE9wZXJhdGlvblBlcmZvcm1lcixcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBrZXltYXAub2YoW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiBcIkFycm93TGVmdFwiLFxuICAgICAgICAgIHJ1bjogY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soe1xuICAgICAgICAgICAgY2hlY2s6IHRoaXMuY2hlY2ssXG4gICAgICAgICAgICBydW46IHRoaXMucnVuLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgd2luOiBcImMtQXJyb3dMZWZ0XCIsXG4gICAgICAgICAgbGludXg6IFwiYy1BcnJvd0xlZnRcIixcbiAgICAgICAgICBydW46IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIF0pLFxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuc2V0dGluZ3Mua2VlcEN1cnNvcldpdGhpbkNvbnRlbnQgIT09IFwibmV2ZXJcIiAmJlxuICAgICAgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKVxuICAgICk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5wZXJmb3JtKFxuICAgICAgKHJvb3QpID0+IG5ldyBNb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkTGluZShyb290KSxcbiAgICAgIGVkaXRvcixcbiAgICApO1xuICB9O1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIGNtcFBvcyhhOiBQb3NpdGlvbiwgYjogUG9zaXRpb24pIHtcbiAgcmV0dXJuIGEubGluZSAtIGIubGluZSB8fCBhLmNoIC0gYi5jaDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heFBvcyhhOiBQb3NpdGlvbiwgYjogUG9zaXRpb24pIHtcbiAgcmV0dXJuIGNtcFBvcyhhLCBiKSA8IDAgPyBiIDogYTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pblBvcyhhOiBQb3NpdGlvbiwgYjogUG9zaXRpb24pIHtcbiAgcmV0dXJuIGNtcFBvcyhhLCBiKSA8IDAgPyBhIDogYjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmFuZ2VzSW50ZXJzZWN0cyhcbiAgYTogW1Bvc2l0aW9uLCBQb3NpdGlvbl0sXG4gIGI6IFtQb3NpdGlvbiwgUG9zaXRpb25dLFxuKSB7XG4gIHJldHVybiBjbXBQb3MoYVsxXSwgYlswXSkgPj0gMCAmJiBjbXBQb3MoYVswXSwgYlsxXSkgPD0gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdDogUm9vdCkge1xuICBmdW5jdGlvbiB2aXNpdChwYXJlbnQ6IFJvb3QgfCBMaXN0KSB7XG4gICAgbGV0IGluZGV4ID0gMTtcblxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgcGFyZW50LmdldENoaWxkcmVuKCkpIHtcbiAgICAgIGlmICgvXFxkK1xcLi8udGVzdChjaGlsZC5nZXRCdWxsZXQoKSkpIHtcbiAgICAgICAgY2hpbGQucmVwbGF0ZUJ1bGxldChgJHtpbmRleCsrfS5gKTtcbiAgICAgIH1cblxuICAgICAgdmlzaXQoY2hpbGQpO1xuICAgIH1cbiAgfVxuXG4gIHZpc2l0KHJvb3QpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvc2l0aW9uIHtcbiAgY2g6IG51bWJlcjtcbiAgbGluZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpc3RMaW5lIHtcbiAgdGV4dDogc3RyaW5nO1xuICBmcm9tOiBQb3NpdGlvbjtcbiAgdG86IFBvc2l0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlIHtcbiAgYW5jaG9yOiBQb3NpdGlvbjtcbiAgaGVhZDogUG9zaXRpb247XG59XG5cbmxldCBpZFNlcSA9IDA7XG5cbmV4cG9ydCBjbGFzcyBMaXN0IHtcbiAgcHJpdmF0ZSBpZDogbnVtYmVyO1xuICBwcml2YXRlIHBhcmVudDogTGlzdCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGNoaWxkcmVuOiBMaXN0W10gPSBbXTtcbiAgcHJpdmF0ZSBub3Rlc0luZGVudDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByb290OiBSb290LFxuICAgIHByaXZhdGUgaW5kZW50OiBzdHJpbmcsXG4gICAgcHJpdmF0ZSBidWxsZXQ6IHN0cmluZyxcbiAgICBwcml2YXRlIG9wdGlvbmFsQ2hlY2tib3g6IHN0cmluZyxcbiAgICBwcml2YXRlIHNwYWNlQWZ0ZXJCdWxsZXQ6IHN0cmluZyxcbiAgICBmaXJzdExpbmU6IHN0cmluZyxcbiAgICBwcml2YXRlIGZvbGRSb290OiBib29sZWFuLFxuICApIHtcbiAgICB0aGlzLmlkID0gaWRTZXErKztcbiAgICB0aGlzLmxpbmVzLnB1c2goZmlyc3RMaW5lKTtcbiAgfVxuXG4gIGdldElEKCkge1xuICAgIHJldHVybiB0aGlzLmlkO1xuICB9XG5cbiAgZ2V0Tm90ZXNJbmRlbnQoKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMubm90ZXNJbmRlbnQ7XG4gIH1cblxuICBzZXROb3Rlc0luZGVudChub3Rlc0luZGVudDogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMubm90ZXNJbmRlbnQgIT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm90ZXMgaW5kZW50IGFscmVhZHkgcHJvdmlkZWRgKTtcbiAgICB9XG4gICAgdGhpcy5ub3Rlc0luZGVudCA9IG5vdGVzSW5kZW50O1xuICB9XG5cbiAgYWRkTGluZSh0ZXh0OiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5ub3Rlc0luZGVudCA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgVW5hYmxlIHRvIGFkZCBsaW5lLCBub3RlcyBpbmRlbnQgc2hvdWxkIGJlIHByb3ZpZGVkIGZpcnN0YCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpcy5saW5lcy5wdXNoKHRleHQpO1xuICB9XG5cbiAgcmVwbGFjZUxpbmVzKGxpbmVzOiBzdHJpbmdbXSkge1xuICAgIGlmIChsaW5lcy5sZW5ndGggPiAxICYmIHRoaXMubm90ZXNJbmRlbnQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFVuYWJsZSB0byBhZGQgbGluZSwgbm90ZXMgaW5kZW50IHNob3VsZCBiZSBwcm92aWRlZCBmaXJzdGAsXG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMubGluZXMgPSBsaW5lcztcbiAgfVxuXG4gIGdldExpbmVDb3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy5saW5lcy5sZW5ndGg7XG4gIH1cblxuICBnZXRSb290KCkge1xuICAgIHJldHVybiB0aGlzLnJvb3Q7XG4gIH1cblxuICBnZXRDaGlsZHJlbigpIHtcbiAgICByZXR1cm4gdGhpcy5jaGlsZHJlbi5jb25jYXQoKTtcbiAgfVxuXG4gIGdldExpbmVzSW5mbygpOiBMaXN0TGluZVtdIHtcbiAgICBjb25zdCBzdGFydExpbmUgPSB0aGlzLnJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZih0aGlzKVswXTtcblxuICAgIHJldHVybiB0aGlzLmxpbmVzLm1hcCgocm93LCBpKSA9PiB7XG4gICAgICBjb25zdCBsaW5lID0gc3RhcnRMaW5lICsgaTtcbiAgICAgIGNvbnN0IHN0YXJ0Q2ggPVxuICAgICAgICBpID09PSAwID8gdGhpcy5nZXRDb250ZW50U3RhcnRDaCgpIDogdGhpcy5ub3Rlc0luZGVudC5sZW5ndGg7XG4gICAgICBjb25zdCBlbmRDaCA9IHN0YXJ0Q2ggKyByb3cubGVuZ3RoO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICB0ZXh0OiByb3csXG4gICAgICAgIGZyb206IHsgbGluZSwgY2g6IHN0YXJ0Q2ggfSxcbiAgICAgICAgdG86IHsgbGluZSwgY2g6IGVuZENoIH0sXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0TGluZXMoKTogc3RyaW5nW10ge1xuICAgIHJldHVybiB0aGlzLmxpbmVzLmNvbmNhdCgpO1xuICB9XG5cbiAgZ2V0Rmlyc3RMaW5lQ29udGVudFN0YXJ0KCkge1xuICAgIGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMucm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKHRoaXMpWzBdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxpbmU6IHN0YXJ0TGluZSxcbiAgICAgIGNoOiB0aGlzLmdldENvbnRlbnRTdGFydENoKCksXG4gICAgfTtcbiAgfVxuXG4gIGdldEZpcnN0TGluZUNvbnRlbnRTdGFydEFmdGVyQ2hlY2tib3goKSB7XG4gICAgY29uc3Qgc3RhcnRMaW5lID0gdGhpcy5yb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YodGhpcylbMF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgbGluZTogc3RhcnRMaW5lLFxuICAgICAgY2g6IHRoaXMuZ2V0Q29udGVudFN0YXJ0Q2goKSArIHRoaXMuZ2V0Q2hlY2tib3hMZW5ndGgoKSxcbiAgICB9O1xuICB9XG5cbiAgZ2V0TGFzdExpbmVDb250ZW50RW5kKCkge1xuICAgIGNvbnN0IGVuZExpbmUgPSB0aGlzLnJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZih0aGlzKVsxXTtcbiAgICBjb25zdCBlbmRDaCA9XG4gICAgICB0aGlzLmxpbmVzLmxlbmd0aCA9PT0gMVxuICAgICAgICA/IHRoaXMuZ2V0Q29udGVudFN0YXJ0Q2goKSArIHRoaXMubGluZXNbMF0ubGVuZ3RoXG4gICAgICAgIDogdGhpcy5ub3Rlc0luZGVudC5sZW5ndGggKyB0aGlzLmxpbmVzW3RoaXMubGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxpbmU6IGVuZExpbmUsXG4gICAgICBjaDogZW5kQ2gsXG4gICAgfTtcbiAgfVxuXG4gIGdldENvbnRlbnRFbmRJbmNsdWRpbmdDaGlsZHJlbigpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMYXN0Q2hpbGQoKS5nZXRMYXN0TGluZUNvbnRlbnRFbmQoKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TGFzdENoaWxkKCkge1xuICAgIGxldCBsYXN0Q2hpbGQ6IExpc3QgPSB0aGlzO1xuXG4gICAgd2hpbGUgKCFsYXN0Q2hpbGQuaXNFbXB0eSgpKSB7XG4gICAgICBsYXN0Q2hpbGQgPSBsYXN0Q2hpbGQuZ2V0Q2hpbGRyZW4oKS5sYXN0KCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxhc3RDaGlsZDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q29udGVudFN0YXJ0Q2goKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5kZW50Lmxlbmd0aCArIHRoaXMuYnVsbGV0Lmxlbmd0aCArIDE7XG4gIH1cblxuICBpc0ZvbGRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5mb2xkUm9vdCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgICByZXR1cm4gdGhpcy5wYXJlbnQuaXNGb2xkZWQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpc0ZvbGRSb290KCkge1xuICAgIHJldHVybiB0aGlzLmZvbGRSb290O1xuICB9XG5cbiAgZ2V0VG9wRm9sZFJvb3QoKSB7XG4gICAgbGV0IHRtcDogTGlzdCA9IHRoaXM7XG4gICAgbGV0IGZvbGRSb290OiBMaXN0IHwgbnVsbCA9IG51bGw7XG4gICAgd2hpbGUgKHRtcCkge1xuICAgICAgaWYgKHRtcC5pc0ZvbGRSb290KCkpIHtcbiAgICAgICAgZm9sZFJvb3QgPSB0bXA7XG4gICAgICB9XG4gICAgICB0bXAgPSB0bXAucGFyZW50O1xuICAgIH1cbiAgICByZXR1cm4gZm9sZFJvb3Q7XG4gIH1cblxuICBnZXRMZXZlbCgpOiBudW1iZXIge1xuICAgIGlmICghdGhpcy5wYXJlbnQpIHtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnBhcmVudC5nZXRMZXZlbCgpICsgMTtcbiAgfVxuXG4gIHVuaW5kZW50Q29udGVudChmcm9tOiBudW1iZXIsIHRpbGw6IG51bWJlcikge1xuICAgIHRoaXMuaW5kZW50ID0gdGhpcy5pbmRlbnQuc2xpY2UoMCwgZnJvbSkgKyB0aGlzLmluZGVudC5zbGljZSh0aWxsKTtcbiAgICBpZiAodGhpcy5ub3Rlc0luZGVudCAhPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3Rlc0luZGVudCA9XG4gICAgICAgIHRoaXMubm90ZXNJbmRlbnQuc2xpY2UoMCwgZnJvbSkgKyB0aGlzLm5vdGVzSW5kZW50LnNsaWNlKHRpbGwpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuICAgICAgY2hpbGQudW5pbmRlbnRDb250ZW50KGZyb20sIHRpbGwpO1xuICAgIH1cbiAgfVxuXG4gIGluZGVudENvbnRlbnQoaW5kZW50UG9zOiBudW1iZXIsIGluZGVudENoYXJzOiBzdHJpbmcpIHtcbiAgICB0aGlzLmluZGVudCA9XG4gICAgICB0aGlzLmluZGVudC5zbGljZSgwLCBpbmRlbnRQb3MpICtcbiAgICAgIGluZGVudENoYXJzICtcbiAgICAgIHRoaXMuaW5kZW50LnNsaWNlKGluZGVudFBvcyk7XG4gICAgaWYgKHRoaXMubm90ZXNJbmRlbnQgIT09IG51bGwpIHtcbiAgICAgIHRoaXMubm90ZXNJbmRlbnQgPVxuICAgICAgICB0aGlzLm5vdGVzSW5kZW50LnNsaWNlKDAsIGluZGVudFBvcykgK1xuICAgICAgICBpbmRlbnRDaGFycyArXG4gICAgICAgIHRoaXMubm90ZXNJbmRlbnQuc2xpY2UoaW5kZW50UG9zKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4pIHtcbiAgICAgIGNoaWxkLmluZGVudENvbnRlbnQoaW5kZW50UG9zLCBpbmRlbnRDaGFycyk7XG4gICAgfVxuICB9XG5cbiAgZ2V0Rmlyc3RMaW5lSW5kZW50KCkge1xuICAgIHJldHVybiB0aGlzLmluZGVudDtcbiAgfVxuXG4gIGdldEJ1bGxldCgpIHtcbiAgICByZXR1cm4gdGhpcy5idWxsZXQ7XG4gIH1cblxuICBnZXRTcGFjZUFmdGVyQnVsbGV0KCkge1xuICAgIHJldHVybiB0aGlzLnNwYWNlQWZ0ZXJCdWxsZXQ7XG4gIH1cblxuICBnZXRDaGVja2JveExlbmd0aCgpIHtcbiAgICByZXR1cm4gdGhpcy5vcHRpb25hbENoZWNrYm94Lmxlbmd0aDtcbiAgfVxuXG4gIHJlcGxhdGVCdWxsZXQoYnVsbGV0OiBzdHJpbmcpIHtcbiAgICB0aGlzLmJ1bGxldCA9IGJ1bGxldDtcbiAgfVxuXG4gIGdldFBhcmVudCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYXJlbnQ7XG4gIH1cblxuICBhZGRCZWZvcmVBbGwobGlzdDogTGlzdCkge1xuICAgIHRoaXMuY2hpbGRyZW4udW5zaGlmdChsaXN0KTtcbiAgICBsaXN0LnBhcmVudCA9IHRoaXM7XG4gIH1cblxuICBhZGRBZnRlckFsbChsaXN0OiBMaXN0KSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGxpc3QpO1xuICAgIGxpc3QucGFyZW50ID0gdGhpcztcbiAgfVxuXG4gIHJlbW92ZUNoaWxkKGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGxpc3QpO1xuICAgIHRoaXMuY2hpbGRyZW4uc3BsaWNlKGksIDEpO1xuICAgIGxpc3QucGFyZW50ID0gbnVsbDtcbiAgfVxuXG4gIGFkZEJlZm9yZShiZWZvcmU6IExpc3QsIGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGJlZm9yZSk7XG4gICAgdGhpcy5jaGlsZHJlbi5zcGxpY2UoaSwgMCwgbGlzdCk7XG4gICAgbGlzdC5wYXJlbnQgPSB0aGlzO1xuICB9XG5cbiAgYWRkQWZ0ZXIoYmVmb3JlOiBMaXN0LCBsaXN0OiBMaXN0KSB7XG4gICAgY29uc3QgaSA9IHRoaXMuY2hpbGRyZW4uaW5kZXhPZihiZWZvcmUpO1xuICAgIHRoaXMuY2hpbGRyZW4uc3BsaWNlKGkgKyAxLCAwLCBsaXN0KTtcbiAgICBsaXN0LnBhcmVudCA9IHRoaXM7XG4gIH1cblxuICBnZXRQcmV2U2libGluZ09mKGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGxpc3QpO1xuICAgIHJldHVybiBpID4gMCA/IHRoaXMuY2hpbGRyZW5baSAtIDFdIDogbnVsbDtcbiAgfVxuXG4gIGdldE5leHRTaWJsaW5nT2YobGlzdDogTGlzdCkge1xuICAgIGNvbnN0IGkgPSB0aGlzLmNoaWxkcmVuLmluZGV4T2YobGlzdCk7XG4gICAgcmV0dXJuIGkgPj0gMCAmJiBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGggPyB0aGlzLmNoaWxkcmVuW2kgKyAxXSA6IG51bGw7XG4gIH1cblxuICBpc0VtcHR5KCkge1xuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcbiAgfVxuXG4gIHByaW50KCkge1xuICAgIGxldCByZXMgPSBcIlwiO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICByZXMgKz1cbiAgICAgICAgaSA9PT0gMFxuICAgICAgICAgID8gdGhpcy5pbmRlbnQgKyB0aGlzLmJ1bGxldCArIHRoaXMuc3BhY2VBZnRlckJ1bGxldFxuICAgICAgICAgIDogdGhpcy5ub3Rlc0luZGVudDtcbiAgICAgIHJlcyArPSB0aGlzLmxpbmVzW2ldO1xuICAgICAgcmVzICs9IFwiXFxuXCI7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG4gICAgICByZXMgKz0gY2hpbGQucHJpbnQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9XG5cbiAgY2xvbmUobmV3Um9vdDogUm9vdCkge1xuICAgIGNvbnN0IGNsb25lID0gbmV3IExpc3QoXG4gICAgICBuZXdSb290LFxuICAgICAgdGhpcy5pbmRlbnQsXG4gICAgICB0aGlzLmJ1bGxldCxcbiAgICAgIHRoaXMub3B0aW9uYWxDaGVja2JveCxcbiAgICAgIHRoaXMuc3BhY2VBZnRlckJ1bGxldCxcbiAgICAgIFwiXCIsXG4gICAgICB0aGlzLmZvbGRSb290LFxuICAgICk7XG4gICAgY2xvbmUuaWQgPSB0aGlzLmlkO1xuICAgIGNsb25lLmxpbmVzID0gdGhpcy5saW5lcy5jb25jYXQoKTtcbiAgICBjbG9uZS5ub3Rlc0luZGVudCA9IHRoaXMubm90ZXNJbmRlbnQ7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG4gICAgICBjbG9uZS5hZGRBZnRlckFsbChjaGlsZC5jbG9uZShuZXdSb290KSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNsb25lO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBSb290IHtcbiAgcHJpdmF0ZSByb290TGlzdCA9IG5ldyBMaXN0KHRoaXMsIFwiXCIsIFwiXCIsIFwiXCIsIFwiXCIsIFwiXCIsIGZhbHNlKTtcbiAgcHJpdmF0ZSBzZWxlY3Rpb25zOiBSYW5nZVtdID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBzdGFydDogUG9zaXRpb24sXG4gICAgcHJpdmF0ZSBlbmQ6IFBvc2l0aW9uLFxuICAgIHNlbGVjdGlvbnM6IFJhbmdlW10sXG4gICkge1xuICAgIHRoaXMucmVwbGFjZVNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG4gIH1cblxuICBnZXRSb290TGlzdCgpIHtcbiAgICByZXR1cm4gdGhpcy5yb290TGlzdDtcbiAgfVxuXG4gIGdldENvbnRlbnRSYW5nZSgpOiBbUG9zaXRpb24sIFBvc2l0aW9uXSB7XG4gICAgcmV0dXJuIFt0aGlzLmdldENvbnRlbnRTdGFydCgpLCB0aGlzLmdldENvbnRlbnRFbmQoKV07XG4gIH1cblxuICBnZXRDb250ZW50U3RhcnQoKTogUG9zaXRpb24ge1xuICAgIHJldHVybiB7IC4uLnRoaXMuc3RhcnQgfTtcbiAgfVxuXG4gIGdldENvbnRlbnRFbmQoKTogUG9zaXRpb24ge1xuICAgIHJldHVybiB7IC4uLnRoaXMuZW5kIH07XG4gIH1cblxuICBnZXRTZWxlY3Rpb25zKCk6IFJhbmdlW10ge1xuICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbnMubWFwKChzKSA9PiAoe1xuICAgICAgYW5jaG9yOiB7IC4uLnMuYW5jaG9yIH0sXG4gICAgICBoZWFkOiB7IC4uLnMuaGVhZCB9LFxuICAgIH0pKTtcbiAgfVxuXG4gIGhhc1NpbmdsZUN1cnNvcigpIHtcbiAgICBpZiAoIXRoaXMuaGFzU2luZ2xlU2VsZWN0aW9uKCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbnNbMF07XG5cbiAgICByZXR1cm4gKFxuICAgICAgc2VsZWN0aW9uLmFuY2hvci5saW5lID09PSBzZWxlY3Rpb24uaGVhZC5saW5lICYmXG4gICAgICBzZWxlY3Rpb24uYW5jaG9yLmNoID09PSBzZWxlY3Rpb24uaGVhZC5jaFxuICAgICk7XG4gIH1cblxuICBoYXNTaW5nbGVTZWxlY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9ucy5sZW5ndGggPT09IDE7XG4gIH1cblxuICBnZXRTZWxlY3Rpb24oKSB7XG4gICAgY29uc3Qgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb25zW3RoaXMuc2VsZWN0aW9ucy5sZW5ndGggLSAxXTtcblxuICAgIGNvbnN0IGZyb20gPVxuICAgICAgc2VsZWN0aW9uLmFuY2hvci5jaCA+IHNlbGVjdGlvbi5oZWFkLmNoXG4gICAgICAgID8gc2VsZWN0aW9uLmhlYWQuY2hcbiAgICAgICAgOiBzZWxlY3Rpb24uYW5jaG9yLmNoO1xuICAgIGNvbnN0IHRvID1cbiAgICAgIHNlbGVjdGlvbi5hbmNob3IuY2ggPiBzZWxlY3Rpb24uaGVhZC5jaFxuICAgICAgICA/IHNlbGVjdGlvbi5hbmNob3IuY2hcbiAgICAgICAgOiBzZWxlY3Rpb24uaGVhZC5jaDtcblxuICAgIHJldHVybiB7XG4gICAgICAuLi5zZWxlY3Rpb24sXG4gICAgICBmcm9tLFxuICAgICAgdG8sXG4gICAgfTtcbiAgfVxuXG4gIGdldEN1cnNvcigpIHtcbiAgICByZXR1cm4geyAuLi50aGlzLnNlbGVjdGlvbnNbdGhpcy5zZWxlY3Rpb25zLmxlbmd0aCAtIDFdLmhlYWQgfTtcbiAgfVxuXG4gIHJlcGxhY2VDdXJzb3IoY3Vyc29yOiBQb3NpdGlvbikge1xuICAgIHRoaXMuc2VsZWN0aW9ucyA9IFt7IGFuY2hvcjogY3Vyc29yLCBoZWFkOiBjdXJzb3IgfV07XG4gIH1cblxuICByZXBsYWNlU2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBSYW5nZVtdKSB7XG4gICAgaWYgKHNlbGVjdGlvbnMubGVuZ3RoIDwgMSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gY3JlYXRlIFJvb3Qgd2l0aG91dCBzZWxlY3Rpb25zYCk7XG4gICAgfVxuICAgIHRoaXMuc2VsZWN0aW9ucyA9IHNlbGVjdGlvbnM7XG4gIH1cblxuICBnZXRMaXN0VW5kZXJDdXJzb3IoKTogTGlzdCB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TGlzdFVuZGVyTGluZSh0aGlzLmdldEN1cnNvcigpLmxpbmUpO1xuICB9XG5cbiAgZ2V0TGlzdFVuZGVyTGluZShsaW5lOiBudW1iZXIpIHtcbiAgICBpZiAobGluZSA8IHRoaXMuc3RhcnQubGluZSB8fCBsaW5lID4gdGhpcy5lbmQubGluZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCByZXN1bHQ6IExpc3QgPSBudWxsO1xuICAgIGxldCBpbmRleDogbnVtYmVyID0gdGhpcy5zdGFydC5saW5lO1xuXG4gICAgY29uc3QgdmlzaXRBcnIgPSAobGw6IExpc3RbXSkgPT4ge1xuICAgICAgZm9yIChjb25zdCBsIG9mIGxsKSB7XG4gICAgICAgIGNvbnN0IGxpc3RGcm9tTGluZSA9IGluZGV4O1xuICAgICAgICBjb25zdCBsaXN0VGlsbExpbmUgPSBsaXN0RnJvbUxpbmUgKyBsLmdldExpbmVDb3VudCgpIC0gMTtcblxuICAgICAgICBpZiAobGluZSA+PSBsaXN0RnJvbUxpbmUgJiYgbGluZSA8PSBsaXN0VGlsbExpbmUpIHtcbiAgICAgICAgICByZXN1bHQgPSBsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGluZGV4ID0gbGlzdFRpbGxMaW5lICsgMTtcbiAgICAgICAgICB2aXNpdEFycihsLmdldENoaWxkcmVuKCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQgIT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmlzaXRBcnIodGhpcy5yb290TGlzdC5nZXRDaGlsZHJlbigpKTtcblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBnZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3Q6IExpc3QpOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbCB7XG4gICAgbGV0IHJlc3VsdDogW251bWJlciwgbnVtYmVyXSB8IG51bGwgPSBudWxsO1xuICAgIGxldCBsaW5lOiBudW1iZXIgPSB0aGlzLnN0YXJ0LmxpbmU7XG5cbiAgICBjb25zdCB2aXNpdEFyciA9IChsbDogTGlzdFtdKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGwgb2YgbGwpIHtcbiAgICAgICAgY29uc3QgbGlzdEZyb21MaW5lID0gbGluZTtcbiAgICAgICAgY29uc3QgbGlzdFRpbGxMaW5lID0gbGlzdEZyb21MaW5lICsgbC5nZXRMaW5lQ291bnQoKSAtIDE7XG5cbiAgICAgICAgaWYgKGwgPT09IGxpc3QpIHtcbiAgICAgICAgICByZXN1bHQgPSBbbGlzdEZyb21MaW5lLCBsaXN0VGlsbExpbmVdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpbmUgPSBsaXN0VGlsbExpbmUgKyAxO1xuICAgICAgICAgIHZpc2l0QXJyKGwuZ2V0Q2hpbGRyZW4oKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZpc2l0QXJyKHRoaXMucm9vdExpc3QuZ2V0Q2hpbGRyZW4oKSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZ2V0Q2hpbGRyZW4oKSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdExpc3QuZ2V0Q2hpbGRyZW4oKTtcbiAgfVxuXG4gIHByaW50KCkge1xuICAgIGxldCByZXMgPSBcIlwiO1xuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLnJvb3RMaXN0LmdldENoaWxkcmVuKCkpIHtcbiAgICAgIHJlcyArPSBjaGlsZC5wcmludCgpO1xuICAgIH1cblxuICAgIHJldHVybiByZXMucmVwbGFjZSgvXFxuJC8sIFwiXCIpO1xuICB9XG5cbiAgY2xvbmUoKSB7XG4gICAgY29uc3QgY2xvbmUgPSBuZXcgUm9vdChcbiAgICAgIHsgLi4udGhpcy5zdGFydCB9LFxuICAgICAgeyAuLi50aGlzLmVuZCB9LFxuICAgICAgdGhpcy5nZXRTZWxlY3Rpb25zKCksXG4gICAgKTtcbiAgICBjbG9uZS5yb290TGlzdCA9IHRoaXMucm9vdExpc3QuY2xvbmUoY2xvbmUpO1xuICAgIHJldHVybiBjbG9uZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7XG4gIExpc3QsXG4gIExpc3RMaW5lLFxuICBQb3NpdGlvbixcbiAgUm9vdCxcbiAgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyxcbn0gZnJvbSBcIi4uL3Jvb3RcIjtcblxuZXhwb3J0IGNsYXNzIERlbGV0ZVRpbGxQcmV2aW91c0xpbmVDb250ZW50RW5kIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXNJbmZvKCk7XG5cbiAgICBjb25zdCBsaW5lTm8gPSBsaW5lcy5maW5kSW5kZXgoXG4gICAgICAobCkgPT4gY3Vyc29yLmNoID09PSBsLmZyb20uY2ggJiYgY3Vyc29yLmxpbmUgPT09IGwuZnJvbS5saW5lLFxuICAgICk7XG5cbiAgICBpZiAobGluZU5vID09PSAwKSB7XG4gICAgICB0aGlzLm1lcmdlV2l0aFByZXZpb3VzSXRlbShyb290LCBjdXJzb3IsIGxpc3QpO1xuICAgIH0gZWxzZSBpZiAobGluZU5vID4gMCkge1xuICAgICAgdGhpcy5tZXJnZU5vdGVzKHJvb3QsIGN1cnNvciwgbGlzdCwgbGluZXMsIGxpbmVObyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtZXJnZU5vdGVzKFxuICAgIHJvb3Q6IFJvb3QsXG4gICAgY3Vyc29yOiBQb3NpdGlvbixcbiAgICBsaXN0OiBMaXN0LFxuICAgIGxpbmVzOiBMaXN0TGluZVtdLFxuICAgIGxpbmVObzogbnVtYmVyLFxuICApIHtcbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG4gICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IHByZXZMaW5lTm8gPSBsaW5lTm8gLSAxO1xuXG4gICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHtcbiAgICAgIGxpbmU6IGN1cnNvci5saW5lIC0gMSxcbiAgICAgIGNoOiBsaW5lc1twcmV2TGluZU5vXS50ZXh0Lmxlbmd0aCArIGxpbmVzW3ByZXZMaW5lTm9dLmZyb20uY2gsXG4gICAgfSk7XG5cbiAgICBsaW5lc1twcmV2TGluZU5vXS50ZXh0ICs9IGxpbmVzW2xpbmVOb10udGV4dDtcbiAgICBsaW5lcy5zcGxpY2UobGluZU5vLCAxKTtcblxuICAgIGxpc3QucmVwbGFjZUxpbmVzKGxpbmVzLm1hcCgobCkgPT4gbC50ZXh0KSk7XG4gIH1cblxuICBwcml2YXRlIG1lcmdlV2l0aFByZXZpb3VzSXRlbShyb290OiBSb290LCBjdXJzb3I6IFBvc2l0aW9uLCBsaXN0OiBMaXN0KSB7XG4gICAgaWYgKHJvb3QuZ2V0Q2hpbGRyZW4oKVswXSA9PT0gbGlzdCAmJiBsaXN0LmlzRW1wdHkoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcblxuICAgIGNvbnN0IHByZXYgPSByb290LmdldExpc3RVbmRlckxpbmUoY3Vyc29yLmxpbmUgLSAxKTtcblxuICAgIGlmICghcHJldikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGJvdGhBcmVFbXB0eSA9IHByZXYuaXNFbXB0eSgpICYmIGxpc3QuaXNFbXB0eSgpO1xuICAgIGNvbnN0IHByZXZJc0VtcHR5QW5kU2FtZUxldmVsID1cbiAgICAgIHByZXYuaXNFbXB0eSgpICYmICFsaXN0LmlzRW1wdHkoKSAmJiBwcmV2LmdldExldmVsKCkgPT09IGxpc3QuZ2V0TGV2ZWwoKTtcbiAgICBjb25zdCBsaXN0SXNFbXB0eUFuZFByZXZJc1BhcmVudCA9XG4gICAgICBsaXN0LmlzRW1wdHkoKSAmJiBwcmV2LmdldExldmVsKCkgPT09IGxpc3QuZ2V0TGV2ZWwoKSAtIDE7XG5cbiAgICBpZiAoYm90aEFyZUVtcHR5IHx8IHByZXZJc0VtcHR5QW5kU2FtZUxldmVsIHx8IGxpc3RJc0VtcHR5QW5kUHJldklzUGFyZW50KSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBwYXJlbnQgPSBsaXN0LmdldFBhcmVudCgpO1xuICAgICAgY29uc3QgcHJldkVuZCA9IHByZXYuZ2V0TGFzdExpbmVDb250ZW50RW5kKCk7XG5cbiAgICAgIGlmICghcHJldi5nZXROb3Rlc0luZGVudCgpICYmIGxpc3QuZ2V0Tm90ZXNJbmRlbnQoKSkge1xuICAgICAgICBwcmV2LnNldE5vdGVzSW5kZW50KFxuICAgICAgICAgIHByZXYuZ2V0Rmlyc3RMaW5lSW5kZW50KCkgK1xuICAgICAgICAgICAgbGlzdC5nZXROb3Rlc0luZGVudCgpLnNsaWNlKGxpc3QuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgb2xkTGluZXMgPSBwcmV2LmdldExpbmVzKCk7XG4gICAgICBjb25zdCBuZXdMaW5lcyA9IGxpc3QuZ2V0TGluZXMoKTtcbiAgICAgIG9sZExpbmVzW29sZExpbmVzLmxlbmd0aCAtIDFdICs9IG5ld0xpbmVzWzBdO1xuICAgICAgY29uc3QgcmVzdWx0TGluZXMgPSBvbGRMaW5lcy5jb25jYXQobmV3TGluZXMuc2xpY2UoMSkpO1xuXG4gICAgICBwcmV2LnJlcGxhY2VMaW5lcyhyZXN1bHRMaW5lcyk7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobGlzdCk7XG5cbiAgICAgIGZvciAoY29uc3QgYyBvZiBsaXN0LmdldENoaWxkcmVuKCkpIHtcbiAgICAgICAgbGlzdC5yZW1vdmVDaGlsZChjKTtcbiAgICAgICAgcHJldi5hZGRBZnRlckFsbChjKTtcbiAgICAgIH1cblxuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHByZXZFbmQpO1xuXG4gICAgICByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzKHJvb3QpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgRGVsZXRlVGlsbFByZXZpb3VzTGluZUNvbnRlbnRFbmQgfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9EZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZFwiO1xuaW1wb3J0IHsgSU1FRGV0ZWN0b3IgfSBmcm9tIFwiLi4vc2VydmljZXMvSU1FRGV0ZWN0b3JcIjtcbmltcG9ydCB7IE9wZXJhdGlvblBlcmZvcm1lciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PcGVyYXRpb25QZXJmb3JtZXJcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5pbXBvcnQgeyBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayB9IGZyb20gXCIuLi91dGlscy9jcmVhdGVLZXltYXBSdW5DYWxsYmFja1wiO1xuXG5leHBvcnQgY2xhc3MgQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIGltZURldGVjdG9yOiBJTUVEZXRlY3RvcixcbiAgICBwcml2YXRlIG9wZXJhdGlvblBlcmZvcm1lcjogT3BlcmF0aW9uUGVyZm9ybWVyLFxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIGtleW1hcC5vZihbXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6IFwiQmFja3NwYWNlXCIsXG4gICAgICAgICAgcnVuOiBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdKSxcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIGNoZWNrID0gKCkgPT4ge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLnNldHRpbmdzLmtlZXBDdXJzb3JXaXRoaW5Db250ZW50ICE9PSBcIm5ldmVyXCIgJiZcbiAgICAgICF0aGlzLmltZURldGVjdG9yLmlzT3BlbmVkKClcbiAgICApO1xuICB9O1xuXG4gIHByaXZhdGUgcnVuID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICByZXR1cm4gdGhpcy5vcGVyYXRpb25QZXJmb3JtZXIucGVyZm9ybShcbiAgICAgIChyb290KSA9PiBuZXcgRGVsZXRlVGlsbFByZXZpb3VzTGluZUNvbnRlbnRFbmQocm9vdCksXG4gICAgICBlZGl0b3IsXG4gICAgKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE9ic2lkaWFuU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvT2JzaWRpYW5TZXR0aW5nc1wiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NcIjtcblxuY29uc3QgQkVUVEVSX0xJU1RTX0JPRFlfQ0xBU1MgPSBcIm91dGxpbmVyLXBsdWdpbi1iZXR0ZXItbGlzdHNcIjtcblxuZXhwb3J0IGNsYXNzIEJldHRlckxpc3RzU3R5bGVzIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgdXBkYXRlQm9keUNsYXNzSW50ZXJ2YWw6IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3MsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMudXBkYXRlQm9keUNsYXNzKCk7XG4gICAgdGhpcy51cGRhdGVCb2R5Q2xhc3NJbnRlcnZhbCA9IHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICB0aGlzLnVwZGF0ZUJvZHlDbGFzcygpO1xuICAgIH0sIDEwMDApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge1xuICAgIGNsZWFySW50ZXJ2YWwodGhpcy51cGRhdGVCb2R5Q2xhc3NJbnRlcnZhbCk7XG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKEJFVFRFUl9MSVNUU19CT0RZX0NMQVNTKTtcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlQm9keUNsYXNzID0gKCkgPT4ge1xuICAgIGNvbnN0IHNob3VsZEV4aXN0cyA9XG4gICAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MuaXNEZWZhdWx0VGhlbWVFbmFibGVkKCkgJiZcbiAgICAgIHRoaXMuc2V0dGluZ3MuYmV0dGVyTGlzdHNTdHlsZXM7XG4gICAgY29uc3QgZXhpc3RzID0gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoQkVUVEVSX0xJU1RTX0JPRFlfQ0xBU1MpO1xuXG4gICAgaWYgKHNob3VsZEV4aXN0cyAmJiAhZXhpc3RzKSB7XG4gICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoQkVUVEVSX0xJU1RTX0JPRFlfQ0xBU1MpO1xuICAgIH1cblxuICAgIGlmICghc2hvdWxkRXhpc3RzICYmIGV4aXN0cykge1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKEJFVFRFUl9MSVNUU19CT0RZX0NMQVNTKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCwgbWF4UG9zLCBtaW5Qb3MgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgU2VsZWN0QWxsQ29udGVudCBpbXBsZW1lbnRzIE9wZXJhdGlvbiB7XG4gIHByaXZhdGUgc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gIHByaXZhdGUgdXBkYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcm9vdDogUm9vdCkge31cblxuICBzaG91bGRTdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcFByb3BhZ2F0aW9uO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZWQ7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGNvbnN0IHsgcm9vdCB9ID0gdGhpcztcblxuICAgIGlmICghcm9vdC5oYXNTaW5nbGVTZWxlY3Rpb24oKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHJvb3QuZ2V0U2VsZWN0aW9ucygpWzBdO1xuICAgIGNvbnN0IFtyb290U3RhcnQsIHJvb3RFbmRdID0gcm9vdC5nZXRDb250ZW50UmFuZ2UoKTtcblxuICAgIGNvbnN0IHNlbGVjdGlvbkZyb20gPSBtaW5Qb3Moc2VsZWN0aW9uLmFuY2hvciwgc2VsZWN0aW9uLmhlYWQpO1xuICAgIGNvbnN0IHNlbGVjdGlvblRvID0gbWF4UG9zKHNlbGVjdGlvbi5hbmNob3IsIHNlbGVjdGlvbi5oZWFkKTtcblxuICAgIGlmIChcbiAgICAgIHNlbGVjdGlvbkZyb20ubGluZSA8IHJvb3RTdGFydC5saW5lIHx8XG4gICAgICBzZWxlY3Rpb25Uby5saW5lID4gcm9vdEVuZC5saW5lXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgc2VsZWN0aW9uRnJvbS5saW5lID09PSByb290U3RhcnQubGluZSAmJlxuICAgICAgc2VsZWN0aW9uRnJvbS5jaCA9PT0gcm9vdFN0YXJ0LmNoICYmXG4gICAgICBzZWxlY3Rpb25Uby5saW5lID09PSByb290RW5kLmxpbmUgJiZcbiAgICAgIHNlbGVjdGlvblRvLmNoID09PSByb290RW5kLmNoXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgY29udGVudFN0YXJ0ID0gbGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnRBZnRlckNoZWNrYm94KCk7XG4gICAgY29uc3QgY29udGVudEVuZCA9IGxpc3QuZ2V0TGFzdExpbmVDb250ZW50RW5kKCk7XG4gICAgY29uc3QgbGlzdFVuZGVyU2VsZWN0aW9uRnJvbSA9IHJvb3QuZ2V0TGlzdFVuZGVyTGluZShzZWxlY3Rpb25Gcm9tLmxpbmUpO1xuICAgIGNvbnN0IGxpc3RTdGFydCA9XG4gICAgICBsaXN0VW5kZXJTZWxlY3Rpb25Gcm9tLmdldEZpcnN0TGluZUNvbnRlbnRTdGFydEFmdGVyQ2hlY2tib3goKTtcbiAgICBjb25zdCBsaXN0RW5kID0gbGlzdFVuZGVyU2VsZWN0aW9uRnJvbS5nZXRDb250ZW50RW5kSW5jbHVkaW5nQ2hpbGRyZW4oKTtcblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgaWYgKFxuICAgICAgc2VsZWN0aW9uRnJvbS5saW5lID09PSBjb250ZW50U3RhcnQubGluZSAmJlxuICAgICAgc2VsZWN0aW9uRnJvbS5jaCA9PT0gY29udGVudFN0YXJ0LmNoICYmXG4gICAgICBzZWxlY3Rpb25Uby5saW5lID09PSBjb250ZW50RW5kLmxpbmUgJiZcbiAgICAgIHNlbGVjdGlvblRvLmNoID09PSBjb250ZW50RW5kLmNoXG4gICAgKSB7XG4gICAgICBpZiAobGlzdC5nZXRDaGlsZHJlbigpLmxlbmd0aCkge1xuICAgICAgICAvLyBzZWxlY3Qgc3ViIGxpc3RzXG4gICAgICAgIHJvb3QucmVwbGFjZVNlbGVjdGlvbnMoW1xuICAgICAgICAgIHsgYW5jaG9yOiBjb250ZW50U3RhcnQsIGhlYWQ6IGxpc3QuZ2V0Q29udGVudEVuZEluY2x1ZGluZ0NoaWxkcmVuKCkgfSxcbiAgICAgICAgXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzZWxlY3Qgd2hvbGUgbGlzdFxuICAgICAgICByb290LnJlcGxhY2VTZWxlY3Rpb25zKFt7IGFuY2hvcjogcm9vdFN0YXJ0LCBoZWFkOiByb290RW5kIH1dKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKFxuICAgICAgbGlzdFN0YXJ0LmNoID09IHNlbGVjdGlvbkZyb20uY2ggJiZcbiAgICAgIGxpc3RFbmQubGluZSA9PSBzZWxlY3Rpb25Uby5saW5lICYmXG4gICAgICBsaXN0RW5kLmNoID09IHNlbGVjdGlvblRvLmNoXG4gICAgKSB7XG4gICAgICAvLyBzZWxlY3Qgd2hvbGUgbGlzdFxuICAgICAgcm9vdC5yZXBsYWNlU2VsZWN0aW9ucyhbeyBhbmNob3I6IHJvb3RTdGFydCwgaGVhZDogcm9vdEVuZCB9XSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIChzZWxlY3Rpb25Gcm9tLmxpbmUgPiBjb250ZW50U3RhcnQubGluZSB8fFxuICAgICAgICAoc2VsZWN0aW9uRnJvbS5saW5lID09IGNvbnRlbnRTdGFydC5saW5lICYmXG4gICAgICAgICAgc2VsZWN0aW9uRnJvbS5jaCA+PSBjb250ZW50U3RhcnQuY2gpKSAmJlxuICAgICAgKHNlbGVjdGlvblRvLmxpbmUgPCBjb250ZW50RW5kLmxpbmUgfHxcbiAgICAgICAgKHNlbGVjdGlvblRvLmxpbmUgPT0gY29udGVudEVuZC5saW5lICYmXG4gICAgICAgICAgc2VsZWN0aW9uVG8uY2ggPD0gY29udGVudEVuZC5jaCkpXG4gICAgKSB7XG4gICAgICAvLyBzZWxlY3Qgd2hvbGUgbGluZVxuICAgICAgcm9vdC5yZXBsYWNlU2VsZWN0aW9ucyhbeyBhbmNob3I6IGNvbnRlbnRTdGFydCwgaGVhZDogY29udGVudEVuZCB9XSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSBmYWxzZTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgU2VsZWN0QWxsQ29udGVudCB9IGZyb20gXCIuLi9vcGVyYXRpb25zL1NlbGVjdEFsbENvbnRlbnRcIjtcbmltcG9ydCB7IElNRURldGVjdG9yIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0lNRURldGVjdG9yXCI7XG5pbXBvcnQgeyBPcGVyYXRpb25QZXJmb3JtZXIgfSBmcm9tIFwiLi4vc2VydmljZXMvT3BlcmF0aW9uUGVyZm9ybWVyXCI7XG5pbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1wiO1xuaW1wb3J0IHsgY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2sgfSBmcm9tIFwiLi4vdXRpbHMvY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2tcIjtcblxuZXhwb3J0IGNsYXNzIEN0cmxBQW5kQ21kQUJlaGF2aW91ck92ZXJyaWRlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBpbWVEZXRlY3RvcjogSU1FRGV0ZWN0b3IsXG4gICAgcHJpdmF0ZSBvcGVyYXRpb25QZXJmb3JtZXI6IE9wZXJhdGlvblBlcmZvcm1lcixcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBrZXltYXAub2YoW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiBcImMtYVwiLFxuICAgICAgICAgIG1hYzogXCJtLWFcIixcbiAgICAgICAgICBydW46IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIF0pLFxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuc2V0dGluZ3Mub3ZlcnJpZGVTZWxlY3RBbGxCZWhhdmlvdXIgJiYgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKVxuICAgICk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5wZXJmb3JtKFxuICAgICAgKHJvb3QpID0+IG5ldyBTZWxlY3RBbGxDb250ZW50KHJvb3QpLFxuICAgICAgZWRpdG9yLFxuICAgICk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBEZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZCB9IGZyb20gXCIuL0RlbGV0ZVRpbGxQcmV2aW91c0xpbmVDb250ZW50RW5kXCI7XG5pbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVUaWxsTmV4dExpbmVDb250ZW50U3RhcnQgaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIGRlbGV0ZVRpbGxQcmV2aW91c0xpbmVDb250ZW50RW5kOiBEZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHtcbiAgICB0aGlzLmRlbGV0ZVRpbGxQcmV2aW91c0xpbmVDb250ZW50RW5kID1cbiAgICAgIG5ldyBEZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZChyb290KTtcbiAgfVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZC5zaG91bGRTdG9wUHJvcGFnYXRpb24oKTtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVUaWxsUHJldmlvdXNMaW5lQ29udGVudEVuZC5zaG91bGRVcGRhdGUoKTtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXNJbmZvKCk7XG5cbiAgICBjb25zdCBsaW5lTm8gPSBsaW5lcy5maW5kSW5kZXgoXG4gICAgICAobCkgPT4gY3Vyc29yLmNoID09PSBsLnRvLmNoICYmIGN1cnNvci5saW5lID09PSBsLnRvLmxpbmUsXG4gICAgKTtcblxuICAgIGlmIChsaW5lTm8gPT09IGxpbmVzLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG5leHRMaW5lID0gbGluZXNbbGluZU5vXS50by5saW5lICsgMTtcbiAgICAgIGNvbnN0IG5leHRMaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJMaW5lKG5leHRMaW5lKTtcbiAgICAgIGlmICghbmV4dExpc3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKG5leHRMaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpKTtcbiAgICAgIHRoaXMuZGVsZXRlVGlsbFByZXZpb3VzTGluZUNvbnRlbnRFbmQucGVyZm9ybSgpO1xuICAgIH0gZWxzZSBpZiAobGluZU5vID49IDApIHtcbiAgICAgIHJvb3QucmVwbGFjZUN1cnNvcihsaW5lc1tsaW5lTm8gKyAxXS5mcm9tKTtcbiAgICAgIHRoaXMuZGVsZXRlVGlsbFByZXZpb3VzTGluZUNvbnRlbnRFbmQucGVyZm9ybSgpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgRGVsZXRlVGlsbE5leHRMaW5lQ29udGVudFN0YXJ0IH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvRGVsZXRlVGlsbE5leHRMaW5lQ29udGVudFN0YXJ0XCI7XG5pbXBvcnQgeyBJTUVEZXRlY3RvciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVEZXRlY3RvclwiO1xuaW1wb3J0IHsgT3BlcmF0aW9uUGVyZm9ybWVyIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09wZXJhdGlvblBlcmZvcm1lclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NcIjtcbmltcG9ydCB7IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrIH0gZnJvbSBcIi4uL3V0aWxzL2NyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrXCI7XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVCZWhhdmlvdXJPdmVycmlkZSBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogUGx1Z2luLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzLFxuICAgIHByaXZhdGUgaW1lRGV0ZWN0b3I6IElNRURldGVjdG9yLFxuICAgIHByaXZhdGUgb3BlcmF0aW9uUGVyZm9ybWVyOiBPcGVyYXRpb25QZXJmb3JtZXIsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAga2V5bWFwLm9mKFtcbiAgICAgICAge1xuICAgICAgICAgIGtleTogXCJEZWxldGVcIixcbiAgICAgICAgICBydW46IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIF0pLFxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuc2V0dGluZ3Mua2VlcEN1cnNvcldpdGhpbkNvbnRlbnQgIT09IFwibmV2ZXJcIiAmJlxuICAgICAgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKVxuICAgICk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5wZXJmb3JtKFxuICAgICAgKHJvb3QpID0+IG5ldyBEZWxldGVUaWxsTmV4dExpbmVDb250ZW50U3RhcnQocm9vdCksXG4gICAgICBlZGl0b3IsXG4gICAgKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBMaXN0LCBSb290LCByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzIH0gZnJvbSBcIi4uL3Jvb3RcIjtcblxuaW50ZXJmYWNlIEN1cnNvckFuY2hvciB7XG4gIGN1cnNvckxpc3Q6IExpc3Q7XG4gIGxpbmVEaWZmOiBudW1iZXI7XG4gIGNoRGlmZjogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTW92ZUxpc3RUb0RpZmZlcmVudFBvc2l0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByb290OiBSb290LFxuICAgIHByaXZhdGUgbGlzdFRvTW92ZTogTGlzdCxcbiAgICBwcml2YXRlIHBsYWNlVG9Nb3ZlOiBMaXN0LFxuICAgIHByaXZhdGUgd2hlcmVUb01vdmU6IFwiYmVmb3JlXCIgfCBcImFmdGVyXCIgfCBcImluc2lkZVwiLFxuICAgIHByaXZhdGUgZGVmYXVsdEluZGVudENoYXJzOiBzdHJpbmcsXG4gICkge31cblxuICBzaG91bGRTdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcFByb3BhZ2F0aW9uO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZWQ7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGlmICh0aGlzLmxpc3RUb01vdmUgPT09IHRoaXMucGxhY2VUb01vdmUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG4gICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IGN1cnNvckFuY2hvciA9IHRoaXMuY2FsY3VsYXRlQ3Vyc29yQW5jaG9yKCk7XG4gICAgdGhpcy5tb3ZlTGlzdCgpO1xuICAgIHRoaXMuY2hhbmdlSW5kZW50KCk7XG4gICAgdGhpcy5yZXN0b3JlQ3Vyc29yKGN1cnNvckFuY2hvcik7XG4gICAgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyh0aGlzLnJvb3QpO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVDdXJzb3JBbmNob3IoKTogQ3Vyc29yQW5jaG9yIHtcbiAgICBjb25zdCBjdXJzb3JMaW5lID0gdGhpcy5yb290LmdldEN1cnNvcigpLmxpbmU7XG5cbiAgICBjb25zdCBsaW5lcyA9IFtcbiAgICAgIHRoaXMubGlzdFRvTW92ZS5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lLFxuICAgICAgdGhpcy5saXN0VG9Nb3ZlLmdldExhc3RMaW5lQ29udGVudEVuZCgpLmxpbmUsXG4gICAgICB0aGlzLnBsYWNlVG9Nb3ZlLmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpLmxpbmUsXG4gICAgICB0aGlzLnBsYWNlVG9Nb3ZlLmdldExhc3RMaW5lQ29udGVudEVuZCgpLmxpbmUsXG4gICAgXTtcbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lID0gTWF0aC5taW4oLi4ubGluZXMpO1xuICAgIGNvbnN0IGxpc3RFbmRMaW5lID0gTWF0aC5tYXgoLi4ubGluZXMpO1xuXG4gICAgaWYgKGN1cnNvckxpbmUgPCBsaXN0U3RhcnRMaW5lIHx8IGN1cnNvckxpbmUgPiBsaXN0RW5kTGluZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY3Vyc29yID0gdGhpcy5yb290LmdldEN1cnNvcigpO1xuICAgIGNvbnN0IGN1cnNvckxpc3QgPSB0aGlzLnJvb3QuZ2V0TGlzdFVuZGVyTGluZShjdXJzb3IubGluZSk7XG4gICAgY29uc3QgY3Vyc29yTGlzdFN0YXJ0ID0gY3Vyc29yTGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKTtcbiAgICBjb25zdCBsaW5lRGlmZiA9IGN1cnNvci5saW5lIC0gY3Vyc29yTGlzdFN0YXJ0LmxpbmU7XG4gICAgY29uc3QgY2hEaWZmID0gY3Vyc29yLmNoIC0gY3Vyc29yTGlzdFN0YXJ0LmNoO1xuXG4gICAgcmV0dXJuIHsgY3Vyc29yTGlzdCwgbGluZURpZmYsIGNoRGlmZiB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlTGlzdCgpIHtcbiAgICB0aGlzLmxpc3RUb01vdmUuZ2V0UGFyZW50KCkucmVtb3ZlQ2hpbGQodGhpcy5saXN0VG9Nb3ZlKTtcblxuICAgIHN3aXRjaCAodGhpcy53aGVyZVRvTW92ZSkge1xuICAgICAgY2FzZSBcImJlZm9yZVwiOlxuICAgICAgICB0aGlzLnBsYWNlVG9Nb3ZlXG4gICAgICAgICAgLmdldFBhcmVudCgpXG4gICAgICAgICAgLmFkZEJlZm9yZSh0aGlzLnBsYWNlVG9Nb3ZlLCB0aGlzLmxpc3RUb01vdmUpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBcImFmdGVyXCI6XG4gICAgICAgIHRoaXMucGxhY2VUb01vdmVcbiAgICAgICAgICAuZ2V0UGFyZW50KClcbiAgICAgICAgICAuYWRkQWZ0ZXIodGhpcy5wbGFjZVRvTW92ZSwgdGhpcy5saXN0VG9Nb3ZlKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgXCJpbnNpZGVcIjpcbiAgICAgICAgdGhpcy5wbGFjZVRvTW92ZS5hZGRCZWZvcmVBbGwodGhpcy5saXN0VG9Nb3ZlKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjaGFuZ2VJbmRlbnQoKSB7XG4gICAgY29uc3Qgb2xkSW5kZW50ID0gdGhpcy5saXN0VG9Nb3ZlLmdldEZpcnN0TGluZUluZGVudCgpO1xuICAgIGNvbnN0IG5ld0luZGVudCA9XG4gICAgICB0aGlzLndoZXJlVG9Nb3ZlID09PSBcImluc2lkZVwiXG4gICAgICAgID8gdGhpcy5wbGFjZVRvTW92ZS5nZXRGaXJzdExpbmVJbmRlbnQoKSArIHRoaXMuZGVmYXVsdEluZGVudENoYXJzXG4gICAgICAgIDogdGhpcy5wbGFjZVRvTW92ZS5nZXRGaXJzdExpbmVJbmRlbnQoKTtcbiAgICB0aGlzLmxpc3RUb01vdmUudW5pbmRlbnRDb250ZW50KDAsIG9sZEluZGVudC5sZW5ndGgpO1xuICAgIHRoaXMubGlzdFRvTW92ZS5pbmRlbnRDb250ZW50KDAsIG5ld0luZGVudCk7XG4gIH1cblxuICBwcml2YXRlIHJlc3RvcmVDdXJzb3IoY3Vyc29yQW5jaG9yOiBDdXJzb3JBbmNob3IpIHtcbiAgICBpZiAoY3Vyc29yQW5jaG9yKSB7XG4gICAgICBjb25zdCBjdXJzb3JMaXN0U3RhcnQgPVxuICAgICAgICBjdXJzb3JBbmNob3IuY3Vyc29yTGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKTtcblxuICAgICAgdGhpcy5yb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgICBsaW5lOiBjdXJzb3JMaXN0U3RhcnQubGluZSArIGN1cnNvckFuY2hvci5saW5lRGlmZixcbiAgICAgICAgY2g6IGN1cnNvckxpc3RTdGFydC5jaCArIGN1cnNvckFuY2hvci5jaERpZmYsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gV2hlbiB5b3UgbW92ZSBhIGxpc3QsIHRoZSBzY3JlZW4gc2Nyb2xscyB0byB0aGUgY3Vyc29yLlxuICAgICAgLy8gSXQgaXMgYmV0dGVyIHRvIG1vdmUgdGhlIGN1cnNvciBpbnRvIHRoZSB2aWV3cG9ydCB0aGFuIGxldCB0aGUgc2NyZWVuIHNjcm9sbC5cbiAgICAgIHRoaXMucm9vdC5yZXBsYWNlQ3Vyc29yKHRoaXMubGlzdFRvTW92ZS5nZXRMYXN0TGluZUNvbnRlbnRFbmQoKSk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBOb3RpY2UsIFBsYXRmb3JtLCBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgZ2V0SW5kZW50VW5pdCwgaW5kZW50U3RyaW5nIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBTdGF0ZUVmZmVjdCwgU3RhdGVGaWVsZCB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRGVjb3JhdGlvbiwgRGVjb3JhdGlvblNldCwgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yLCBnZXRFZGl0b3JGcm9tU3RhdGUgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5pbXBvcnQgeyBNb3ZlTGlzdFRvRGlmZmVyZW50UG9zaXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9Nb3ZlTGlzdFRvRGlmZmVyZW50UG9zaXRpb25cIjtcbmltcG9ydCB7IExpc3QsIFJvb3QsIGNtcFBvcyB9IGZyb20gXCIuLi9yb290XCI7XG5pbXBvcnQgeyBPYnNpZGlhblNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2V0dGluZ3NcIjtcbmltcG9ydCB7IE9wZXJhdGlvblBlcmZvcm1lciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PcGVyYXRpb25QZXJmb3JtZXJcIjtcbmltcG9ydCB7IFBhcnNlciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9QYXJzZXJcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5cbmNvbnN0IEJPRFlfQ0xBU1MgPSBcIm91dGxpbmVyLXBsdWdpbi1kbmRcIjtcblxuZXhwb3J0IGNsYXNzIERyYWdBbmREcm9wIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgZHJvcFpvbmU6IEhUTUxEaXZFbGVtZW50O1xuICBwcml2YXRlIGRyb3Bab25lUGFkZGluZzogSFRNTERpdkVsZW1lbnQ7XG4gIHByaXZhdGUgcHJlU3RhcnQ6IERyYWdBbmREcm9wUHJlU3RhcnRTdGF0ZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRlOiBEcmFnQW5kRHJvcFN0YXRlIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIG9iaXNpZGlhbjogT2JzaWRpYW5TZXR0aW5ncyxcbiAgICBwcml2YXRlIHBhcnNlcjogUGFyc2VyLFxuICAgIHByaXZhdGUgb3BlcmF0aW9uUGVyZm9ybWVyOiBPcGVyYXRpb25QZXJmb3JtZXIsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFtcbiAgICAgIGRyYWdnaW5nTGluZXNTdGF0ZUZpZWxkLFxuICAgICAgZHJvcHBpbmdMaW5lc1N0YXRlRmllbGQsXG4gICAgXSk7XG4gICAgdGhpcy5lbmFibGVGZWF0dXJlVG9nZ2xlKCk7XG4gICAgdGhpcy5jcmVhdGVEcm9wWm9uZSgpO1xuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcnMoKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHtcbiAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXJzKCk7XG4gICAgdGhpcy5yZW1vdmVEcm9wWm9uZSgpO1xuICAgIHRoaXMuZGlzYWJsZUZlYXR1cmVUb2dnbGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgZW5hYmxlRmVhdHVyZVRvZ2dsZSgpIHtcbiAgICB0aGlzLnNldHRpbmdzLm9uQ2hhbmdlKHRoaXMuaGFuZGxlU2V0dGluZ3NDaGFuZ2UpO1xuICAgIHRoaXMuaGFuZGxlU2V0dGluZ3NDaGFuZ2UoKTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzYWJsZUZlYXR1cmVUb2dnbGUoKSB7XG4gICAgdGhpcy5zZXR0aW5ncy5yZW1vdmVDYWxsYmFjayh0aGlzLmhhbmRsZVNldHRpbmdzQ2hhbmdlKTtcbiAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoQk9EWV9DTEFTUyk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZURyb3Bab25lKCkge1xuICAgIHRoaXMuZHJvcFpvbmVQYWRkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aGlzLmRyb3Bab25lUGFkZGluZy5jbGFzc0xpc3QuYWRkKFwib3V0bGluZXItcGx1Z2luLWRyb3Atem9uZS1wYWRkaW5nXCIpO1xuICAgIHRoaXMuZHJvcFpvbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRoaXMuZHJvcFpvbmUuY2xhc3NMaXN0LmFkZChcIm91dGxpbmVyLXBsdWdpbi1kcm9wLXpvbmVcIik7XG4gICAgdGhpcy5kcm9wWm9uZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgdGhpcy5kcm9wWm9uZS5hcHBlbmRDaGlsZCh0aGlzLmRyb3Bab25lUGFkZGluZyk7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmRyb3Bab25lKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3ZlRHJvcFpvbmUoKSB7XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLmRyb3Bab25lKTtcbiAgICB0aGlzLmRyb3Bab25lUGFkZGluZyA9IG51bGw7XG4gICAgdGhpcy5kcm9wWm9uZSA9IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCkge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgdGhpcy5oYW5kbGVNb3VzZURvd24sIHtcbiAgICAgIGNhcHR1cmU6IHRydWUsXG4gICAgfSk7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCB0aGlzLmhhbmRsZU1vdXNlTW92ZSk7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgdGhpcy5oYW5kbGVNb3VzZVVwKTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCB0aGlzLmhhbmRsZUtleURvd24pO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVFdmVudExpc3RlbmVycygpIHtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIHRoaXMuaGFuZGxlTW91c2VEb3duLCB7XG4gICAgICBjYXB0dXJlOiB0cnVlLFxuICAgIH0pO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5oYW5kbGVNb3VzZU1vdmUpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuaGFuZGxlTW91c2VVcCk7XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgdGhpcy5oYW5kbGVLZXlEb3duKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlU2V0dGluZ3NDaGFuZ2UgPSAoKSA9PiB7XG4gICAgaWYgKCFpc0ZlYXR1cmVTdXBwb3J0ZWQoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNldHRpbmdzLmRyYWdBbmREcm9wKSB7XG4gICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoQk9EWV9DTEFTUyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShCT0RZX0NMQVNTKTtcbiAgICB9XG4gIH07XG5cbiAgcHJpdmF0ZSBoYW5kbGVNb3VzZURvd24gPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgIGlmIChcbiAgICAgICFpc0ZlYXR1cmVTdXBwb3J0ZWQoKSB8fFxuICAgICAgIXRoaXMuc2V0dGluZ3MuZHJhZ0FuZERyb3AgfHxcbiAgICAgICFpc0NsaWNrT25CdWxsZXQoZSlcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB2aWV3ID0gZ2V0RWRpdG9yVmlld0Zyb21IVE1MRWxlbWVudChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCk7XG4gICAgaWYgKCF2aWV3KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICB0aGlzLnByZVN0YXJ0ID0ge1xuICAgICAgeDogZS54LFxuICAgICAgeTogZS55LFxuICAgICAgdmlldyxcbiAgICB9O1xuICB9O1xuXG4gIHByaXZhdGUgaGFuZGxlTW91c2VNb3ZlID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICBpZiAodGhpcy5wcmVTdGFydCkge1xuICAgICAgdGhpcy5zdGFydERyYWdnaW5nKCk7XG4gICAgfVxuICAgIGlmICh0aGlzLnN0YXRlKSB7XG4gICAgICB0aGlzLmRldGVjdEFuZERyYXdEcm9wWm9uZShlLngsIGUueSk7XG4gICAgfVxuICB9O1xuXG4gIHByaXZhdGUgaGFuZGxlTW91c2VVcCA9ICgpID0+IHtcbiAgICBpZiAodGhpcy5wcmVTdGFydCkge1xuICAgICAgdGhpcy5wcmVTdGFydCA9IG51bGw7XG4gICAgfVxuICAgIGlmICh0aGlzLnN0YXRlKSB7XG4gICAgICB0aGlzLnN0b3BEcmFnZ2luZygpO1xuICAgIH1cbiAgfTtcblxuICBwcml2YXRlIGhhbmRsZUtleURvd24gPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgIGlmICh0aGlzLnN0YXRlICYmIGUuY29kZSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgdGhpcy5jYW5jZWxEcmFnZ2luZygpO1xuICAgIH1cbiAgfTtcblxuICBwcml2YXRlIHN0YXJ0RHJhZ2dpbmcoKSB7XG4gICAgY29uc3QgeyB4LCB5LCB2aWV3IH0gPSB0aGlzLnByZVN0YXJ0O1xuICAgIHRoaXMucHJlU3RhcnQgPSBudWxsO1xuXG4gICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yRnJvbVN0YXRlKHZpZXcuc3RhdGUpO1xuICAgIGNvbnN0IHBvcyA9IGVkaXRvci5vZmZzZXRUb1Bvcyh2aWV3LnBvc0F0Q29vcmRzKHsgeCwgeSB9KSk7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMucGFyc2VyLnBhcnNlKGVkaXRvciwgcG9zKTtcbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJMaW5lKHBvcy5saW5lKTtcbiAgICBjb25zdCBzdGF0ZSA9IG5ldyBEcmFnQW5kRHJvcFN0YXRlKHZpZXcsIGVkaXRvciwgcm9vdCwgbGlzdCk7XG5cbiAgICBpZiAoIXN0YXRlLmhhc0Ryb3BWYXJpYW50cygpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIHRoaXMuaGlnaGxpZ2h0RHJhZ2dpbmdMaW5lcygpO1xuICB9XG5cbiAgcHJpdmF0ZSBkZXRlY3RBbmREcmF3RHJvcFpvbmUoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICB0aGlzLnN0YXRlLmNhbGN1bGF0ZU5lYXJlc3REcm9wVmFyaWFudCh4LCB5KTtcbiAgICB0aGlzLmRyYXdEcm9wWm9uZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBjYW5jZWxEcmFnZ2luZygpIHtcbiAgICB0aGlzLnN0YXRlLmRyb3BWYXJpYW50ID0gbnVsbDtcbiAgICB0aGlzLnN0b3BEcmFnZ2luZygpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdG9wRHJhZ2dpbmcoKSB7XG4gICAgdGhpcy51bmhpZ2h0bGlnaHREcmFnZ2luZ0xpbmVzKCk7XG4gICAgdGhpcy5oaWRlRHJvcFpvbmUoKTtcbiAgICB0aGlzLmFwcGx5Q2hhbmdlcygpO1xuICAgIHRoaXMuc3RhdGUgPSBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseUNoYW5nZXMoKSB7XG4gICAgaWYgKCF0aGlzLnN0YXRlLmRyb3BWYXJpYW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgeyBzdGF0ZSB9ID0gdGhpcztcbiAgICBjb25zdCB7IGRyb3BWYXJpYW50LCBlZGl0b3IsIHJvb3QsIGxpc3QgfSA9IHN0YXRlO1xuXG4gICAgY29uc3QgbmV3Um9vdCA9IHRoaXMucGFyc2VyLnBhcnNlKGVkaXRvciwgcm9vdC5nZXRDb250ZW50U3RhcnQoKSk7XG4gICAgaWYgKCFpc1NhbWVSb290cyhyb290LCBuZXdSb290KSkge1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgYFRoZSBpdGVtIGNhbm5vdCBiZSBtb3ZlZC4gVGhlIHBhZ2UgY29udGVudCBjaGFuZ2VkIGR1cmluZyB0aGUgbW92ZS5gLFxuICAgICAgICA1MDAwLFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5ldmFsKFxuICAgICAgcm9vdCxcbiAgICAgIG5ldyBNb3ZlTGlzdFRvRGlmZmVyZW50UG9zaXRpb24oXG4gICAgICAgIHJvb3QsXG4gICAgICAgIGxpc3QsXG4gICAgICAgIGRyb3BWYXJpYW50LnBsYWNlVG9Nb3ZlLFxuICAgICAgICBkcm9wVmFyaWFudC53aGVyZVRvTW92ZSxcbiAgICAgICAgdGhpcy5vYmlzaWRpYW4uZ2V0RGVmYXVsdEluZGVudENoYXJzKCksXG4gICAgICApLFxuICAgICAgZWRpdG9yLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGhpZ2hsaWdodERyYWdnaW5nTGluZXMoKSB7XG4gICAgY29uc3QgeyBzdGF0ZSB9ID0gdGhpcztcbiAgICBjb25zdCB7IGxpc3QsIGVkaXRvciwgdmlldyB9ID0gc3RhdGU7XG5cbiAgICBjb25zdCBsaW5lcyA9IFtdO1xuICAgIGNvbnN0IGZyb21MaW5lID0gbGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lO1xuICAgIGNvbnN0IHRpbGxMaW5lID0gbGlzdC5nZXRDb250ZW50RW5kSW5jbHVkaW5nQ2hpbGRyZW4oKS5saW5lO1xuICAgIGZvciAobGV0IGkgPSBmcm9tTGluZTsgaSA8PSB0aWxsTGluZTsgaSsrKSB7XG4gICAgICBsaW5lcy5wdXNoKGVkaXRvci5wb3NUb09mZnNldCh7IGxpbmU6IGksIGNoOiAwIH0pKTtcbiAgICB9XG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICBlZmZlY3RzOiBbZG5kU3RhcnRlZC5vZihsaW5lcyldLFxuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKFwib3V0bGluZXItcGx1Z2luLWRyYWdnaW5nXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB1bmhpZ2h0bGlnaHREcmFnZ2luZ0xpbmVzKCkge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShcIm91dGxpbmVyLXBsdWdpbi1kcmFnZ2luZ1wiKTtcblxuICAgIHRoaXMuc3RhdGUudmlldy5kaXNwYXRjaCh7XG4gICAgICBlZmZlY3RzOiBbZG5kRW5kZWQub2YoKV0sXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGRyYXdEcm9wWm9uZSgpIHtcbiAgICBjb25zdCB7IHN0YXRlIH0gPSB0aGlzO1xuICAgIGNvbnN0IHsgdmlldywgZWRpdG9yLCBkcm9wVmFyaWFudCB9ID0gc3RhdGU7XG5cbiAgICBjb25zdCBuZXdQYXJlbnQgPVxuICAgICAgZHJvcFZhcmlhbnQud2hlcmVUb01vdmUgPT09IFwiaW5zaWRlXCJcbiAgICAgICAgPyBkcm9wVmFyaWFudC5wbGFjZVRvTW92ZVxuICAgICAgICA6IGRyb3BWYXJpYW50LnBsYWNlVG9Nb3ZlLmdldFBhcmVudCgpO1xuICAgIGNvbnN0IG5ld1BhcmVudElzUm9vdExpc3QgPSAhbmV3UGFyZW50LmdldFBhcmVudCgpO1xuXG4gICAge1xuICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLnJvdW5kKFxuICAgICAgICB2aWV3LmNvbnRlbnRET00ub2Zmc2V0V2lkdGggLVxuICAgICAgICAgIChkcm9wVmFyaWFudC5sZWZ0IC0gdGhpcy5zdGF0ZS5sZWZ0UGFkZGluZyksXG4gICAgICApO1xuXG4gICAgICB0aGlzLmRyb3Bab25lLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICB0aGlzLmRyb3Bab25lLnN0eWxlLnRvcCA9IGRyb3BWYXJpYW50LnRvcCArIFwicHhcIjtcbiAgICAgIHRoaXMuZHJvcFpvbmUuc3R5bGUubGVmdCA9IGRyb3BWYXJpYW50LmxlZnQgKyBcInB4XCI7XG4gICAgICB0aGlzLmRyb3Bab25lLnN0eWxlLndpZHRoID0gd2lkdGggKyBcInB4XCI7XG4gICAgfVxuXG4gICAge1xuICAgICAgY29uc3QgbGV2ZWwgPSBuZXdQYXJlbnQuZ2V0TGV2ZWwoKTtcbiAgICAgIGNvbnN0IGluZGVudFdpZHRoID0gdGhpcy5zdGF0ZS50YWJXaWR0aDtcbiAgICAgIGNvbnN0IHdpZHRoID0gaW5kZW50V2lkdGggKiBsZXZlbDtcbiAgICAgIGNvbnN0IGRhc2hQYWRkaW5nID0gMztcbiAgICAgIGNvbnN0IGRhc2hXaWR0aCA9IGluZGVudFdpZHRoIC0gZGFzaFBhZGRpbmc7XG4gICAgICBjb25zdCBjb2xvciA9IGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkuZ2V0UHJvcGVydHlWYWx1ZShcbiAgICAgICAgXCItLWNvbG9yLWFjY2VudFwiLFxuICAgICAgKTtcblxuICAgICAgdGhpcy5kcm9wWm9uZVBhZGRpbmcuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG4gICAgICB0aGlzLmRyb3Bab25lUGFkZGluZy5zdHlsZS5tYXJnaW5MZWZ0ID0gYC0ke3dpZHRofXB4YDtcbiAgICAgIHRoaXMuZHJvcFpvbmVQYWRkaW5nLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IGB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbCwlM0NzdmclMjB2aWV3Qm94JTNEJTIyMCUyMDAlMjAke3dpZHRofSUyMDQlMjIlMjB4bWxucyUzRCUyMmh0dHAlM0ElMkYlMkZ3d3cudzMub3JnJTJGMjAwMCUyRnN2ZyUyMiUzRSUzQ2xpbmUlMjB4MSUzRCUyMjAlMjIlMjB5MSUzRCUyMjAlMjIlMjB4MiUzRCUyMiR7d2lkdGh9JTIyJTIweTIlM0QlMjIwJTIyJTIwc3Ryb2tlJTNEJTIyJHtjb2xvcn0lMjIlMjBzdHJva2Utd2lkdGglM0QlMjI4JTIyJTIwc3Ryb2tlLWRhc2hhcnJheSUzRCUyMiR7ZGFzaFdpZHRofSUyMCR7ZGFzaFBhZGRpbmd9JTIyJTJGJTNFJTNDJTJGc3ZnJTNFJylgO1xuICAgIH1cblxuICAgIHRoaXMuc3RhdGUudmlldy5kaXNwYXRjaCh7XG4gICAgICBlZmZlY3RzOiBbXG4gICAgICAgIGRuZE1vdmVkLm9mKFxuICAgICAgICAgIG5ld1BhcmVudElzUm9vdExpc3RcbiAgICAgICAgICAgID8gbnVsbFxuICAgICAgICAgICAgOiBlZGl0b3IucG9zVG9PZmZzZXQoe1xuICAgICAgICAgICAgICAgIGxpbmU6IG5ld1BhcmVudC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lLFxuICAgICAgICAgICAgICAgIGNoOiAwLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGhpZGVEcm9wWm9uZSgpIHtcbiAgICB0aGlzLmRyb3Bab25lLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgfVxufVxuXG5pbnRlcmZhY2UgRHJvcFZhcmlhbnQge1xuICBsaW5lOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGxlZnQ6IG51bWJlcjtcbiAgdG9wOiBudW1iZXI7XG4gIHBsYWNlVG9Nb3ZlOiBMaXN0O1xuICB3aGVyZVRvTW92ZTogXCJhZnRlclwiIHwgXCJiZWZvcmVcIiB8IFwiaW5zaWRlXCI7XG59XG5cbmludGVyZmFjZSBEcmFnQW5kRHJvcFByZVN0YXJ0U3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdmlldzogRWRpdG9yVmlldztcbn1cblxuY2xhc3MgRHJhZ0FuZERyb3BTdGF0ZSB7XG4gIHByaXZhdGUgZHJvcFZhcmlhbnRzOiBNYXA8c3RyaW5nLCBEcm9wVmFyaWFudD4gPSBuZXcgTWFwKCk7XG4gIHB1YmxpYyBkcm9wVmFyaWFudDogRHJvcFZhcmlhbnQgPSBudWxsO1xuICBwdWJsaWMgbGVmdFBhZGRpbmcgPSAwO1xuICBwdWJsaWMgdGFiV2lkdGggPSAwO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIHB1YmxpYyByZWFkb25seSBlZGl0b3I6IE15RWRpdG9yLFxuICAgIHB1YmxpYyByZWFkb25seSByb290OiBSb290LFxuICAgIHB1YmxpYyByZWFkb25seSBsaXN0OiBMaXN0LFxuICApIHtcbiAgICB0aGlzLmNvbGxlY3REcm9wVmFyaWFudHMoKTtcbiAgICB0aGlzLmNhbGN1bGF0ZUxlZnRQYWRkaW5nKCk7XG4gICAgdGhpcy5jYWxjdWxhdGVUYWJXaWR0aCgpO1xuICB9XG5cbiAgZ2V0RHJvcFZhcmlhbnRzKCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuZHJvcFZhcmlhbnRzLnZhbHVlcygpKTtcbiAgfVxuXG4gIGhhc0Ryb3BWYXJpYW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5kcm9wVmFyaWFudHMuc2l6ZSA+IDA7XG4gIH1cblxuICBjYWxjdWxhdGVOZWFyZXN0RHJvcFZhcmlhbnQoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICBjb25zdCB7IHZpZXcsIGVkaXRvciB9ID0gdGhpcztcblxuICAgIGNvbnN0IGRyb3BWYXJpYW50cyA9IHRoaXMuZ2V0RHJvcFZhcmlhbnRzKCk7XG5cbiAgICBmb3IgKGNvbnN0IHYgb2YgZHJvcFZhcmlhbnRzKSB7XG4gICAgICBjb25zdCB7IHBsYWNlVG9Nb3ZlIH0gPSB2O1xuXG4gICAgICB2LmxlZnQgPSB0aGlzLmxlZnRQYWRkaW5nICsgKHYubGV2ZWwgLSAxKSAqIHRoaXMudGFiV2lkdGg7XG5cbiAgICAgIGNvbnN0IHBvc2l0aW9uQWZ0ZXJMaXN0ID1cbiAgICAgICAgdi53aGVyZVRvTW92ZSA9PT0gXCJhZnRlclwiIHx8IHYud2hlcmVUb01vdmUgPT09IFwiaW5zaWRlXCI7XG4gICAgICBjb25zdCBsaW5lID0gcG9zaXRpb25BZnRlckxpc3RcbiAgICAgICAgPyBwbGFjZVRvTW92ZS5nZXRDb250ZW50RW5kSW5jbHVkaW5nQ2hpbGRyZW4oKS5saW5lXG4gICAgICAgIDogcGxhY2VUb01vdmUuZ2V0Rmlyc3RMaW5lQ29udGVudFN0YXJ0KCkubGluZTtcbiAgICAgIGNvbnN0IGxpbmVQb3MgPSBlZGl0b3IucG9zVG9PZmZzZXQoe1xuICAgICAgICBsaW5lLFxuICAgICAgICBjaDogMCxcbiAgICAgIH0pO1xuXG4gICAgICB2LnRvcCA9IHZpZXcuY29vcmRzQXRQb3MobGluZVBvcywgLTEpLnRvcDtcblxuICAgICAgaWYgKHBvc2l0aW9uQWZ0ZXJMaXN0KSB7XG4gICAgICAgIHYudG9wICs9IHZpZXcubGluZUJsb2NrQXQobGluZVBvcykuaGVpZ2h0O1xuICAgICAgfVxuXG4gICAgICAvLyBCZXR0ZXIgdmVydGljYWwgYWxpZ25tZW50XG4gICAgICB2LnRvcCAtPSA4O1xuICAgIH1cblxuICAgIGNvbnN0IG5lYXJlc3RMaW5lVG9wID0gZHJvcFZhcmlhbnRzXG4gICAgICAuc29ydCgoYSwgYikgPT4gTWF0aC5hYnMoeSAtIGEudG9wKSAtIE1hdGguYWJzKHkgLSBiLnRvcCkpXG4gICAgICAuZmlyc3QoKS50b3A7XG5cbiAgICBjb25zdCB2YXJpYW5zT25OZWFyZXN0TGluZSA9IGRyb3BWYXJpYW50cy5maWx0ZXIoXG4gICAgICAodikgPT4gTWF0aC5hYnModi50b3AgLSBuZWFyZXN0TGluZVRvcCkgPD0gNCxcbiAgICApO1xuXG4gICAgdGhpcy5kcm9wVmFyaWFudCA9IHZhcmlhbnNPbk5lYXJlc3RMaW5lXG4gICAgICAuc29ydCgoYSwgYikgPT4gTWF0aC5hYnMoeCAtIGEubGVmdCkgLSBNYXRoLmFicyh4IC0gYi5sZWZ0KSlcbiAgICAgIC5maXJzdCgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhZGREcm9wVmFyaWFudCh2OiBEcm9wVmFyaWFudCkge1xuICAgIHRoaXMuZHJvcFZhcmlhbnRzLnNldChgJHt2LmxpbmV9ICR7di5sZXZlbH1gLCB2KTtcbiAgfVxuXG4gIHByaXZhdGUgY29sbGVjdERyb3BWYXJpYW50cygpIHtcbiAgICBjb25zdCB2aXNpdCA9IChsaXN0czogTGlzdFtdKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IHBsYWNlVG9Nb3ZlIG9mIGxpc3RzKSB7XG4gICAgICAgIGNvbnN0IGxpbmVCZWZvcmUgPSBwbGFjZVRvTW92ZS5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lO1xuICAgICAgICBjb25zdCBsaW5lQWZ0ZXIgPSBwbGFjZVRvTW92ZS5nZXRDb250ZW50RW5kSW5jbHVkaW5nQ2hpbGRyZW4oKS5saW5lICsgMTtcblxuICAgICAgICBjb25zdCBsZXZlbCA9IHBsYWNlVG9Nb3ZlLmdldExldmVsKCk7XG5cbiAgICAgICAgdGhpcy5hZGREcm9wVmFyaWFudCh7XG4gICAgICAgICAgbGluZTogbGluZUJlZm9yZSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBsZWZ0OiAwLFxuICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICBwbGFjZVRvTW92ZSxcbiAgICAgICAgICB3aGVyZVRvTW92ZTogXCJiZWZvcmVcIixcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuYWRkRHJvcFZhcmlhbnQoe1xuICAgICAgICAgIGxpbmU6IGxpbmVBZnRlcixcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBsZWZ0OiAwLFxuICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICBwbGFjZVRvTW92ZSxcbiAgICAgICAgICB3aGVyZVRvTW92ZTogXCJhZnRlclwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocGxhY2VUb01vdmUgPT09IHRoaXMubGlzdCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBsYWNlVG9Nb3ZlLmlzRW1wdHkoKSkge1xuICAgICAgICAgIHRoaXMuYWRkRHJvcFZhcmlhbnQoe1xuICAgICAgICAgICAgbGluZTogbGluZUFmdGVyLFxuICAgICAgICAgICAgbGV2ZWw6IGxldmVsICsgMSxcbiAgICAgICAgICAgIGxlZnQ6IDAsXG4gICAgICAgICAgICB0b3A6IDAsXG4gICAgICAgICAgICBwbGFjZVRvTW92ZSxcbiAgICAgICAgICAgIHdoZXJlVG9Nb3ZlOiBcImluc2lkZVwiLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZpc2l0KHBsYWNlVG9Nb3ZlLmdldENoaWxkcmVuKCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZpc2l0KHRoaXMucm9vdC5nZXRDaGlsZHJlbigpKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlTGVmdFBhZGRpbmcoKSB7XG4gICAgdGhpcy5sZWZ0UGFkZGluZyA9IHRoaXMudmlldy5jb29yZHNBdFBvcygwLCAtMSkubGVmdDtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlVGFiV2lkdGgoKSB7XG4gICAgY29uc3QgeyB2aWV3IH0gPSB0aGlzO1xuXG4gICAgY29uc3Qgc2luZ2xlSW5kZW50ID0gaW5kZW50U3RyaW5nKHZpZXcuc3RhdGUsIGdldEluZGVudFVuaXQodmlldy5zdGF0ZSkpO1xuXG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gdmlldy5zdGF0ZS5kb2MubGluZXM7IGkrKykge1xuICAgICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoaSk7XG5cbiAgICAgIGlmIChsaW5lLnRleHQuc3RhcnRzV2l0aChzaW5nbGVJbmRlbnQpKSB7XG4gICAgICAgIGNvbnN0IGEgPSB2aWV3LmNvb3Jkc0F0UG9zKGxpbmUuZnJvbSwgLTEpO1xuICAgICAgICBjb25zdCBiID0gdmlldy5jb29yZHNBdFBvcyhsaW5lLmZyb20gKyBzaW5nbGVJbmRlbnQubGVuZ3RoLCAtMSk7XG4gICAgICAgIHRoaXMudGFiV2lkdGggPSBiLmxlZnQgLSBhLmxlZnQ7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnRhYldpZHRoID0gdmlldy5kZWZhdWx0Q2hhcmFjdGVyV2lkdGggKiBnZXRJbmRlbnRVbml0KHZpZXcuc3RhdGUpO1xuICB9XG59XG5cbmNvbnN0IGRuZFN0YXJ0ZWQgPSBTdGF0ZUVmZmVjdC5kZWZpbmU8bnVtYmVyW10+KHtcbiAgbWFwOiAobGluZXMsIGNoYW5nZSkgPT4gbGluZXMubWFwKChsKSA9PiBjaGFuZ2UubWFwUG9zKGwpKSxcbn0pO1xuXG5jb25zdCBkbmRNb3ZlZCA9IFN0YXRlRWZmZWN0LmRlZmluZTxudW1iZXIgfCBudWxsPih7XG4gIG1hcDogKGxpbmUsIGNoYW5nZSkgPT4gKGxpbmUgIT09IG51bGwgPyBjaGFuZ2UubWFwUG9zKGxpbmUpIDogbGluZSksXG59KTtcblxuY29uc3QgZG5kRW5kZWQgPSBTdGF0ZUVmZmVjdC5kZWZpbmU8dm9pZD4oKTtcblxuY29uc3QgZHJhZ2dpbmdMaW5lRGVjb3JhdGlvbiA9IERlY29yYXRpb24ubGluZSh7XG4gIGNsYXNzOiBcIm91dGxpbmVyLXBsdWdpbi1kcmFnZ2luZy1saW5lXCIsXG59KTtcblxuY29uc3QgZHJvcHBpbmdMaW5lRGVjb3JhdGlvbiA9IERlY29yYXRpb24ubGluZSh7XG4gIGNsYXNzOiBcIm91dGxpbmVyLXBsdWdpbi1kcm9wcGluZy1saW5lXCIsXG59KTtcblxuY29uc3QgZHJhZ2dpbmdMaW5lc1N0YXRlRmllbGQgPSBTdGF0ZUZpZWxkLmRlZmluZTxEZWNvcmF0aW9uU2V0Pih7XG4gIGNyZWF0ZTogKCkgPT4gRGVjb3JhdGlvbi5ub25lLFxuXG4gIHVwZGF0ZTogKGRuZFN0YXRlLCB0cikgPT4ge1xuICAgIGRuZFN0YXRlID0gZG5kU3RhdGUubWFwKHRyLmNoYW5nZXMpO1xuXG4gICAgZm9yIChjb25zdCBlIG9mIHRyLmVmZmVjdHMpIHtcbiAgICAgIGlmIChlLmlzKGRuZFN0YXJ0ZWQpKSB7XG4gICAgICAgIGRuZFN0YXRlID0gZG5kU3RhdGUudXBkYXRlKHtcbiAgICAgICAgICBhZGQ6IGUudmFsdWUubWFwKChsKSA9PiBkcmFnZ2luZ0xpbmVEZWNvcmF0aW9uLnJhbmdlKGwsIGwpKSxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChlLmlzKGRuZEVuZGVkKSkge1xuICAgICAgICBkbmRTdGF0ZSA9IERlY29yYXRpb24ubm9uZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZG5kU3RhdGU7XG4gIH0sXG5cbiAgcHJvdmlkZTogKGYpID0+IEVkaXRvclZpZXcuZGVjb3JhdGlvbnMuZnJvbShmKSxcbn0pO1xuXG5jb25zdCBkcm9wcGluZ0xpbmVzU3RhdGVGaWVsZCA9IFN0YXRlRmllbGQuZGVmaW5lPERlY29yYXRpb25TZXQ+KHtcbiAgY3JlYXRlOiAoKSA9PiBEZWNvcmF0aW9uLm5vbmUsXG5cbiAgdXBkYXRlOiAoZG5kRHJvcHBpbmdTdGF0ZSwgdHIpID0+IHtcbiAgICBkbmREcm9wcGluZ1N0YXRlID0gZG5kRHJvcHBpbmdTdGF0ZS5tYXAodHIuY2hhbmdlcyk7XG5cbiAgICBmb3IgKGNvbnN0IGUgb2YgdHIuZWZmZWN0cykge1xuICAgICAgaWYgKGUuaXMoZG5kTW92ZWQpKSB7XG4gICAgICAgIGRuZERyb3BwaW5nU3RhdGUgPVxuICAgICAgICAgIGUudmFsdWUgPT09IG51bGxcbiAgICAgICAgICAgID8gRGVjb3JhdGlvbi5ub25lXG4gICAgICAgICAgICA6IERlY29yYXRpb24uc2V0KGRyb3BwaW5nTGluZURlY29yYXRpb24ucmFuZ2UoZS52YWx1ZSwgZS52YWx1ZSkpO1xuICAgICAgfVxuXG4gICAgICBpZiAoZS5pcyhkbmRFbmRlZCkpIHtcbiAgICAgICAgZG5kRHJvcHBpbmdTdGF0ZSA9IERlY29yYXRpb24ubm9uZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZG5kRHJvcHBpbmdTdGF0ZTtcbiAgfSxcblxuICBwcm92aWRlOiAoZikgPT4gRWRpdG9yVmlldy5kZWNvcmF0aW9ucy5mcm9tKGYpLFxufSk7XG5cbmZ1bmN0aW9uIGdldEVkaXRvclZpZXdGcm9tSFRNTEVsZW1lbnQoZTogSFRNTEVsZW1lbnQpIHtcbiAgd2hpbGUgKGUgJiYgIWUuY2xhc3NMaXN0LmNvbnRhaW5zKFwiY20tZWRpdG9yXCIpKSB7XG4gICAgZSA9IGUucGFyZW50RWxlbWVudDtcbiAgfVxuXG4gIGlmICghZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIEVkaXRvclZpZXcuZmluZEZyb21ET00oZSk7XG59XG5cbmZ1bmN0aW9uIGlzQ2xpY2tPbkJ1bGxldChlOiBNb3VzZUV2ZW50KSB7XG4gIGxldCBlbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXG4gIHdoaWxlIChlbCkge1xuICAgIGlmIChcbiAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucyhcImNtLWZvcm1hdHRpbmctbGlzdFwiKSB8fFxuICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiY20tZm9sZC1pbmRpY2F0b3JcIikgfHxcbiAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucyhcInRhc2stbGlzdC1pdGVtLWNoZWNrYm94XCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBlbCA9IGVsLnBhcmVudEVsZW1lbnQ7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzU2FtZVJvb3RzKGE6IFJvb3QsIGI6IFJvb3QpIHtcbiAgY29uc3QgW2FTdGFydCwgYUVuZF0gPSBhLmdldENvbnRlbnRSYW5nZSgpO1xuICBjb25zdCBbYlN0YXJ0LCBiRW5kXSA9IGIuZ2V0Q29udGVudFJhbmdlKCk7XG5cbiAgaWYgKGNtcFBvcyhhU3RhcnQsIGJTdGFydCkgIT09IDAgfHwgY21wUG9zKGFFbmQsIGJFbmQpICE9PSAwKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGEucHJpbnQoKSA9PT0gYi5wcmludCgpO1xufVxuXG5mdW5jdGlvbiBpc0ZlYXR1cmVTdXBwb3J0ZWQoKSB7XG4gIHJldHVybiBQbGF0Zm9ybS5pc0Rlc2t0b3A7XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBLZWVwQ3Vyc29yT3V0c2lkZUZvbGRlZExpbmVzIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcblxuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGlmICghbGlzdC5pc0ZvbGRlZCgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZm9sZFJvb3QgPSBsaXN0LmdldFRvcEZvbGRSb290KCk7XG4gICAgY29uc3QgZmlyc3RMaW5lRW5kID0gZm9sZFJvb3QuZ2V0TGluZXNJbmZvKClbMF0udG87XG5cbiAgICBpZiAoY3Vyc29yLmxpbmUgPiBmaXJzdExpbmVFbmQubGluZSkge1xuICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICAgIHJvb3QucmVwbGFjZUN1cnNvcihmaXJzdExpbmVFbmQpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgS2VlcEN1cnNvcldpdGhpbkxpc3RDb250ZW50IGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBjb250ZW50U3RhcnQgPSBsaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydEFmdGVyQ2hlY2tib3goKTtcbiAgICBjb25zdCBsaW5lUHJlZml4ID1cbiAgICAgIGNvbnRlbnRTdGFydC5saW5lID09PSBjdXJzb3IubGluZVxuICAgICAgICA/IGNvbnRlbnRTdGFydC5jaFxuICAgICAgICA6IGxpc3QuZ2V0Tm90ZXNJbmRlbnQoKS5sZW5ndGg7XG5cbiAgICBpZiAoY3Vyc29yLmNoIDwgbGluZVByZWZpeCkge1xuICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICAgIHJvb3QucmVwbGFjZUN1cnNvcih7XG4gICAgICAgIGxpbmU6IGN1cnNvci5saW5lLFxuICAgICAgICBjaDogbGluZVByZWZpeCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlLCBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBNeUVkaXRvciwgZ2V0RWRpdG9yRnJvbVN0YXRlIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgS2VlcEN1cnNvck91dHNpZGVGb2xkZWRMaW5lcyB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0tlZXBDdXJzb3JPdXRzaWRlRm9sZGVkTGluZXNcIjtcbmltcG9ydCB7IEtlZXBDdXJzb3JXaXRoaW5MaXN0Q29udGVudCB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0tlZXBDdXJzb3JXaXRoaW5MaXN0Q29udGVudFwiO1xuaW1wb3J0IHsgT3BlcmF0aW9uUGVyZm9ybWVyIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09wZXJhdGlvblBlcmZvcm1lclwiO1xuaW1wb3J0IHsgUGFyc2VyIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1BhcnNlclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NcIjtcblxuZXhwb3J0IGNsYXNzIEVkaXRvclNlbGVjdGlvbnNCZWhhdmlvdXJPdmVycmlkZSBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogUGx1Z2luLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzLFxuICAgIHByaXZhdGUgcGFyc2VyOiBQYXJzZXIsXG4gICAgcHJpdmF0ZSBvcGVyYXRpb25QZXJmb3JtZXI6IE9wZXJhdGlvblBlcmZvcm1lcixcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBFZGl0b3JTdGF0ZS50cmFuc2FjdGlvbkV4dGVuZGVyLm9mKHRoaXMudHJhbnNhY3Rpb25FeHRlbmRlciksXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSB0cmFuc2FjdGlvbkV4dGVuZGVyID0gKHRyOiBUcmFuc2FjdGlvbik6IG51bGwgPT4ge1xuICAgIGlmICh0aGlzLnNldHRpbmdzLmtlZXBDdXJzb3JXaXRoaW5Db250ZW50ID09PSBcIm5ldmVyXCIgfHwgIXRyLnNlbGVjdGlvbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yRnJvbVN0YXRlKHRyLnN0YXJ0U3RhdGUpO1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLmhhbmRsZVNlbGVjdGlvbnNDaGFuZ2VzKGVkaXRvcik7XG4gICAgfSwgMCk7XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICBwcml2YXRlIGhhbmRsZVNlbGVjdGlvbnNDaGFuZ2VzID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICBjb25zdCByb290ID0gdGhpcy5wYXJzZXIucGFyc2UoZWRpdG9yKTtcblxuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHtcbiAgICAgIGNvbnN0IHsgc2hvdWxkU3RvcFByb3BhZ2F0aW9uIH0gPSB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5ldmFsKFxuICAgICAgICByb290LFxuICAgICAgICBuZXcgS2VlcEN1cnNvck91dHNpZGVGb2xkZWRMaW5lcyhyb290KSxcbiAgICAgICAgZWRpdG9yLFxuICAgICAgKTtcblxuICAgICAgaWYgKHNob3VsZFN0b3BQcm9wYWdhdGlvbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5vcGVyYXRpb25QZXJmb3JtZXIuZXZhbChcbiAgICAgIHJvb3QsXG4gICAgICBuZXcgS2VlcEN1cnNvcldpdGhpbkxpc3RDb250ZW50KHJvb3QpLFxuICAgICAgZWRpdG9yLFxuICAgICk7XG4gIH07XG59XG4iLCJleHBvcnQgY29uc3QgY2hlY2tib3hSZSA9IGBcXFxcW1teXFxcXFtcXFxcXV1cXFxcXVsgXFx0XWA7XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNFbXB0eUxpbmVPckVtcHR5Q2hlY2tib3gobGluZTogc3RyaW5nKSB7XG4gIHJldHVybiBsaW5lID09PSBcIlwiIHx8IGxpbmUgPT09IFwiWyBdIFwiO1xufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IExpc3QsIFBvc2l0aW9uLCBSb290LCByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzIH0gZnJvbSBcIi4uL3Jvb3RcIjtcbmltcG9ydCB7IGNoZWNrYm94UmUgfSBmcm9tIFwiLi4vdXRpbHMvY2hlY2tib3hSZVwiO1xuaW1wb3J0IHsgaXNFbXB0eUxpbmVPckVtcHR5Q2hlY2tib3ggfSBmcm9tIFwiLi4vdXRpbHMvaXNFbXB0eUxpbmVPckVtcHR5Q2hlY2tib3hcIjtcblxuZXhwb3J0IGludGVyZmFjZSBHZXRab29tUmFuZ2Uge1xuICBnZXRab29tUmFuZ2UoKTogeyBmcm9tOiBQb3NpdGlvbjsgdG86IFBvc2l0aW9uIH0gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgQ3JlYXRlTmV3SXRlbSBpbXBsZW1lbnRzIE9wZXJhdGlvbiB7XG4gIHByaXZhdGUgc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gIHByaXZhdGUgdXBkYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcm9vdDogUm9vdCxcbiAgICBwcml2YXRlIGRlZmF1bHRJbmRlbnRDaGFyczogc3RyaW5nLFxuICAgIHByaXZhdGUgZ2V0Wm9vbVJhbmdlOiBHZXRab29tUmFuZ2UsXG4gICkge31cblxuICBzaG91bGRTdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcFByb3BhZ2F0aW9uO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZWQ7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGNvbnN0IHsgcm9vdCB9ID0gdGhpcztcblxuICAgIGlmICghcm9vdC5oYXNTaW5nbGVTZWxlY3Rpb24oKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHJvb3QuZ2V0U2VsZWN0aW9uKCk7XG4gICAgaWYgKCFzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLmFuY2hvci5saW5lICE9PSBzZWxlY3Rpb24uaGVhZC5saW5lKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgbGluZXMgPSBsaXN0LmdldExpbmVzSW5mbygpO1xuXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA9PT0gMSAmJiBpc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveChsaW5lc1swXS50ZXh0KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IHJvb3QuZ2V0Q3Vyc29yKCk7XG4gICAgY29uc3QgbGluZVVuZGVyQ3Vyc29yID0gbGluZXMuZmluZCgobCkgPT4gbC5mcm9tLmxpbmUgPT09IGN1cnNvci5saW5lKTtcblxuICAgIGlmIChjdXJzb3IuY2ggPCBsaW5lVW5kZXJDdXJzb3IuZnJvbS5jaCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHsgb2xkTGluZXMsIG5ld0xpbmVzIH0gPSBsaW5lcy5yZWR1Y2UoXG4gICAgICAoYWNjLCBsaW5lKSA9PiB7XG4gICAgICAgIGlmIChjdXJzb3IubGluZSA+IGxpbmUuZnJvbS5saW5lKSB7XG4gICAgICAgICAgYWNjLm9sZExpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3IubGluZSA9PT0gbGluZS5mcm9tLmxpbmUpIHtcbiAgICAgICAgICBjb25zdCBsZWZ0ID0gbGluZS50ZXh0LnNsaWNlKDAsIHNlbGVjdGlvbi5mcm9tIC0gbGluZS5mcm9tLmNoKTtcbiAgICAgICAgICBjb25zdCByaWdodCA9IGxpbmUudGV4dC5zbGljZShzZWxlY3Rpb24udG8gLSBsaW5lLmZyb20uY2gpO1xuICAgICAgICAgIGFjYy5vbGRMaW5lcy5wdXNoKGxlZnQpO1xuICAgICAgICAgIGFjYy5uZXdMaW5lcy5wdXNoKHJpZ2h0KTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3IubGluZSA8IGxpbmUuZnJvbS5saW5lKSB7XG4gICAgICAgICAgYWNjLm5ld0xpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBvbGRMaW5lczogW10sXG4gICAgICAgIG5ld0xpbmVzOiBbXSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IGNvZGVCbG9ja0JhY3RpY2tzID0gb2xkTGluZXMuam9pbihcIlxcblwiKS5zcGxpdChcImBgYFwiKS5sZW5ndGggLSAxO1xuICAgIGNvbnN0IGlzSW5zaWRlQ29kZWJsb2NrID1cbiAgICAgIGNvZGVCbG9ja0JhY3RpY2tzID4gMCAmJiBjb2RlQmxvY2tCYWN0aWNrcyAlIDIgIT09IDA7XG5cbiAgICBpZiAoaXNJbnNpZGVDb2RlYmxvY2spIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG4gICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IHpvb21SYW5nZSA9IHRoaXMuZ2V0Wm9vbVJhbmdlLmdldFpvb21SYW5nZSgpO1xuICAgIGNvbnN0IGxpc3RJc1pvb21pbmdSb290ID0gQm9vbGVhbihcbiAgICAgIHpvb21SYW5nZSAmJlxuICAgICAgICBsaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpLmxpbmUgPj0gem9vbVJhbmdlLmZyb20ubGluZSAmJlxuICAgICAgICBsaXN0LmdldExhc3RMaW5lQ29udGVudEVuZCgpLmxpbmUgPD0gem9vbVJhbmdlLmZyb20ubGluZSxcbiAgICApO1xuXG4gICAgY29uc3QgaGFzQ2hpbGRyZW4gPSAhbGlzdC5pc0VtcHR5KCk7XG4gICAgY29uc3QgY2hpbGRJc0ZvbGRlZCA9IGxpc3QuaXNGb2xkUm9vdCgpO1xuICAgIGNvbnN0IGVuZFBvcyA9IGxpc3QuZ2V0TGFzdExpbmVDb250ZW50RW5kKCk7XG4gICAgY29uc3QgZW5kT2ZMaW5lID0gY3Vyc29yLmxpbmUgPT09IGVuZFBvcy5saW5lICYmIGN1cnNvci5jaCA9PT0gZW5kUG9zLmNoO1xuXG4gICAgY29uc3Qgb25DaGlsZExldmVsID1cbiAgICAgIGxpc3RJc1pvb21pbmdSb290IHx8IChoYXNDaGlsZHJlbiAmJiAhY2hpbGRJc0ZvbGRlZCAmJiBlbmRPZkxpbmUpO1xuXG4gICAgY29uc3QgaW5kZW50ID0gb25DaGlsZExldmVsXG4gICAgICA/IGhhc0NoaWxkcmVuXG4gICAgICAgID8gbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldEZpcnN0TGluZUluZGVudCgpXG4gICAgICAgIDogbGlzdC5nZXRGaXJzdExpbmVJbmRlbnQoKSArIHRoaXMuZGVmYXVsdEluZGVudENoYXJzXG4gICAgICA6IGxpc3QuZ2V0Rmlyc3RMaW5lSW5kZW50KCk7XG5cbiAgICBjb25zdCBidWxsZXQgPVxuICAgICAgb25DaGlsZExldmVsICYmIGhhc0NoaWxkcmVuXG4gICAgICAgID8gbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldEJ1bGxldCgpXG4gICAgICAgIDogbGlzdC5nZXRCdWxsZXQoKTtcblxuICAgIGNvbnN0IHNwYWNlQWZ0ZXJCdWxsZXQgPVxuICAgICAgb25DaGlsZExldmVsICYmIGhhc0NoaWxkcmVuXG4gICAgICAgID8gbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldFNwYWNlQWZ0ZXJCdWxsZXQoKVxuICAgICAgICA6IGxpc3QuZ2V0U3BhY2VBZnRlckJ1bGxldCgpO1xuXG4gICAgY29uc3QgcHJlZml4ID0gb2xkTGluZXNbMF0ubWF0Y2goY2hlY2tib3hSZSkgPyBcIlsgXSBcIiA6IFwiXCI7XG5cbiAgICBjb25zdCBuZXdMaXN0ID0gbmV3IExpc3QoXG4gICAgICBsaXN0LmdldFJvb3QoKSxcbiAgICAgIGluZGVudCxcbiAgICAgIGJ1bGxldCxcbiAgICAgIHByZWZpeCxcbiAgICAgIHNwYWNlQWZ0ZXJCdWxsZXQsXG4gICAgICBwcmVmaXggKyBuZXdMaW5lcy5zaGlmdCgpLFxuICAgICAgZmFsc2UsXG4gICAgKTtcblxuICAgIGlmIChuZXdMaW5lcy5sZW5ndGggPiAwKSB7XG4gICAgICBuZXdMaXN0LnNldE5vdGVzSW5kZW50KGxpc3QuZ2V0Tm90ZXNJbmRlbnQoKSk7XG4gICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbmV3TGluZXMpIHtcbiAgICAgICAgbmV3TGlzdC5hZGRMaW5lKGxpbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChvbkNoaWxkTGV2ZWwpIHtcbiAgICAgIGxpc3QuYWRkQmVmb3JlQWxsKG5ld0xpc3QpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWNoaWxkSXNGb2xkZWQgfHwgIWVuZE9mTGluZSkge1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IGxpc3QuZ2V0Q2hpbGRyZW4oKTtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgIGxpc3QucmVtb3ZlQ2hpbGQoY2hpbGQpO1xuICAgICAgICAgIG5ld0xpc3QuYWRkQWZ0ZXJBbGwoY2hpbGQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxpc3QuZ2V0UGFyZW50KCkuYWRkQWZ0ZXIobGlzdCwgbmV3TGlzdCk7XG4gICAgfVxuXG4gICAgbGlzdC5yZXBsYWNlTGluZXMob2xkTGluZXMpO1xuXG4gICAgY29uc3QgbmV3TGlzdFN0YXJ0ID0gbmV3TGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogbmV3TGlzdFN0YXJ0LmxpbmUsXG4gICAgICBjaDogbmV3TGlzdFN0YXJ0LmNoICsgcHJlZml4Lmxlbmd0aCxcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBSb290LCByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzIH0gZnJvbSBcIi4uL3Jvb3RcIjtcblxuZXhwb3J0IGNsYXNzIE91dGRlbnRMaXN0IGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgcGFyZW50ID0gbGlzdC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBncmFuZFBhcmVudCA9IHBhcmVudC5nZXRQYXJlbnQoKTtcblxuICAgIGlmICghZ3JhbmRQYXJlbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUJlZm9yZSA9IHJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0KVswXTtcbiAgICBjb25zdCBpbmRlbnRSbUZyb20gPSBwYXJlbnQuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoO1xuICAgIGNvbnN0IGluZGVudFJtVGlsbCA9IGxpc3QuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoO1xuXG4gICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgIGdyYW5kUGFyZW50LmFkZEFmdGVyKHBhcmVudCwgbGlzdCk7XG4gICAgbGlzdC51bmluZGVudENvbnRlbnQoaW5kZW50Um1Gcm9tLCBpbmRlbnRSbVRpbGwpO1xuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUFmdGVyID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuICAgIGNvbnN0IGxpbmVEaWZmID0gbGlzdFN0YXJ0TGluZUFmdGVyIC0gbGlzdFN0YXJ0TGluZUJlZm9yZTtcbiAgICBjb25zdCBjaERpZmYgPSBpbmRlbnRSbVRpbGwgLSBpbmRlbnRSbUZyb207XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIHJvb3QucmVwbGFjZUN1cnNvcih7XG4gICAgICBsaW5lOiBjdXJzb3IubGluZSArIGxpbmVEaWZmLFxuICAgICAgY2g6IGN1cnNvci5jaCAtIGNoRGlmZixcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuaW1wb3J0IHsgT3V0ZGVudExpc3QgfSBmcm9tIFwiLi9PdXRkZW50TGlzdFwiO1xuXG5pbXBvcnQgeyBSb290IH0gZnJvbSBcIi4uL3Jvb3RcIjtcbmltcG9ydCB7IGlzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94IH0gZnJvbSBcIi4uL3V0aWxzL2lzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94XCI7XG5cbmV4cG9ydCBjbGFzcyBPdXRkZW50TGlzdElmSXRzRW1wdHkgaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIG91dGRlbnRMaXN0OiBPdXRkZW50TGlzdDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHtcbiAgICB0aGlzLm91dGRlbnRMaXN0ID0gbmV3IE91dGRlbnRMaXN0KHJvb3QpO1xuICB9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLm91dGRlbnRMaXN0LnNob3VsZFN0b3BQcm9wYWdhdGlvbigpO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLm91dGRlbnRMaXN0LnNob3VsZFVwZGF0ZSgpO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXMoKTtcblxuICAgIGlmIChcbiAgICAgIGxpbmVzLmxlbmd0aCA+IDEgfHxcbiAgICAgICFpc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveChsaW5lc1swXSkgfHxcbiAgICAgIGxpc3QuZ2V0TGV2ZWwoKSA9PT0gMVxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMub3V0ZGVudExpc3QucGVyZm9ybSgpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsga2V5bWFwIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5pbXBvcnQgeyBDcmVhdGVOZXdJdGVtIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvQ3JlYXRlTmV3SXRlbVwiO1xuaW1wb3J0IHsgT3V0ZGVudExpc3RJZkl0c0VtcHR5IH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvT3V0ZGVudExpc3RJZkl0c0VtcHR5XCI7XG5pbXBvcnQgeyBJTUVEZXRlY3RvciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVEZXRlY3RvclwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNldHRpbmdzXCI7XG5pbXBvcnQgeyBPcGVyYXRpb25QZXJmb3JtZXIgfSBmcm9tIFwiLi4vc2VydmljZXMvT3BlcmF0aW9uUGVyZm9ybWVyXCI7XG5pbXBvcnQgeyBQYXJzZXIgfSBmcm9tIFwiLi4vc2VydmljZXMvUGFyc2VyXCI7XG5pbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1wiO1xuaW1wb3J0IHsgY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2sgfSBmcm9tIFwiLi4vdXRpbHMvY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2tcIjtcblxuZXhwb3J0IGNsYXNzIEVudGVyQmVoYXZpb3VyT3ZlcnJpZGUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIGltZURldGVjdG9yOiBJTUVEZXRlY3RvcixcbiAgICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBwYXJzZXI6IFBhcnNlcixcbiAgICBwcml2YXRlIG9wZXJhdGlvblBlcmZvcm1lcjogT3BlcmF0aW9uUGVyZm9ybWVyLFxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIFByZWMuaGlnaGVzdChcbiAgICAgICAga2V5bWFwLm9mKFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBrZXk6IFwiRW50ZXJcIixcbiAgICAgICAgICAgIHJ1bjogY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soe1xuICAgICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0pLFxuICAgICAgKSxcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIGNoZWNrID0gKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLm92ZXJyaWRlRW50ZXJCZWhhdmlvdXIgJiYgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKTtcbiAgfTtcblxuICBwcml2YXRlIHJ1biA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMucGFyc2VyLnBhcnNlKGVkaXRvcik7XG5cbiAgICBpZiAoIXJvb3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNob3VsZFVwZGF0ZTogZmFsc2UsXG4gICAgICAgIHNob3VsZFN0b3BQcm9wYWdhdGlvbjogZmFsc2UsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHtcbiAgICAgIGNvbnN0IHJlcyA9IHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLmV2YWwoXG4gICAgICAgIHJvb3QsXG4gICAgICAgIG5ldyBPdXRkZW50TGlzdElmSXRzRW1wdHkocm9vdCksXG4gICAgICAgIGVkaXRvcixcbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXMuc2hvdWxkU3RvcFByb3BhZ2F0aW9uKSB7XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgICB9XG4gICAgfVxuXG4gICAge1xuICAgICAgY29uc3QgZGVmYXVsdEluZGVudENoYXJzID0gdGhpcy5vYnNpZGlhblNldHRpbmdzLmdldERlZmF1bHRJbmRlbnRDaGFycygpO1xuICAgICAgY29uc3Qgem9vbVJhbmdlID0gZWRpdG9yLmdldFpvb21SYW5nZSgpO1xuICAgICAgY29uc3QgZ2V0Wm9vbVJhbmdlID0ge1xuICAgICAgICBnZXRab29tUmFuZ2U6ICgpID0+IHpvb21SYW5nZSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlcyA9IHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLmV2YWwoXG4gICAgICAgIHJvb3QsXG4gICAgICAgIG5ldyBDcmVhdGVOZXdJdGVtKHJvb3QsIGRlZmF1bHRJbmRlbnRDaGFycywgZ2V0Wm9vbVJhbmdlKSxcbiAgICAgICAgZWRpdG9yLFxuICAgICAgKTtcblxuICAgICAgaWYgKHJlcy5zaG91bGRVcGRhdGUgJiYgem9vbVJhbmdlKSB7XG4gICAgICAgIGVkaXRvci50cnlSZWZyZXNoWm9vbSh6b29tUmFuZ2UuZnJvbS5saW5lKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBFZGl0b3IgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFZGl0b3JDYWxsYmFjayhjYjogKGVkaXRvcjogTXlFZGl0b3IpID0+IGJvb2xlYW4pIHtcbiAgcmV0dXJuIChlZGl0b3I6IEVkaXRvcikgPT4ge1xuICAgIGNvbnN0IG15RWRpdG9yID0gbmV3IE15RWRpdG9yKGVkaXRvcik7XG4gICAgY29uc3Qgc2hvdWxkU3RvcFByb3BhZ2F0aW9uID0gY2IobXlFZGl0b3IpO1xuXG4gICAgaWYgKFxuICAgICAgIXNob3VsZFN0b3BQcm9wYWdhdGlvbiAmJlxuICAgICAgd2luZG93LmV2ZW50ICYmXG4gICAgICB3aW5kb3cuZXZlbnQudHlwZSA9PT0gXCJrZXlkb3duXCJcbiAgICApIHtcbiAgICAgIG15RWRpdG9yLnRyaWdnZXJPbktleURvd24od2luZG93LmV2ZW50IGFzIEtleWJvYXJkRXZlbnQpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IE5vdGljZSwgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNldHRpbmdzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZGl0b3JDYWxsYmFjayB9IGZyb20gXCIuLi91dGlscy9jcmVhdGVFZGl0b3JDYWxsYmFja1wiO1xuXG5leHBvcnQgY2xhc3MgTGlzdHNGb2xkaW5nQ29tbWFuZHMgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3MsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZm9sZFwiLFxuICAgICAgaWNvbjogXCJjaGV2cm9ucy1kb3duLXVwXCIsXG4gICAgICBuYW1lOiBcIkZvbGQgdGhlIGxpc3RcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBjcmVhdGVFZGl0b3JDYWxsYmFjayh0aGlzLmZvbGQpLFxuICAgICAgaG90a2V5czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kaWZpZXJzOiBbXCJNb2RcIl0sXG4gICAgICAgICAga2V5OiBcIkFycm93VXBcIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBsdWdpbi5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInVuZm9sZFwiLFxuICAgICAgaWNvbjogXCJjaGV2cm9ucy11cC1kb3duXCIsXG4gICAgICBuYW1lOiBcIlVuZm9sZCB0aGUgbGlzdFwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IGNyZWF0ZUVkaXRvckNhbGxiYWNrKHRoaXMudW5mb2xkKSxcbiAgICAgIGhvdGtleXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG1vZGlmaWVyczogW1wiTW9kXCJdLFxuICAgICAgICAgIGtleTogXCJBcnJvd0Rvd25cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgc2V0Rm9sZChlZGl0b3I6IE15RWRpdG9yLCB0eXBlOiBcImZvbGRcIiB8IFwidW5mb2xkXCIpIHtcbiAgICBpZiAoIXRoaXMub2JzaWRpYW5TZXR0aW5ncy5nZXRGb2xkU2V0dGluZ3MoKS5mb2xkSW5kZW50KSB7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICBgVW5hYmxlIHRvICR7dHlwZX0gYmVjYXVzZSBmb2xkaW5nIGlzIGRpc2FibGVkLiBQbGVhc2UgZW5hYmxlIFwiRm9sZCBpbmRlbnRcIiBpbiBPYnNpZGlhbiBzZXR0aW5ncy5gLFxuICAgICAgICA1MDAwLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3IoKTtcblxuICAgIGlmICh0eXBlID09PSBcImZvbGRcIikge1xuICAgICAgZWRpdG9yLmZvbGQoY3Vyc29yLmxpbmUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlZGl0b3IudW5mb2xkKGN1cnNvci5saW5lKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgZm9sZCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0Rm9sZChlZGl0b3IsIFwiZm9sZFwiKTtcbiAgfTtcblxuICBwcml2YXRlIHVuZm9sZCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0Rm9sZChlZGl0b3IsIFwidW5mb2xkXCIpO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IFJvb3QsIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgSW5kZW50TGlzdCBpbXBsZW1lbnRzIE9wZXJhdGlvbiB7XG4gIHByaXZhdGUgc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gIHByaXZhdGUgdXBkYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcm9vdDogUm9vdCxcbiAgICBwcml2YXRlIGRlZmF1bHRJbmRlbnRDaGFyczogc3RyaW5nLFxuICApIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG5cbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBwYXJlbnQgPSBsaXN0LmdldFBhcmVudCgpO1xuICAgIGNvbnN0IHByZXYgPSBwYXJlbnQuZ2V0UHJldlNpYmxpbmdPZihsaXN0KTtcblxuICAgIGlmICghcHJldikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQmVmb3JlID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuXG4gICAgY29uc3QgaW5kZW50UG9zID0gbGlzdC5nZXRGaXJzdExpbmVJbmRlbnQoKS5sZW5ndGg7XG4gICAgbGV0IGluZGVudENoYXJzID0gXCJcIjtcblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIiAmJiAhcHJldi5pc0VtcHR5KCkpIHtcbiAgICAgIGluZGVudENoYXJzID0gcHJldlxuICAgICAgICAuZ2V0Q2hpbGRyZW4oKVswXVxuICAgICAgICAuZ2V0Rmlyc3RMaW5lSW5kZW50KClcbiAgICAgICAgLnNsaWNlKHByZXYuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoKTtcbiAgICB9XG5cbiAgICBpZiAoaW5kZW50Q2hhcnMgPT09IFwiXCIpIHtcbiAgICAgIGluZGVudENoYXJzID0gbGlzdFxuICAgICAgICAuZ2V0Rmlyc3RMaW5lSW5kZW50KClcbiAgICAgICAgLnNsaWNlKHBhcmVudC5nZXRGaXJzdExpbmVJbmRlbnQoKS5sZW5ndGgpO1xuICAgIH1cblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIiAmJiAhbGlzdC5pc0VtcHR5KCkpIHtcbiAgICAgIGluZGVudENoYXJzID0gbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldEZpcnN0TGluZUluZGVudCgpO1xuICAgIH1cblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIikge1xuICAgICAgaW5kZW50Q2hhcnMgPSB0aGlzLmRlZmF1bHRJbmRlbnRDaGFycztcbiAgICB9XG5cbiAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobGlzdCk7XG4gICAgcHJldi5hZGRBZnRlckFsbChsaXN0KTtcbiAgICBsaXN0LmluZGVudENvbnRlbnQoaW5kZW50UG9zLCBpbmRlbnRDaGFycyk7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQWZ0ZXIgPSByb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YobGlzdClbMF07XG4gICAgY29uc3QgbGluZURpZmYgPSBsaXN0U3RhcnRMaW5lQWZ0ZXIgLSBsaXN0U3RhcnRMaW5lQmVmb3JlO1xuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogY3Vyc29yLmxpbmUgKyBsaW5lRGlmZixcbiAgICAgIGNoOiBjdXJzb3IuY2ggKyBpbmRlbnRDaGFycy5sZW5ndGgsXG4gICAgfSk7XG5cbiAgICByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzKHJvb3QpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCwgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBNb3ZlTGlzdERvd24gaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG5cbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBwYXJlbnQgPSBsaXN0LmdldFBhcmVudCgpO1xuICAgIGNvbnN0IGdyYW5kUGFyZW50ID0gcGFyZW50LmdldFBhcmVudCgpO1xuICAgIGNvbnN0IG5leHQgPSBwYXJlbnQuZ2V0TmV4dFNpYmxpbmdPZihsaXN0KTtcblxuICAgIGNvbnN0IGxpc3RTdGFydExpbmVCZWZvcmUgPSByb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YobGlzdClbMF07XG5cbiAgICBpZiAoIW5leHQgJiYgZ3JhbmRQYXJlbnQpIHtcbiAgICAgIGNvbnN0IG5ld1BhcmVudCA9IGdyYW5kUGFyZW50LmdldE5leHRTaWJsaW5nT2YocGFyZW50KTtcblxuICAgICAgaWYgKG5ld1BhcmVudCkge1xuICAgICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuICAgICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobGlzdCk7XG4gICAgICAgIG5ld1BhcmVudC5hZGRCZWZvcmVBbGwobGlzdCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChuZXh0KSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgICAgcGFyZW50LmFkZEFmdGVyKG5leHQsIGxpc3QpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy51cGRhdGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUFmdGVyID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuICAgIGNvbnN0IGxpbmVEaWZmID0gbGlzdFN0YXJ0TGluZUFmdGVyIC0gbGlzdFN0YXJ0TGluZUJlZm9yZTtcblxuICAgIGNvbnN0IGN1cnNvciA9IHJvb3QuZ2V0Q3Vyc29yKCk7XG4gICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHtcbiAgICAgIGxpbmU6IGN1cnNvci5saW5lICsgbGluZURpZmYsXG4gICAgICBjaDogY3Vyc29yLmNoLFxuICAgIH0pO1xuXG4gICAgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyhyb290KTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IFJvb3QsIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgTW92ZUxpc3RVcCBpbXBsZW1lbnRzIE9wZXJhdGlvbiB7XG4gIHByaXZhdGUgc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gIHByaXZhdGUgdXBkYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcm9vdDogUm9vdCkge31cblxuICBzaG91bGRTdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcFByb3BhZ2F0aW9uO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZWQ7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGNvbnN0IHsgcm9vdCB9ID0gdGhpcztcblxuICAgIGlmICghcm9vdC5oYXNTaW5nbGVDdXJzb3IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcblxuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IHBhcmVudCA9IGxpc3QuZ2V0UGFyZW50KCk7XG4gICAgY29uc3QgZ3JhbmRQYXJlbnQgPSBwYXJlbnQuZ2V0UGFyZW50KCk7XG4gICAgY29uc3QgcHJldiA9IHBhcmVudC5nZXRQcmV2U2libGluZ09mKGxpc3QpO1xuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUJlZm9yZSA9IHJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0KVswXTtcblxuICAgIGlmICghcHJldiAmJiBncmFuZFBhcmVudCkge1xuICAgICAgY29uc3QgbmV3UGFyZW50ID0gZ3JhbmRQYXJlbnQuZ2V0UHJldlNpYmxpbmdPZihwYXJlbnQpO1xuXG4gICAgICBpZiAobmV3UGFyZW50KSB7XG4gICAgICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG4gICAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChsaXN0KTtcbiAgICAgICAgbmV3UGFyZW50LmFkZEFmdGVyQWxsKGxpc3QpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocHJldikge1xuICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChsaXN0KTtcbiAgICAgIHBhcmVudC5hZGRCZWZvcmUocHJldiwgbGlzdCk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnVwZGF0ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQWZ0ZXIgPSByb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YobGlzdClbMF07XG4gICAgY29uc3QgbGluZURpZmYgPSBsaXN0U3RhcnRMaW5lQWZ0ZXIgLSBsaXN0U3RhcnRMaW5lQmVmb3JlO1xuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogY3Vyc29yLmxpbmUgKyBsaW5lRGlmZixcbiAgICAgIGNoOiBjdXJzb3IuY2gsXG4gICAgfSk7XG5cbiAgICByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzKHJvb3QpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5pbXBvcnQgeyBJbmRlbnRMaXN0IH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvSW5kZW50TGlzdFwiO1xuaW1wb3J0IHsgTW92ZUxpc3REb3duIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvTW92ZUxpc3REb3duXCI7XG5pbXBvcnQgeyBNb3ZlTGlzdFVwIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvTW92ZUxpc3RVcFwiO1xuaW1wb3J0IHsgT3V0ZGVudExpc3QgfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9PdXRkZW50TGlzdFwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNldHRpbmdzXCI7XG5pbXBvcnQgeyBPcGVyYXRpb25QZXJmb3JtZXIgfSBmcm9tIFwiLi4vc2VydmljZXMvT3BlcmF0aW9uUGVyZm9ybWVyXCI7XG5pbXBvcnQgeyBjcmVhdGVFZGl0b3JDYWxsYmFjayB9IGZyb20gXCIuLi91dGlscy9jcmVhdGVFZGl0b3JDYWxsYmFja1wiO1xuXG5leHBvcnQgY2xhc3MgTGlzdHNNb3ZlbWVudENvbW1hbmRzIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBvYnNpZGlhblNldHRpbmdzOiBPYnNpZGlhblNldHRpbmdzLFxuICAgIHByaXZhdGUgb3BlcmF0aW9uUGVyZm9ybWVyOiBPcGVyYXRpb25QZXJmb3JtZXIsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwibW92ZS1saXN0LWl0ZW0tdXBcIixcbiAgICAgIGljb246IFwiYXJyb3ctdXBcIixcbiAgICAgIG5hbWU6IFwiTW92ZSBsaXN0IGFuZCBzdWJsaXN0cyB1cFwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IGNyZWF0ZUVkaXRvckNhbGxiYWNrKHRoaXMubW92ZUxpc3RVcCksXG4gICAgICBob3RrZXlzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtb2RpZmllcnM6IFtcIk1vZFwiLCBcIlNoaWZ0XCJdLFxuICAgICAgICAgIGtleTogXCJBcnJvd1VwXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJtb3ZlLWxpc3QtaXRlbS1kb3duXCIsXG4gICAgICBpY29uOiBcImFycm93LWRvd25cIixcbiAgICAgIG5hbWU6IFwiTW92ZSBsaXN0IGFuZCBzdWJsaXN0cyBkb3duXCIsXG4gICAgICBlZGl0b3JDYWxsYmFjazogY3JlYXRlRWRpdG9yQ2FsbGJhY2sodGhpcy5tb3ZlTGlzdERvd24pLFxuICAgICAgaG90a2V5czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kaWZpZXJzOiBbXCJNb2RcIiwgXCJTaGlmdFwiXSxcbiAgICAgICAgICBrZXk6IFwiQXJyb3dEb3duXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJpbmRlbnQtbGlzdFwiLFxuICAgICAgaWNvbjogXCJpbmRlbnRcIixcbiAgICAgIG5hbWU6IFwiSW5kZW50IHRoZSBsaXN0IGFuZCBzdWJsaXN0c1wiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IGNyZWF0ZUVkaXRvckNhbGxiYWNrKHRoaXMuaW5kZW50TGlzdCksXG4gICAgICBob3RrZXlzOiBbXSxcbiAgICB9KTtcblxuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3V0ZGVudC1saXN0XCIsXG4gICAgICBpY29uOiBcIm91dGRlbnRcIixcbiAgICAgIG5hbWU6IFwiT3V0ZGVudCB0aGUgbGlzdCBhbmQgc3VibGlzdHNcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBjcmVhdGVFZGl0b3JDYWxsYmFjayh0aGlzLm91dGRlbnRMaXN0KSxcbiAgICAgIGhvdGtleXM6IFtdLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIG1vdmVMaXN0RG93biA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgY29uc3QgeyBzaG91bGRTdG9wUHJvcGFnYXRpb24gfSA9IHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLnBlcmZvcm0oXG4gICAgICAocm9vdCkgPT4gbmV3IE1vdmVMaXN0RG93bihyb290KSxcbiAgICAgIGVkaXRvcixcbiAgICApO1xuXG4gICAgcmV0dXJuIHNob3VsZFN0b3BQcm9wYWdhdGlvbjtcbiAgfTtcblxuICBwcml2YXRlIG1vdmVMaXN0VXAgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIGNvbnN0IHsgc2hvdWxkU3RvcFByb3BhZ2F0aW9uIH0gPSB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5wZXJmb3JtKFxuICAgICAgKHJvb3QpID0+IG5ldyBNb3ZlTGlzdFVwKHJvb3QpLFxuICAgICAgZWRpdG9yLFxuICAgICk7XG5cbiAgICByZXR1cm4gc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICB9O1xuXG4gIHByaXZhdGUgaW5kZW50TGlzdCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgY29uc3QgeyBzaG91bGRTdG9wUHJvcGFnYXRpb24gfSA9IHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLnBlcmZvcm0oXG4gICAgICAocm9vdCkgPT5cbiAgICAgICAgbmV3IEluZGVudExpc3Qocm9vdCwgdGhpcy5vYnNpZGlhblNldHRpbmdzLmdldERlZmF1bHRJbmRlbnRDaGFycygpKSxcbiAgICAgIGVkaXRvcixcbiAgICApO1xuXG4gICAgcmV0dXJuIHNob3VsZFN0b3BQcm9wYWdhdGlvbjtcbiAgfTtcblxuICBwcml2YXRlIG91dGRlbnRMaXN0ID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICBjb25zdCB7IHNob3VsZFN0b3BQcm9wYWdhdGlvbiB9ID0gdGhpcy5vcGVyYXRpb25QZXJmb3JtZXIucGVyZm9ybShcbiAgICAgIChyb290KSA9PiBuZXcgT3V0ZGVudExpc3Qocm9vdCksXG4gICAgICBlZGl0b3IsXG4gICAgKTtcblxuICAgIHJldHVybiBzaG91bGRTdG9wUHJvcGFnYXRpb247XG4gIH07XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVUaWxsQ3VycmVudExpbmVDb250ZW50U3RhcnQgaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG4gICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IGN1cnNvciA9IHJvb3QuZ2V0Q3Vyc29yKCk7XG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgbGluZXMgPSBsaXN0LmdldExpbmVzSW5mbygpO1xuICAgIGNvbnN0IGxpbmVObyA9IGxpbmVzLmZpbmRJbmRleCgobCkgPT4gbC5mcm9tLmxpbmUgPT09IGN1cnNvci5saW5lKTtcblxuICAgIGxpbmVzW2xpbmVOb10udGV4dCA9IGxpbmVzW2xpbmVOb10udGV4dC5zbGljZShcbiAgICAgIGN1cnNvci5jaCAtIGxpbmVzW2xpbmVOb10uZnJvbS5jaCxcbiAgICApO1xuXG4gICAgbGlzdC5yZXBsYWNlTGluZXMobGluZXMubWFwKChsKSA9PiBsLnRleHQpKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3IobGluZXNbbGluZU5vXS5mcm9tKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgRGVsZXRlVGlsbEN1cnJlbnRMaW5lQ29udGVudFN0YXJ0IH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvRGVsZXRlVGlsbEN1cnJlbnRMaW5lQ29udGVudFN0YXJ0XCI7XG5pbXBvcnQgeyBJTUVEZXRlY3RvciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVEZXRlY3RvclwiO1xuaW1wb3J0IHsgT3BlcmF0aW9uUGVyZm9ybWVyIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09wZXJhdGlvblBlcmZvcm1lclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NcIjtcbmltcG9ydCB7IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrIH0gZnJvbSBcIi4uL3V0aWxzL2NyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrXCI7XG5cbmV4cG9ydCBjbGFzcyBNZXRhQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIGltZURldGVjdG9yOiBJTUVEZXRlY3RvcixcbiAgICBwcml2YXRlIG9wZXJhdGlvblBlcmZvcm1lcjogT3BlcmF0aW9uUGVyZm9ybWVyLFxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIGtleW1hcC5vZihbXG4gICAgICAgIHtcbiAgICAgICAgICBtYWM6IFwibS1CYWNrc3BhY2VcIixcbiAgICAgICAgICBydW46IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIF0pLFxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuc2V0dGluZ3Mua2VlcEN1cnNvcldpdGhpbkNvbnRlbnQgIT09IFwibmV2ZXJcIiAmJlxuICAgICAgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKVxuICAgICk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLm9wZXJhdGlvblBlcmZvcm1lci5wZXJmb3JtKFxuICAgICAgKHJvb3QpID0+IG5ldyBEZWxldGVUaWxsQ3VycmVudExpbmVDb250ZW50U3RhcnQocm9vdCksXG4gICAgICBlZGl0b3IsXG4gICAgKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IEFwcCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7XG4gIEtlZXBDdXJzb3JXaXRoaW5Db250ZW50LFxuICBTZXR0aW5ncyxcbiAgVmVydGljYWxMaW5lc0FjdGlvbixcbn0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5cbmNsYXNzIE9ic2lkaWFuT3V0bGluZXJQbHVnaW5TZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIGFwcDogQXBwLFxuICAgIHBsdWdpbjogUGx1Z2luLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzLFxuICApIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlN0aWNrIHRoZSBjdXJzb3IgdG8gdGhlIGNvbnRlbnRcIilcbiAgICAgIC5zZXREZXNjKFwiRG9uJ3QgbGV0IHRoZSBjdXJzb3IgbW92ZSB0byB0aGUgYnVsbGV0IHBvc2l0aW9uLlwiKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4ge1xuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb25zKHtcbiAgICAgICAgICAgIG5ldmVyOiBcIk5ldmVyXCIsXG4gICAgICAgICAgICBcImJ1bGxldC1vbmx5XCI6IFwiU3RpY2sgY3Vyc29yIG91dCBvZiBidWxsZXRzXCIsXG4gICAgICAgICAgICBcImJ1bGxldC1hbmQtY2hlY2tib3hcIjogXCJTdGljayBjdXJzb3Igb3V0IG9mIGJ1bGxldHMgYW5kIGNoZWNrYm94ZXNcIixcbiAgICAgICAgICB9IGFzIHsgW2tleSBpbiBLZWVwQ3Vyc29yV2l0aGluQ29udGVudF06IHN0cmluZyB9KVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLmtlZXBDdXJzb3JXaXRoaW5Db250ZW50KVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IEtlZXBDdXJzb3JXaXRoaW5Db250ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLmtlZXBDdXJzb3JXaXRoaW5Db250ZW50ID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkVuaGFuY2UgdGhlIFRhYiBrZXlcIilcbiAgICAgIC5zZXREZXNjKFwiTWFrZSBUYWIgYW5kIFNoaWZ0LVRhYiBiZWhhdmUgdGhlIHNhbWUgYXMgb3RoZXIgb3V0bGluZXJzLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XG4gICAgICAgIHRvZ2dsZVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLm92ZXJyaWRlVGFiQmVoYXZpb3VyKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3Mub3ZlcnJpZGVUYWJCZWhhdmlvdXIgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRW5oYW5jZSB0aGUgRW50ZXIga2V5XCIpXG4gICAgICAuc2V0RGVzYyhcIk1ha2UgdGhlIEVudGVyIGtleSBiZWhhdmUgdGhlIHNhbWUgYXMgb3RoZXIgb3V0bGluZXJzLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XG4gICAgICAgIHRvZ2dsZVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLm92ZXJyaWRlRW50ZXJCZWhhdmlvdXIpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5vdmVycmlkZUVudGVyQmVoYXZpb3VyID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkVuaGFuY2UgdGhlIEN0cmwrQSBvciBDbWQrQSBiZWhhdmlvclwiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiUHJlc3MgdGhlIGhvdGtleSBvbmNlIHRvIHNlbGVjdCB0aGUgY3VycmVudCBsaXN0IGl0ZW0uIFByZXNzIHRoZSBob3RrZXkgdHdpY2UgdG8gc2VsZWN0IHRoZSBlbnRpcmUgbGlzdC5cIixcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGVcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5vdmVycmlkZVNlbGVjdEFsbEJlaGF2aW91cilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLm92ZXJyaWRlU2VsZWN0QWxsQmVoYXZpb3VyID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkltcHJvdmUgdGhlIHN0eWxlIG9mIHlvdXIgbGlzdHNcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlN0eWxlcyBhcmUgb25seSBjb21wYXRpYmxlIHdpdGggYnVpbHQtaW4gT2JzaWRpYW4gdGhlbWVzIGFuZCBtYXkgbm90IGJlIGNvbXBhdGlibGUgd2l0aCBvdGhlciB0aGVtZXMuXCIsXG4gICAgICApXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MuYmV0dGVyTGlzdHNTdHlsZXMpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5iZXR0ZXJMaXN0c1N0eWxlcyA9IHZhbHVlO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5zYXZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJEcmF3IHZlcnRpY2FsIGluZGVudGF0aW9uIGxpbmVzXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MudmVydGljYWxMaW5lcykub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy52ZXJ0aWNhbExpbmVzID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5zYXZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiVmVydGljYWwgaW5kZW50YXRpb24gbGluZSBjbGljayBhY3Rpb25cIilcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IHtcbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9ucyh7XG4gICAgICAgICAgICBub25lOiBcIk5vbmVcIixcbiAgICAgICAgICAgIFwiem9vbS1pblwiOiBcIlpvb20gSW5cIixcbiAgICAgICAgICAgIFwidG9nZ2xlLWZvbGRpbmdcIjogXCJUb2dnbGUgRm9sZGluZ1wiLFxuICAgICAgICAgIH0gYXMgeyBba2V5IGluIFZlcnRpY2FsTGluZXNBY3Rpb25dOiBzdHJpbmcgfSlcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy52ZXJ0aWNhbExpbmVzQWN0aW9uKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IFZlcnRpY2FsTGluZXNBY3Rpb24pID0+IHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MudmVydGljYWxMaW5lc0FjdGlvbiA9IHZhbHVlO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5zYXZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiRHJhZy1hbmQtRHJvcFwiKS5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MuZHJhZ0FuZERyb3ApLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICB0aGlzLnNldHRpbmdzLmRyYWdBbmREcm9wID0gdmFsdWU7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRGVidWcgbW9kZVwiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiT3BlbiBEZXZUb29scyAoQ29tbWFuZCtPcHRpb24rSSBvciBDb250cm9sK1NoaWZ0K0kpIHRvIGNvcHkgdGhlIGRlYnVnIGxvZ3MuXCIsXG4gICAgICApXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MuZGVidWcpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGVidWcgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUYWIgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4uYWRkU2V0dGluZ1RhYihcbiAgICAgIG5ldyBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ1RhYihcbiAgICAgICAgdGhpcy5wbHVnaW4uYXBwLFxuICAgICAgICB0aGlzLnBsdWdpbixcbiAgICAgICAgdGhpcy5zZXR0aW5ncyxcbiAgICAgICksXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsga2V5bWFwIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vZWRpdG9yXCI7XG5pbXBvcnQgeyBPdXRkZW50TGlzdCB9IGZyb20gXCIuLi9vcGVyYXRpb25zL091dGRlbnRMaXN0XCI7XG5pbXBvcnQgeyBJTUVEZXRlY3RvciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVEZXRlY3RvclwiO1xuaW1wb3J0IHsgT3BlcmF0aW9uUGVyZm9ybWVyIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09wZXJhdGlvblBlcmZvcm1lclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NcIjtcbmltcG9ydCB7IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrIH0gZnJvbSBcIi4uL3V0aWxzL2NyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrXCI7XG5cbmV4cG9ydCBjbGFzcyBTaGlmdFRhYkJlaGF2aW91ck92ZXJyaWRlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBpbWVEZXRlY3RvcjogSU1FRGV0ZWN0b3IsXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBvcGVyYXRpb25QZXJmb3JtZXI6IE9wZXJhdGlvblBlcmZvcm1lcixcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBQcmVjLmhpZ2hlc3QoXG4gICAgICAgIGtleW1hcC5vZihbXG4gICAgICAgICAge1xuICAgICAgICAgICAga2V5OiBcInMtVGFiXCIsXG4gICAgICAgICAgICBydW46IGNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgICAgY2hlY2s6IHRoaXMuY2hlY2ssXG4gICAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9LFxuICAgICAgICBdKSxcbiAgICAgICksXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSBjaGVjayA9ICgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5vdmVycmlkZVRhYkJlaGF2aW91ciAmJiAhdGhpcy5pbWVEZXRlY3Rvci5pc09wZW5lZCgpO1xuICB9O1xuXG4gIHByaXZhdGUgcnVuID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICByZXR1cm4gdGhpcy5vcGVyYXRpb25QZXJmb3JtZXIucGVyZm9ybShcbiAgICAgIChyb290KSA9PiBuZXcgT3V0ZGVudExpc3Qocm9vdCksXG4gICAgICBlZGl0b3IsXG4gICAgKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IEFwcCwgTW9kYWwsIFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1wiO1xuXG5pbnRlcmZhY2UgQXBwSGlkZGVuUHJvcHMge1xuICBpbnRlcm5hbFBsdWdpbnM6IHtcbiAgICBjb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xuICB9O1xuICBpc01vYmlsZTogYm9vbGVhbjtcbiAgcGx1Z2luczoge1xuICAgIGVuYWJsZWRQbHVnaW5zOiBTZXQ8c3RyaW5nPjtcbiAgICBtYW5pZmVzdHM6IHsgW2tleTogc3RyaW5nXTogeyB2ZXJzaW9uOiBzdHJpbmcgfSB9O1xuICB9O1xuICB2YXVsdDoge1xuICAgIGNvbmZpZzogb2JqZWN0O1xuICB9O1xufVxuXG5jbGFzcyBTeXN0ZW1JbmZvTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIGFwcDogQXBwLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzLFxuICApIHtcbiAgICBzdXBlcihhcHApO1xuICB9XG5cbiAgYXN5bmMgb25PcGVuKCkge1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiU3lzdGVtIEluZm9ybWF0aW9uXCIpO1xuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBhcHAgPSB0aGlzLmFwcCBhcyBhbnkgYXMgQXBwSGlkZGVuUHJvcHM7XG5cbiAgICBjb25zdCBkYXRhID0ge1xuICAgICAgcHJvY2Vzczoge1xuICAgICAgICBhcmNoOiBwcm9jZXNzLmFyY2gsXG4gICAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgfSxcbiAgICAgIGFwcDoge1xuICAgICAgICBpbnRlcm5hbFBsdWdpbnM6IHtcbiAgICAgICAgICBjb25maWc6IGFwcC5pbnRlcm5hbFBsdWdpbnMuY29uZmlnLFxuICAgICAgICB9LFxuICAgICAgICBpc01vYmlsZTogYXBwLmlzTW9iaWxlLFxuICAgICAgICBwbHVnaW5zOiB7XG4gICAgICAgICAgZW5hYmxlZFBsdWdpbnM6IEFycmF5LmZyb20oYXBwLnBsdWdpbnMuZW5hYmxlZFBsdWdpbnMpLFxuICAgICAgICAgIG1hbmlmZXN0czogT2JqZWN0LmtleXMoYXBwLnBsdWdpbnMubWFuaWZlc3RzKS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBrZXkpID0+IHtcbiAgICAgICAgICAgICAgYWNjW2tleV0gPSB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogYXBwLnBsdWdpbnMubWFuaWZlc3RzW2tleV0udmVyc2lvbixcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7fSBhcyB7IFtrZXk6IHN0cmluZ106IHsgdmVyc2lvbjogc3RyaW5nIH0gfSxcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgICB2YXVsdDoge1xuICAgICAgICAgIGNvbmZpZzogYXBwLnZhdWx0LmNvbmZpZyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBwbHVnaW46IHtcbiAgICAgICAgc2V0dGluZ3M6IHsgdmFsdWVzOiB0aGlzLnNldHRpbmdzLmdldFZhbHVlcygpIH0sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCB0ZXh0ID0gSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG5cbiAgICBjb25zdCBwcmUgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInByZVwiKTtcbiAgICBwcmUuc2V0VGV4dCh0ZXh0KTtcbiAgICBwcmUuc2V0Q3NzU3R5bGVzKHtcbiAgICAgIG92ZXJmbG93OiBcInNjcm9sbFwiLFxuICAgICAgbWF4SGVpZ2h0OiBcIjMwMHB4XCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBidXR0b24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiKTtcbiAgICBidXR0b24uc2V0VGV4dChcIkNvcHkgYW5kIENsb3NlXCIpO1xuICAgIGJ1dHRvbi5vbkNsaWNrRXZlbnQoKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoXCJgYGBqc29uXFxuXCIgKyB0ZXh0ICsgXCJcXG5gYGBcIik7XG4gICAgICB0aGlzLmNsb3NlKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFN5c3RlbUluZm8gaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeXN0ZW0taW5mb1wiLFxuICAgICAgbmFtZTogXCJTaG93IFN5c3RlbSBJbmZvXCIsXG4gICAgICBjYWxsYmFjazogdGhpcy5jYWxsYmFjayxcbiAgICAgIGhvdGtleXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG1vZGlmaWVyczogW1wiTW9kXCIsIFwiU2hpZnRcIiwgXCJBbHRcIl0sXG4gICAgICAgICAga2V5OiBcIklcIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2FsbGJhY2sgPSAoKSA9PiB7XG4gICAgY29uc3QgbW9kYWwgPSBuZXcgU3lzdGVtSW5mb01vZGFsKHRoaXMucGx1Z2luLmFwcCwgdGhpcy5zZXR0aW5ncyk7XG4gICAgbW9kYWwub3BlbigpO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IFByZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgSW5kZW50TGlzdCB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0luZGVudExpc3RcIjtcbmltcG9ydCB7IElNRURldGVjdG9yIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0lNRURldGVjdG9yXCI7XG5pbXBvcnQgeyBPYnNpZGlhblNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2V0dGluZ3NcIjtcbmltcG9ydCB7IE9wZXJhdGlvblBlcmZvcm1lciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PcGVyYXRpb25QZXJmb3JtZXJcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5pbXBvcnQgeyBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayB9IGZyb20gXCIuLi91dGlscy9jcmVhdGVLZXltYXBSdW5DYWxsYmFja1wiO1xuXG5leHBvcnQgY2xhc3MgVGFiQmVoYXZpb3VyT3ZlcnJpZGUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIGltZURldGVjdG9yOiBJTUVEZXRlY3RvcixcbiAgICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBvcGVyYXRpb25QZXJmb3JtZXI6IE9wZXJhdGlvblBlcmZvcm1lcixcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBQcmVjLmhpZ2hlc3QoXG4gICAgICAgIGtleW1hcC5vZihbXG4gICAgICAgICAge1xuICAgICAgICAgICAga2V5OiBcIlRhYlwiLFxuICAgICAgICAgICAgcnVuOiBjcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgICBydW46IHRoaXMucnVuLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSxcbiAgICAgICAgXSksXG4gICAgICApLFxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3Mub3ZlcnJpZGVUYWJCZWhhdmlvdXIgJiYgIXRoaXMuaW1lRGV0ZWN0b3IuaXNPcGVuZWQoKTtcbiAgfTtcblxuICBwcml2YXRlIHJ1biA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLnBlcmZvcm0oXG4gICAgICAocm9vdCkgPT5cbiAgICAgICAgbmV3IEluZGVudExpc3Qocm9vdCwgdGhpcy5vYnNpZGlhblNldHRpbmdzLmdldERlZmF1bHRJbmRlbnRDaGFycygpKSxcbiAgICAgIGVkaXRvcixcbiAgICApO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7XG4gIEVkaXRvclZpZXcsXG4gIFBsdWdpblZhbHVlLFxuICBWaWV3UGx1Z2luLFxuICBWaWV3VXBkYXRlLFxufSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBNeUVkaXRvciwgZ2V0RWRpdG9yRnJvbVN0YXRlIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgTGlzdCB9IGZyb20gXCIuLi9yb290XCI7XG5pbXBvcnQgeyBPYnNpZGlhblNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2V0dGluZ3NcIjtcbmltcG9ydCB7IFBhcnNlciB9IGZyb20gXCIuLi9zZXJ2aWNlcy9QYXJzZXJcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzXCI7XG5cbmNvbnN0IFZFUlRJQ0FMX0xJTkVTX0JPRFlfQ0xBU1MgPSBcIm91dGxpbmVyLXBsdWdpbi12ZXJ0aWNhbC1saW5lc1wiO1xuXG5pbnRlcmZhY2UgTGluZURhdGEge1xuICB0b3A6IG51bWJlcjtcbiAgbGVmdDogbnVtYmVyO1xuICBoZWlnaHQ6IHN0cmluZztcbiAgbGlzdDogTGlzdDtcbn1cblxuY2xhc3MgVmVydGljYWxMaW5lc1BsdWdpblZhbHVlIGltcGxlbWVudHMgUGx1Z2luVmFsdWUge1xuICBwcml2YXRlIHNjaGVkdWxlZDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD47XG4gIHByaXZhdGUgc2Nyb2xsZXI6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGVkaXRvcjogTXlFZGl0b3I7XG4gIHByaXZhdGUgbGFzdExpbmU6IG51bWJlcjtcbiAgcHJpdmF0ZSBsaW5lczogTGluZURhdGFbXTtcbiAgcHJpdmF0ZSBsaW5lRWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncyxcbiAgICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBwYXJzZXI6IFBhcnNlcixcbiAgICBwcml2YXRlIHZpZXc6IEVkaXRvclZpZXcsXG4gICkge1xuICAgIHRoaXMudmlldy5zY3JvbGxET00uYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCB0aGlzLm9uU2Nyb2xsKTtcbiAgICB0aGlzLnNldHRpbmdzLm9uQ2hhbmdlKHRoaXMuc2NoZWR1bGVSZWNhbGN1bGF0ZSk7XG5cbiAgICB0aGlzLnByZXBhcmVEb20oKTtcbiAgICB0aGlzLndhaXRGb3JFZGl0b3IoKTtcbiAgfVxuXG4gIHByaXZhdGUgd2FpdEZvckVkaXRvciA9ICgpID0+IHtcbiAgICBjb25zdCBlZGl0b3IgPSBnZXRFZGl0b3JGcm9tU3RhdGUodGhpcy52aWV3LnN0YXRlKTtcbiAgICBpZiAoIWVkaXRvcikge1xuICAgICAgc2V0VGltZW91dCh0aGlzLndhaXRGb3JFZGl0b3IsIDApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcbiAgICB0aGlzLnNjaGVkdWxlUmVjYWxjdWxhdGUoKTtcbiAgfTtcblxuICBwcml2YXRlIHByZXBhcmVEb20oKSB7XG4gICAgdGhpcy5jb250ZW50Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aGlzLmNvbnRlbnRDb250YWluZXIuY2xhc3NMaXN0LmFkZChcbiAgICAgIFwib3V0bGluZXItcGx1Z2luLWxpc3QtbGluZXMtY29udGVudC1jb250YWluZXJcIixcbiAgICApO1xuXG4gICAgdGhpcy5zY3JvbGxlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGhpcy5zY3JvbGxlci5jbGFzc0xpc3QuYWRkKFwib3V0bGluZXItcGx1Z2luLWxpc3QtbGluZXMtc2Nyb2xsZXJcIik7XG5cbiAgICB0aGlzLnNjcm9sbGVyLmFwcGVuZENoaWxkKHRoaXMuY29udGVudENvbnRhaW5lcik7XG4gICAgdGhpcy52aWV3LmRvbS5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcbiAgfVxuXG4gIHByaXZhdGUgb25TY3JvbGwgPSAoZTogRXZlbnQpID0+IHtcbiAgICBjb25zdCB7IHNjcm9sbExlZnQsIHNjcm9sbFRvcCB9ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgdGhpcy5zY3JvbGxlci5zY3JvbGxUbyhzY3JvbGxMZWZ0LCBzY3JvbGxUb3ApO1xuICB9O1xuXG4gIHByaXZhdGUgc2NoZWR1bGVSZWNhbGN1bGF0ZSA9ICgpID0+IHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy5zY2hlZHVsZWQpO1xuICAgIHRoaXMuc2NoZWR1bGVkID0gc2V0VGltZW91dCh0aGlzLmNhbGN1bGF0ZSwgMCk7XG4gIH07XG5cbiAgdXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuICAgIGlmIChcbiAgICAgIHVwZGF0ZS5kb2NDaGFuZ2VkIHx8XG4gICAgICB1cGRhdGUudmlld3BvcnRDaGFuZ2VkIHx8XG4gICAgICB1cGRhdGUuZ2VvbWV0cnlDaGFuZ2VkIHx8XG4gICAgICB1cGRhdGUudHJhbnNhY3Rpb25zLnNvbWUoKHRyKSA9PiB0ci5yZWNvbmZpZ3VyZWQpXG4gICAgKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlUmVjYWxjdWxhdGUoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZSA9ICgpID0+IHtcbiAgICB0aGlzLmxpbmVzID0gW107XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLnNldHRpbmdzLnZlcnRpY2FsTGluZXMgJiZcbiAgICAgIHRoaXMub2JzaWRpYW5TZXR0aW5ncy5pc0RlZmF1bHRUaGVtZUVuYWJsZWQoKSAmJlxuICAgICAgdGhpcy52aWV3LnZpZXdwb3J0TGluZUJsb2Nrcy5sZW5ndGggPiAwICYmXG4gICAgICB0aGlzLnZpZXcudmlzaWJsZVJhbmdlcy5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICBjb25zdCBmcm9tTGluZSA9IHRoaXMuZWRpdG9yLm9mZnNldFRvUG9zKHRoaXMudmlldy52aWV3cG9ydC5mcm9tKS5saW5lO1xuICAgICAgY29uc3QgdG9MaW5lID0gdGhpcy5lZGl0b3Iub2Zmc2V0VG9Qb3ModGhpcy52aWV3LnZpZXdwb3J0LnRvKS5saW5lO1xuICAgICAgY29uc3QgbGlzdHMgPSB0aGlzLnBhcnNlci5wYXJzZVJhbmdlKHRoaXMuZWRpdG9yLCBmcm9tTGluZSwgdG9MaW5lKTtcblxuICAgICAgZm9yIChjb25zdCBsaXN0IG9mIGxpc3RzKSB7XG4gICAgICAgIHRoaXMubGFzdExpbmUgPSBsaXN0LmdldENvbnRlbnRFbmQoKS5saW5lO1xuXG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBsaXN0LmdldENoaWxkcmVuKCkpIHtcbiAgICAgICAgICB0aGlzLnJlY3Vyc2l2ZShjKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmxpbmVzLnNvcnQoKGEsIGIpID0+XG4gICAgICAgIGEudG9wID09PSBiLnRvcCA/IGEubGVmdCAtIGIubGVmdCA6IGEudG9wIC0gYi50b3AsXG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlRG9tKCk7XG4gIH07XG5cbiAgcHJpdmF0ZSBnZXROZXh0U2libGluZyhsaXN0OiBMaXN0KTogTGlzdCB8IG51bGwge1xuICAgIGxldCBsaXN0VG1wID0gbGlzdDtcbiAgICBsZXQgcCA9IGxpc3RUbXAuZ2V0UGFyZW50KCk7XG4gICAgd2hpbGUgKHApIHtcbiAgICAgIGNvbnN0IG5leHRTaWJsaW5nID0gcC5nZXROZXh0U2libGluZ09mKGxpc3RUbXApO1xuICAgICAgaWYgKG5leHRTaWJsaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXh0U2libGluZztcbiAgICAgIH1cbiAgICAgIGxpc3RUbXAgPSBwO1xuICAgICAgcCA9IGxpc3RUbXAuZ2V0UGFyZW50KCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSByZWN1cnNpdmUobGlzdDogTGlzdCwgcGFyZW50Q3R4OiB7IHJvb3RMZWZ0PzogbnVtYmVyIH0gPSB7fSkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbGlzdC5nZXRDaGlsZHJlbigpO1xuXG4gICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZyb21PZmZzZXQgPSB0aGlzLmVkaXRvci5wb3NUb09mZnNldCh7XG4gICAgICBsaW5lOiBsaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpLmxpbmUsXG4gICAgICBjaDogbGlzdC5nZXRGaXJzdExpbmVJbmRlbnQoKS5sZW5ndGgsXG4gICAgfSk7XG4gICAgY29uc3QgbmV4dFNpYmxpbmcgPSB0aGlzLmdldE5leHRTaWJsaW5nKGxpc3QpO1xuICAgIGNvbnN0IHRpbGxPZmZzZXQgPSB0aGlzLmVkaXRvci5wb3NUb09mZnNldCh7XG4gICAgICBsaW5lOiBuZXh0U2libGluZ1xuICAgICAgICA/IG5leHRTaWJsaW5nLmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpLmxpbmUgLSAxXG4gICAgICAgIDogdGhpcy5sYXN0TGluZSxcbiAgICAgIGNoOiAwLFxuICAgIH0pO1xuXG4gICAgbGV0IHZpc2libGVGcm9tID0gdGhpcy52aWV3LnZpc2libGVSYW5nZXNbMF0uZnJvbTtcbiAgICBsZXQgdmlzaWJsZVRvID1cbiAgICAgIHRoaXMudmlldy52aXNpYmxlUmFuZ2VzW3RoaXMudmlldy52aXNpYmxlUmFuZ2VzLmxlbmd0aCAtIDFdLnRvO1xuICAgIGNvbnN0IHpvb21SYW5nZSA9IHRoaXMuZWRpdG9yLmdldFpvb21SYW5nZSgpO1xuICAgIGlmICh6b29tUmFuZ2UpIHtcbiAgICAgIHZpc2libGVGcm9tID0gTWF0aC5tYXgoXG4gICAgICAgIHZpc2libGVGcm9tLFxuICAgICAgICB0aGlzLmVkaXRvci5wb3NUb09mZnNldCh6b29tUmFuZ2UuZnJvbSksXG4gICAgICApO1xuICAgICAgdmlzaWJsZVRvID0gTWF0aC5taW4odmlzaWJsZVRvLCB0aGlzLmVkaXRvci5wb3NUb09mZnNldCh6b29tUmFuZ2UudG8pKTtcbiAgICB9XG5cbiAgICBpZiAoZnJvbU9mZnNldCA+IHZpc2libGVUbyB8fCB0aWxsT2Zmc2V0IDwgdmlzaWJsZUZyb20pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb29yZHMgPSB0aGlzLnZpZXcuY29vcmRzQXRQb3MoZnJvbU9mZnNldCwgMSk7XG4gICAgaWYgKHBhcmVudEN0eC5yb290TGVmdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXJlbnRDdHgucm9vdExlZnQgPSBjb29yZHMubGVmdDtcbiAgICB9XG4gICAgY29uc3QgbGVmdCA9IE1hdGguZmxvb3IoY29vcmRzLnJpZ2h0IC0gcGFyZW50Q3R4LnJvb3RMZWZ0KTtcblxuICAgIGNvbnN0IHRvcCA9XG4gICAgICB2aXNpYmxlRnJvbSA+IDAgJiYgZnJvbU9mZnNldCA8IHZpc2libGVGcm9tXG4gICAgICAgID8gLTIwXG4gICAgICAgIDogdGhpcy52aWV3LmxpbmVCbG9ja0F0KGZyb21PZmZzZXQpLnRvcDtcbiAgICBjb25zdCBib3R0b20gPVxuICAgICAgdGlsbE9mZnNldCA+IHZpc2libGVUb1xuICAgICAgICA/IHRoaXMudmlldy5saW5lQmxvY2tBdCh2aXNpYmxlVG8gLSAxKS5ib3R0b21cbiAgICAgICAgOiB0aGlzLnZpZXcubGluZUJsb2NrQXQodGlsbE9mZnNldCkuYm90dG9tO1xuICAgIGNvbnN0IGhlaWdodCA9IGJvdHRvbSAtIHRvcDtcblxuICAgIGlmIChoZWlnaHQgPiAwICYmICFsaXN0LmlzRm9sZGVkKCkpIHtcbiAgICAgIGNvbnN0IG5leHRTaWJsaW5nID0gbGlzdC5nZXRQYXJlbnQoKS5nZXROZXh0U2libGluZ09mKGxpc3QpO1xuICAgICAgY29uc3QgaGFzTmV4dFNpYmxpbmcgPVxuICAgICAgICAhIW5leHRTaWJsaW5nICYmXG4gICAgICAgIHRoaXMuZWRpdG9yLnBvc1RvT2Zmc2V0KG5leHRTaWJsaW5nLmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpKSA8PVxuICAgICAgICAgIHZpc2libGVUbztcblxuICAgICAgdGhpcy5saW5lcy5wdXNoKHtcbiAgICAgICAgdG9wLFxuICAgICAgICBsZWZ0LFxuICAgICAgICBoZWlnaHQ6IGBjYWxjKCR7aGVpZ2h0fXB4ICR7aGFzTmV4dFNpYmxpbmcgPyBcIi0gMS41ZW1cIiA6IFwiLSAyZW1cIn0pYCxcbiAgICAgICAgbGlzdCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgIGlmICghY2hpbGQuaXNFbXB0eSgpKSB7XG4gICAgICAgIHRoaXMucmVjdXJzaXZlKGNoaWxkLCBwYXJlbnRDdHgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgb25DbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgY29uc3QgbGluZSA9IHRoaXMubGluZXNbTnVtYmVyKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pbmRleCldO1xuXG4gICAgc3dpdGNoICh0aGlzLnNldHRpbmdzLnZlcnRpY2FsTGluZXNBY3Rpb24pIHtcbiAgICAgIGNhc2UgXCJ6b29tLWluXCI6XG4gICAgICAgIHRoaXMuem9vbUluKGxpbmUpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBcInRvZ2dsZS1mb2xkaW5nXCI6XG4gICAgICAgIHRoaXMudG9nZ2xlRm9sZGluZyhsaW5lKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9O1xuXG4gIHByaXZhdGUgem9vbUluKGxpbmU6IExpbmVEYXRhKSB7XG4gICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yRnJvbVN0YXRlKHRoaXMudmlldy5zdGF0ZSk7XG5cbiAgICBlZGl0b3Iuem9vbUluKGxpbmUubGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lKTtcbiAgfVxuXG4gIHByaXZhdGUgdG9nZ2xlRm9sZGluZyhsaW5lOiBMaW5lRGF0YSkge1xuICAgIGNvbnN0IHsgbGlzdCB9ID0gbGluZTtcblxuICAgIGlmIChsaXN0LmlzRW1wdHkoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBuZWVkVG9VbmZvbGQgPSB0cnVlO1xuICAgIGNvbnN0IGxpbmVzVG9Ub2dnbGU6IG51bWJlcltdID0gW107XG4gICAgZm9yIChjb25zdCBjIG9mIGxpc3QuZ2V0Q2hpbGRyZW4oKSkge1xuICAgICAgaWYgKGMuaXNFbXB0eSgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFjLmlzRm9sZGVkKCkpIHtcbiAgICAgICAgbmVlZFRvVW5mb2xkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBsaW5lc1RvVG9nZ2xlLnB1c2goYy5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lKTtcbiAgICB9XG5cbiAgICBjb25zdCBlZGl0b3IgPSBnZXRFZGl0b3JGcm9tU3RhdGUodGhpcy52aWV3LnN0YXRlKTtcblxuICAgIGZvciAoY29uc3QgbCBvZiBsaW5lc1RvVG9nZ2xlKSB7XG4gICAgICBpZiAobmVlZFRvVW5mb2xkKSB7XG4gICAgICAgIGVkaXRvci51bmZvbGQobCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlZGl0b3IuZm9sZChsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZURvbSgpIHtcbiAgICBjb25zdCBjbVNjcm9sbCA9IHRoaXMudmlldy5zY3JvbGxET007XG4gICAgY29uc3QgY21Db250ZW50ID0gdGhpcy52aWV3LmNvbnRlbnRET007XG4gICAgY29uc3QgY21Db250ZW50Q29udGFpbmVyID0gY21Db250ZW50LnBhcmVudEVsZW1lbnQ7XG4gICAgY29uc3QgY21TaXplciA9IGNtQ29udGVudENvbnRhaW5lci5wYXJlbnRFbGVtZW50O1xuXG4gICAgLyoqXG4gICAgICogT2JzaWRpYW4gY2FuIGFkZCBhZGRpdGlvbmFsIGVsZW1lbnRzIGludG8gQ29udGVudCBNYW5hZ2VyLlxuICAgICAqIFRoZSBtb3N0IG9idmlvdXMgY2FzZSBpcyB0aGUgJ2VtYmVkZGVkLWJhY2tsaW5rcycgY29yZSBwbHVnaW4gdGhhdCBhZGRzIGEgbWVudSBpbnNpZGUgYSBDb250ZW50IE1hbmFnZXIuXG4gICAgICogV2UgbXVzdCB0YWtlIGhlaWdodHMgb2YgYWxsIG9mIHRoZXNlIGVsZW1lbnRzIGludG8gYWNjb3VudFxuICAgICAqIHRvIGJlIGFibGUgdG8gY2FsY3VsYXRlIHRoZSBjb3JyZWN0IHNpemUgb2YgbGluZXMnIGNvbnRhaW5lci5cbiAgICAgKi9cbiAgICBsZXQgY21TaXplckNoaWxkcmVuU3VtSGVpZ2h0ID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNtU2l6ZXIuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNtU2l6ZXJDaGlsZHJlblN1bUhlaWdodCArPSBjbVNpemVyLmNoaWxkcmVuW2ldLmNsaWVudEhlaWdodDtcbiAgICB9XG5cbiAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLnRvcCA9IGNtU2Nyb2xsLm9mZnNldFRvcCArIFwicHhcIjtcbiAgICB0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gY21TaXplckNoaWxkcmVuU3VtSGVpZ2h0ICsgXCJweFwiO1xuICAgIHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5tYXJnaW5MZWZ0ID1cbiAgICAgIGNtQ29udGVudENvbnRhaW5lci5vZmZzZXRMZWZ0ICsgXCJweFwiO1xuICAgIHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5tYXJnaW5Ub3AgPVxuICAgICAgKGNtQ29udGVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCkub2Zmc2V0VG9wIC0gMjQgKyBcInB4XCI7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh0aGlzLmxpbmVFbGVtZW50cy5sZW5ndGggPT09IGkpIHtcbiAgICAgICAgY29uc3QgZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGUuY2xhc3NMaXN0LmFkZChcIm91dGxpbmVyLXBsdWdpbi1saXN0LWxpbmVcIik7XG4gICAgICAgIGUuZGF0YXNldC5pbmRleCA9IFN0cmluZyhpKTtcbiAgICAgICAgZS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIHRoaXMub25DbGljayk7XG4gICAgICAgIHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChlKTtcbiAgICAgICAgdGhpcy5saW5lRWxlbWVudHMucHVzaChlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbCA9IHRoaXMubGluZXNbaV07XG4gICAgICBjb25zdCBlID0gdGhpcy5saW5lRWxlbWVudHNbaV07XG4gICAgICBlLnN0eWxlLnRvcCA9IGwudG9wICsgXCJweFwiO1xuICAgICAgZS5zdHlsZS5sZWZ0ID0gbC5sZWZ0ICsgXCJweFwiO1xuICAgICAgZS5zdHlsZS5oZWlnaHQgPSBsLmhlaWdodDtcbiAgICAgIGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpID0gdGhpcy5saW5lcy5sZW5ndGg7IGkgPCB0aGlzLmxpbmVFbGVtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgZSA9IHRoaXMubGluZUVsZW1lbnRzW2ldO1xuICAgICAgZS5zdHlsZS50b3AgPSBcIjBweFwiO1xuICAgICAgZS5zdHlsZS5sZWZ0ID0gXCIwcHhcIjtcbiAgICAgIGUuc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cbiAgfVxuXG4gIGRlc3Ryb3koKSB7XG4gICAgdGhpcy5zZXR0aW5ncy5yZW1vdmVDYWxsYmFjayh0aGlzLnNjaGVkdWxlUmVjYWxjdWxhdGUpO1xuICAgIHRoaXMudmlldy5zY3JvbGxET00ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCB0aGlzLm9uU2Nyb2xsKTtcbiAgICB0aGlzLnZpZXcuZG9tLnJlbW92ZUNoaWxkKHRoaXMuc2Nyb2xsZXIpO1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnNjaGVkdWxlZCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFZlcnRpY2FsTGluZXMgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgcHJpdmF0ZSB1cGRhdGVCb2R5Q2xhc3NJbnRlcnZhbDogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICAgcHJpdmF0ZSBvYnNpZGlhblNldHRpbmdzOiBPYnNpZGlhblNldHRpbmdzLFxuICAgIHByaXZhdGUgcGFyc2VyOiBQYXJzZXIsXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMudXBkYXRlQm9keUNsYXNzKCk7XG4gICAgdGhpcy51cGRhdGVCb2R5Q2xhc3NJbnRlcnZhbCA9IHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICB0aGlzLnVwZGF0ZUJvZHlDbGFzcygpO1xuICAgIH0sIDEwMDApO1xuXG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBWaWV3UGx1Z2luLmRlZmluZShcbiAgICAgICAgKHZpZXcpID0+XG4gICAgICAgICAgbmV3IFZlcnRpY2FsTGluZXNQbHVnaW5WYWx1ZShcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgICAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MsXG4gICAgICAgICAgICB0aGlzLnBhcnNlcixcbiAgICAgICAgICAgIHZpZXcsXG4gICAgICAgICAgKSxcbiAgICAgICksXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHtcbiAgICBjbGVhckludGVydmFsKHRoaXMudXBkYXRlQm9keUNsYXNzSW50ZXJ2YWwpO1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShWRVJUSUNBTF9MSU5FU19CT0RZX0NMQVNTKTtcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlQm9keUNsYXNzID0gKCkgPT4ge1xuICAgIGNvbnN0IHNob3VsZEV4aXN0cyA9XG4gICAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MuaXNEZWZhdWx0VGhlbWVFbmFibGVkKCkgJiZcbiAgICAgIHRoaXMuc2V0dGluZ3MudmVydGljYWxMaW5lcztcbiAgICBjb25zdCBleGlzdHMgPSBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucyhWRVJUSUNBTF9MSU5FU19CT0RZX0NMQVNTKTtcblxuICAgIGlmIChzaG91bGRFeGlzdHMgJiYgIWV4aXN0cykge1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKFZFUlRJQ0FMX0xJTkVTX0JPRFlfQ0xBU1MpO1xuICAgIH1cblxuICAgIGlmICghc2hvdWxkRXhpc3RzICYmIGV4aXN0cykge1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKFZFUlRJQ0FMX0xJTkVTX0JPRFlfQ0xBU1MpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL2VkaXRvclwiO1xuaW1wb3J0IHsgTGlzdCwgUG9zaXRpb24sIFJvb3QsIGlzUmFuZ2VzSW50ZXJzZWN0cyB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VzQXBwbGljYXRvciB7XG4gIGFwcGx5KGVkaXRvcjogTXlFZGl0b3IsIHByZXZSb290OiBSb290LCBuZXdSb290OiBSb290KSB7XG4gICAgY29uc3QgY2hhbmdlcyA9IHRoaXMuY2FsY3VsYXRlQ2hhbmdlcyhlZGl0b3IsIHByZXZSb290LCBuZXdSb290KTtcbiAgICBpZiAoY2hhbmdlcykge1xuICAgICAgY29uc3QgeyByZXBsYWNlbWVudCwgY2hhbmdlRnJvbSwgY2hhbmdlVG8gfSA9IGNoYW5nZXM7XG5cbiAgICAgIGNvbnN0IHsgdW5mb2xkLCBmb2xkIH0gPSB0aGlzLmNhbGN1bGF0ZUZvbGRpbmdPcHJhdGlvbnMoXG4gICAgICAgIHByZXZSb290LFxuICAgICAgICBuZXdSb290LFxuICAgICAgICBjaGFuZ2VGcm9tLFxuICAgICAgICBjaGFuZ2VUbyxcbiAgICAgICk7XG5cbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiB1bmZvbGQpIHtcbiAgICAgICAgZWRpdG9yLnVuZm9sZChsaW5lKTtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VSYW5nZShyZXBsYWNlbWVudCwgY2hhbmdlRnJvbSwgY2hhbmdlVG8pO1xuXG4gICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgZm9sZCkge1xuICAgICAgICBlZGl0b3IuZm9sZChsaW5lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBlZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdSb290LmdldFNlbGVjdGlvbnMoKSk7XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZUNoYW5nZXMoZWRpdG9yOiBNeUVkaXRvciwgcHJldlJvb3Q6IFJvb3QsIG5ld1Jvb3Q6IFJvb3QpIHtcbiAgICBjb25zdCByb290UmFuZ2UgPSBwcmV2Um9vdC5nZXRDb250ZW50UmFuZ2UoKTtcbiAgICBjb25zdCBvbGRTdHJpbmcgPSBlZGl0b3IuZ2V0UmFuZ2Uocm9vdFJhbmdlWzBdLCByb290UmFuZ2VbMV0pO1xuICAgIGNvbnN0IG5ld1N0cmluZyA9IG5ld1Jvb3QucHJpbnQoKTtcblxuICAgIGNvbnN0IGNoYW5nZUZyb20gPSB7IC4uLnJvb3RSYW5nZVswXSB9O1xuICAgIGNvbnN0IGNoYW5nZVRvID0geyAuLi5yb290UmFuZ2VbMV0gfTtcbiAgICBsZXQgb2xkVG1wID0gb2xkU3RyaW5nO1xuICAgIGxldCBuZXdUbXAgPSBuZXdTdHJpbmc7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbmxJbmRleCA9IG9sZFRtcC5sYXN0SW5kZXhPZihcIlxcblwiKTtcblxuICAgICAgaWYgKG5sSW5kZXggPCAwKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvbGRMaW5lID0gb2xkVG1wLnNsaWNlKG5sSW5kZXgpO1xuICAgICAgY29uc3QgbmV3TGluZSA9IG5ld1RtcC5zbGljZSgtb2xkTGluZS5sZW5ndGgpO1xuXG4gICAgICBpZiAob2xkTGluZSAhPT0gbmV3TGluZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgb2xkVG1wID0gb2xkVG1wLnNsaWNlKDAsIC1vbGRMaW5lLmxlbmd0aCk7XG4gICAgICBuZXdUbXAgPSBuZXdUbXAuc2xpY2UoMCwgLW9sZExpbmUubGVuZ3RoKTtcbiAgICAgIGNvbnN0IG5sSW5kZXgyID0gb2xkVG1wLmxhc3RJbmRleE9mKFwiXFxuXCIpO1xuICAgICAgY2hhbmdlVG8uY2ggPVxuICAgICAgICBubEluZGV4MiA+PSAwID8gb2xkVG1wLmxlbmd0aCAtIG5sSW5kZXgyIC0gMSA6IG9sZFRtcC5sZW5ndGg7XG4gICAgICBjaGFuZ2VUby5saW5lLS07XG4gICAgfVxuXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IG5sSW5kZXggPSBvbGRUbXAuaW5kZXhPZihcIlxcblwiKTtcblxuICAgICAgaWYgKG5sSW5kZXggPCAwKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvbGRMaW5lID0gb2xkVG1wLnNsaWNlKDAsIG5sSW5kZXggKyAxKTtcbiAgICAgIGNvbnN0IG5ld0xpbmUgPSBuZXdUbXAuc2xpY2UoMCwgb2xkTGluZS5sZW5ndGgpO1xuXG4gICAgICBpZiAob2xkTGluZSAhPT0gbmV3TGluZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2hhbmdlRnJvbS5saW5lKys7XG4gICAgICBvbGRUbXAgPSBvbGRUbXAuc2xpY2Uob2xkTGluZS5sZW5ndGgpO1xuICAgICAgbmV3VG1wID0gbmV3VG1wLnNsaWNlKG9sZExpbmUubGVuZ3RoKTtcbiAgICB9XG5cbiAgICBpZiAob2xkVG1wID09PSBuZXdUbXApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZXBsYWNlbWVudDogbmV3VG1wLFxuICAgICAgY2hhbmdlRnJvbSxcbiAgICAgIGNoYW5nZVRvLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZUZvbGRpbmdPcHJhdGlvbnMoXG4gICAgcHJldlJvb3Q6IFJvb3QsXG4gICAgbmV3Um9vdDogUm9vdCxcbiAgICBjaGFuZ2VGcm9tOiBQb3NpdGlvbixcbiAgICBjaGFuZ2VUbzogUG9zaXRpb24sXG4gICkge1xuICAgIGNvbnN0IGNoYW5nZWRSYW5nZTogW1Bvc2l0aW9uLCBQb3NpdGlvbl0gPSBbY2hhbmdlRnJvbSwgY2hhbmdlVG9dO1xuXG4gICAgY29uc3QgcHJldkxpc3RzID0gZ2V0QWxsQ2hpbGRyZW4ocHJldlJvb3QpO1xuICAgIGNvbnN0IG5ld0xpc3RzID0gZ2V0QWxsQ2hpbGRyZW4obmV3Um9vdCk7XG5cbiAgICBjb25zdCB1bmZvbGQ6IG51bWJlcltdID0gW107XG4gICAgY29uc3QgZm9sZDogbnVtYmVyW10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgcHJldkxpc3Qgb2YgcHJldkxpc3RzLnZhbHVlcygpKSB7XG4gICAgICBpZiAoIXByZXZMaXN0LmlzRm9sZFJvb3QoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbmV3TGlzdCA9IG5ld0xpc3RzLmdldChwcmV2TGlzdC5nZXRJRCgpKTtcblxuICAgICAgaWYgKCFuZXdMaXN0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwcmV2TGlzdFJhbmdlOiBbUG9zaXRpb24sIFBvc2l0aW9uXSA9IFtcbiAgICAgICAgcHJldkxpc3QuZ2V0Rmlyc3RMaW5lQ29udGVudFN0YXJ0KCksXG4gICAgICAgIHByZXZMaXN0LmdldENvbnRlbnRFbmRJbmNsdWRpbmdDaGlsZHJlbigpLFxuICAgICAgXTtcblxuICAgICAgaWYgKGlzUmFuZ2VzSW50ZXJzZWN0cyhwcmV2TGlzdFJhbmdlLCBjaGFuZ2VkUmFuZ2UpKSB7XG4gICAgICAgIHVuZm9sZC5wdXNoKHByZXZMaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpLmxpbmUpO1xuICAgICAgICBmb2xkLnB1c2gobmV3TGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKS5saW5lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB1bmZvbGQuc29ydCgoYSwgYikgPT4gYiAtIGEpO1xuICAgIGZvbGQuc29ydCgoYSwgYikgPT4gYiAtIGEpO1xuXG4gICAgcmV0dXJuIHsgdW5mb2xkLCBmb2xkIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0QWxsQ2hpbGRyZW5SZWR1Y2VGbihhY2M6IE1hcDxudW1iZXIsIExpc3Q+LCBjaGlsZDogTGlzdCkge1xuICBhY2Muc2V0KGNoaWxkLmdldElEKCksIGNoaWxkKTtcbiAgY2hpbGQuZ2V0Q2hpbGRyZW4oKS5yZWR1Y2UoZ2V0QWxsQ2hpbGRyZW5SZWR1Y2VGbiwgYWNjKTtcblxuICByZXR1cm4gYWNjO1xufVxuXG5mdW5jdGlvbiBnZXRBbGxDaGlsZHJlbihyb290OiBSb290KTogTWFwPG51bWJlciwgTGlzdD4ge1xuICByZXR1cm4gcm9vdC5nZXRDaGlsZHJlbigpLnJlZHVjZShnZXRBbGxDaGlsZHJlblJlZHVjZUZuLCBuZXcgTWFwKCkpO1xufVxuIiwiaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGNsYXNzIElNRURldGVjdG9yIHtcbiAgcHJpdmF0ZSBjb21wb3NpdGlvbiA9IGZhbHNlO1xuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNvbXBvc2l0aW9uc3RhcnRcIiwgdGhpcy5vbkNvbXBvc2l0aW9uU3RhcnQpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjb21wb3NpdGlvbmVuZFwiLCB0aGlzLm9uQ29tcG9zaXRpb25FbmQpO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjb21wb3NpdGlvbmVuZFwiLCB0aGlzLm9uQ29tcG9zaXRpb25FbmQpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjb21wb3NpdGlvbnN0YXJ0XCIsIHRoaXMub25Db21wb3NpdGlvblN0YXJ0KTtcbiAgfVxuXG4gIGlzT3BlbmVkKCkge1xuICAgIHJldHVybiB0aGlzLmNvbXBvc2l0aW9uICYmIFBsYXRmb3JtLmlzRGVza3RvcDtcbiAgfVxuXG4gIHByaXZhdGUgb25Db21wb3NpdGlvblN0YXJ0ID0gKCkgPT4ge1xuICAgIHRoaXMuY29tcG9zaXRpb24gPSB0cnVlO1xuICB9O1xuXG4gIHByaXZhdGUgb25Db21wb3NpdGlvbkVuZCA9ICgpID0+IHtcbiAgICB0aGlzLmNvbXBvc2l0aW9uID0gZmFsc2U7XG4gIH07XG59XG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55ICovXG5pbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuL1NldHRpbmdzXCI7XG5cbmV4cG9ydCBjbGFzcyBMb2dnZXIge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5ncykge31cblxuICBsb2cobWV0aG9kOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmRlYnVnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5pbmZvKG1ldGhvZCwgLi4uYXJncyk7XG4gIH1cblxuICBiaW5kKG1ldGhvZDogc3RyaW5nKSB7XG4gICAgcmV0dXJuICguLi5hcmdzOiBhbnlbXSkgPT4gdGhpcy5sb2cobWV0aG9kLCAuLi5hcmdzKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgQXBwIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzaWRpYW5UYWJzU2V0dGluZ3Mge1xuICB1c2VUYWI6IGJvb2xlYW47XG4gIHRhYlNpemU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBPYnNpZGlhbkZvbGRTZXR0aW5ncyB7XG4gIGZvbGRJbmRlbnQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGdldEhpZGRlbk9ic2lkaWFuQ29uZmlnKGFwcDogQXBwKSB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIHJldHVybiAoYXBwLnZhdWx0IGFzIGFueSkuY29uZmlnO1xufVxuXG5leHBvcnQgY2xhc3MgT2JzaWRpYW5TZXR0aW5ncyB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgYXBwOiBBcHApIHt9XG5cbiAgaXNMZWdhY3lFZGl0b3JFbmFibGVkKCkge1xuICAgIGNvbnN0IGNvbmZpZzogeyBsZWdhY3lFZGl0b3I6IGJvb2xlYW4gfSA9IHtcbiAgICAgIGxlZ2FjeUVkaXRvcjogZmFsc2UsXG4gICAgICAuLi5nZXRIaWRkZW5PYnNpZGlhbkNvbmZpZyh0aGlzLmFwcCksXG4gICAgfTtcblxuICAgIHJldHVybiBjb25maWcubGVnYWN5RWRpdG9yO1xuICB9XG5cbiAgaXNEZWZhdWx0VGhlbWVFbmFibGVkKCkge1xuICAgIGNvbnN0IGNvbmZpZzogeyBjc3NUaGVtZTogc3RyaW5nIH0gPSB7XG4gICAgICBjc3NUaGVtZTogXCJcIixcbiAgICAgIC4uLmdldEhpZGRlbk9ic2lkaWFuQ29uZmlnKHRoaXMuYXBwKSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGNvbmZpZy5jc3NUaGVtZSA9PT0gXCJcIjtcbiAgfVxuXG4gIGdldFRhYnNTZXR0aW5ncygpOiBPYnNpZGlhblRhYnNTZXR0aW5ncyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHVzZVRhYjogdHJ1ZSxcbiAgICAgIHRhYlNpemU6IDQsXG4gICAgICAuLi5nZXRIaWRkZW5PYnNpZGlhbkNvbmZpZyh0aGlzLmFwcCksXG4gICAgfTtcbiAgfVxuXG4gIGdldEZvbGRTZXR0aW5ncygpOiBPYnNpZGlhbkZvbGRTZXR0aW5ncyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZvbGRJbmRlbnQ6IHRydWUsXG4gICAgICAuLi5nZXRIaWRkZW5PYnNpZGlhbkNvbmZpZyh0aGlzLmFwcCksXG4gICAgfTtcbiAgfVxuXG4gIGdldERlZmF1bHRJbmRlbnRDaGFycygpIHtcbiAgICBjb25zdCB7IHVzZVRhYiwgdGFiU2l6ZSB9ID0gdGhpcy5nZXRUYWJzU2V0dGluZ3MoKTtcblxuICAgIHJldHVybiB1c2VUYWIgPyBcIlxcdFwiIDogbmV3IEFycmF5KHRhYlNpemUpLmZpbGwoXCIgXCIpLmpvaW4oXCJcIik7XG4gIH1cbn1cbiIsImltcG9ydCB7IENoYW5nZXNBcHBsaWNhdG9yIH0gZnJvbSBcIi4vQ2hhbmdlc0FwcGxpY2F0b3JcIjtcbmltcG9ydCB7IFBhcnNlciB9IGZyb20gXCIuL1BhcnNlclwiO1xuXG5pbXBvcnQgeyBNeUVkaXRvciB9IGZyb20gXCIuLi9lZGl0b3JcIjtcbmltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL09wZXJhdGlvblwiO1xuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBPcGVyYXRpb25QZXJmb3JtZXIge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBhcnNlcjogUGFyc2VyLFxuICAgIHByaXZhdGUgY2hhbmdlc0FwcGxpY2F0b3I6IENoYW5nZXNBcHBsaWNhdG9yLFxuICApIHt9XG5cbiAgZXZhbChyb290OiBSb290LCBvcDogT3BlcmF0aW9uLCBlZGl0b3I6IE15RWRpdG9yKSB7XG4gICAgY29uc3QgcHJldlJvb3QgPSByb290LmNsb25lKCk7XG5cbiAgICBvcC5wZXJmb3JtKCk7XG5cbiAgICBpZiAob3Auc2hvdWxkVXBkYXRlKCkpIHtcbiAgICAgIHRoaXMuY2hhbmdlc0FwcGxpY2F0b3IuYXBwbHkoZWRpdG9yLCBwcmV2Um9vdCwgcm9vdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3VsZFVwZGF0ZTogb3Auc2hvdWxkVXBkYXRlKCksXG4gICAgICBzaG91bGRTdG9wUHJvcGFnYXRpb246IG9wLnNob3VsZFN0b3BQcm9wYWdhdGlvbigpLFxuICAgIH07XG4gIH1cblxuICBwZXJmb3JtKFxuICAgIGNiOiAocm9vdDogUm9vdCkgPT4gT3BlcmF0aW9uLFxuICAgIGVkaXRvcjogTXlFZGl0b3IsXG4gICAgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvcigpLFxuICApIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5wYXJzZXIucGFyc2UoZWRpdG9yLCBjdXJzb3IpO1xuXG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm4geyBzaG91bGRVcGRhdGU6IGZhbHNlLCBzaG91bGRTdG9wUHJvcGFnYXRpb246IGZhbHNlIH07XG4gICAgfVxuXG4gICAgY29uc3Qgb3AgPSBjYihyb290KTtcblxuICAgIHJldHVybiB0aGlzLmV2YWwocm9vdCwgb3AsIGVkaXRvcik7XG4gIH1cbn1cbiIsImltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuL0xvZ2dlclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi9TZXR0aW5nc1wiO1xuXG5pbXBvcnQgeyBMaXN0LCBSb290IH0gZnJvbSBcIi4uL3Jvb3RcIjtcbmltcG9ydCB7IGNoZWNrYm94UmUgfSBmcm9tIFwiLi4vdXRpbHMvY2hlY2tib3hSZVwiO1xuXG5jb25zdCBidWxsZXRTaWduUmUgPSBgKD86Wy0qK118XFxcXGQrXFxcXC4pYDtcbmNvbnN0IG9wdGlvbmFsQ2hlY2tib3hSZSA9IGAoPzoke2NoZWNrYm94UmV9KT9gO1xuXG5jb25zdCBsaXN0SXRlbVdpdGhvdXRTcGFjZXNSZSA9IG5ldyBSZWdFeHAoYF4ke2J1bGxldFNpZ25SZX0oIHxcXHQpYCk7XG5jb25zdCBsaXN0SXRlbVJlID0gbmV3IFJlZ0V4cChgXlsgXFx0XSoke2J1bGxldFNpZ25SZX0oIHxcXHQpYCk7XG5jb25zdCBzdHJpbmdXaXRoU3BhY2VzUmUgPSBuZXcgUmVnRXhwKGBeWyBcXHRdK2ApO1xuY29uc3QgcGFyc2VMaXN0SXRlbVJlID0gbmV3IFJlZ0V4cChcbiAgYF4oWyBcXHRdKikoJHtidWxsZXRTaWduUmV9KSggfFxcdCkoJHtvcHRpb25hbENoZWNrYm94UmV9KSguKikkYCxcbik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhZGVyUG9zaXRpb24ge1xuICBsaW5lOiBudW1iZXI7XG4gIGNoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhZGVyU2VsZWN0aW9uIHtcbiAgYW5jaG9yOiBSZWFkZXJQb3NpdGlvbjtcbiAgaGVhZDogUmVhZGVyUG9zaXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhZGVyIHtcbiAgZ2V0Q3Vyc29yKCk6IFJlYWRlclBvc2l0aW9uO1xuICBnZXRMaW5lKG46IG51bWJlcik6IHN0cmluZztcbiAgbGFzdExpbmUoKTogbnVtYmVyO1xuICBsaXN0U2VsZWN0aW9ucygpOiBSZWFkZXJTZWxlY3Rpb25bXTtcbiAgZ2V0QWxsRm9sZGVkTGluZXMoKTogbnVtYmVyW107XG59XG5cbmludGVyZmFjZSBQYXJzZUxpc3RMaXN0IHtcbiAgZ2V0Rmlyc3RMaW5lSW5kZW50KCk6IHN0cmluZztcbiAgc2V0Tm90ZXNJbmRlbnQobm90ZXNJbmRlbnQ6IHN0cmluZyk6IHZvaWQ7XG4gIGdldE5vdGVzSW5kZW50KCk6IHN0cmluZyB8IG51bGw7XG4gIGFkZExpbmUodGV4dDogc3RyaW5nKTogdm9pZDtcbiAgZ2V0UGFyZW50KCk6IFBhcnNlTGlzdExpc3QgfCBudWxsO1xuICBhZGRBZnRlckFsbChsaXN0OiBQYXJzZUxpc3RMaXN0KTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFBhcnNlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgbG9nZ2VyOiBMb2dnZXIsXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3MsXG4gICkge31cblxuICBwYXJzZVJhbmdlKGVkaXRvcjogUmVhZGVyLCBmcm9tTGluZSA9IDAsIHRvTGluZSA9IGVkaXRvci5sYXN0TGluZSgpKTogUm9vdFtdIHtcbiAgICBjb25zdCBsaXN0czogUm9vdFtdID0gW107XG5cbiAgICBmb3IgKGxldCBpID0gZnJvbUxpbmU7IGkgPD0gdG9MaW5lOyBpKyspIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBlZGl0b3IuZ2V0TGluZShpKTtcblxuICAgICAgaWYgKGkgPT09IGZyb21MaW5lIHx8IHRoaXMuaXNMaXN0SXRlbShsaW5lKSkge1xuICAgICAgICBjb25zdCBsaXN0ID0gdGhpcy5wYXJzZVdpdGhMaW1pdHMoZWRpdG9yLCBpLCBmcm9tTGluZSwgdG9MaW5lKTtcblxuICAgICAgICBpZiAobGlzdCkge1xuICAgICAgICAgIGxpc3RzLnB1c2gobGlzdCk7XG4gICAgICAgICAgaSA9IGxpc3QuZ2V0Q29udGVudEVuZCgpLmxpbmU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbGlzdHM7XG4gIH1cblxuICBwYXJzZShlZGl0b3I6IFJlYWRlciwgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvcigpKTogUm9vdCB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLnBhcnNlV2l0aExpbWl0cyhlZGl0b3IsIGN1cnNvci5saW5lLCAwLCBlZGl0b3IubGFzdExpbmUoKSk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlV2l0aExpbWl0cyhcbiAgICBlZGl0b3I6IFJlYWRlcixcbiAgICBwYXJzaW5nU3RhcnRMaW5lOiBudW1iZXIsXG4gICAgbGltaXRGcm9tOiBudW1iZXIsXG4gICAgbGltaXRUbzogbnVtYmVyLFxuICApOiBSb290IHwgbnVsbCB7XG4gICAgY29uc3QgZCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJwYXJzZUxpc3RcIik7XG4gICAgY29uc3QgZXJyb3IgPSAobXNnOiBzdHJpbmcpOiBudWxsID0+IHtcbiAgICAgIGQobXNnKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH07XG5cbiAgICBjb25zdCBsaW5lID0gZWRpdG9yLmdldExpbmUocGFyc2luZ1N0YXJ0TGluZSk7XG5cbiAgICBsZXQgbGlzdExvb2tpbmdQb3M6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKHRoaXMuaXNMaXN0SXRlbShsaW5lKSkge1xuICAgICAgbGlzdExvb2tpbmdQb3MgPSBwYXJzaW5nU3RhcnRMaW5lO1xuICAgIH0gZWxzZSBpZiAodGhpcy5pc0xpbmVXaXRoSW5kZW50KGxpbmUpKSB7XG4gICAgICBsZXQgbGlzdExvb2tpbmdQb3NTZWFyY2ggPSBwYXJzaW5nU3RhcnRMaW5lIC0gMTtcbiAgICAgIHdoaWxlIChsaXN0TG9va2luZ1Bvc1NlYXJjaCA+PSAwKSB7XG4gICAgICAgIGNvbnN0IGxpbmUgPSBlZGl0b3IuZ2V0TGluZShsaXN0TG9va2luZ1Bvc1NlYXJjaCk7XG4gICAgICAgIGlmICh0aGlzLmlzTGlzdEl0ZW0obGluZSkpIHtcbiAgICAgICAgICBsaXN0TG9va2luZ1BvcyA9IGxpc3RMb29raW5nUG9zU2VhcmNoO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNMaW5lV2l0aEluZGVudChsaW5lKSkge1xuICAgICAgICAgIGxpc3RMb29raW5nUG9zU2VhcmNoLS07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGlzdExvb2tpbmdQb3MgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBsaXN0U3RhcnRMaW5lOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgbGlzdFN0YXJ0TGluZUxvb2t1cCA9IGxpc3RMb29raW5nUG9zO1xuICAgIHdoaWxlIChsaXN0U3RhcnRMaW5lTG9va3VwID49IDApIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBlZGl0b3IuZ2V0TGluZShsaXN0U3RhcnRMaW5lTG9va3VwKTtcbiAgICAgIGlmICghdGhpcy5pc0xpc3RJdGVtKGxpbmUpICYmICF0aGlzLmlzTGluZVdpdGhJbmRlbnQobGluZSkpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5pc0xpc3RJdGVtV2l0aG91dFNwYWNlcyhsaW5lKSkge1xuICAgICAgICBsaXN0U3RhcnRMaW5lID0gbGlzdFN0YXJ0TGluZUxvb2t1cDtcbiAgICAgICAgaWYgKGxpc3RTdGFydExpbmVMb29rdXAgPD0gbGltaXRGcm9tKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpc3RTdGFydExpbmVMb29rdXAtLTtcbiAgICB9XG5cbiAgICBpZiAobGlzdFN0YXJ0TGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IGxpc3RFbmRMaW5lID0gbGlzdExvb2tpbmdQb3M7XG4gICAgbGV0IGxpc3RFbmRMaW5lTG9va3VwID0gbGlzdExvb2tpbmdQb3M7XG4gICAgd2hpbGUgKGxpc3RFbmRMaW5lTG9va3VwIDw9IGVkaXRvci5sYXN0TGluZSgpKSB7XG4gICAgICBjb25zdCBsaW5lID0gZWRpdG9yLmdldExpbmUobGlzdEVuZExpbmVMb29rdXApO1xuICAgICAgaWYgKCF0aGlzLmlzTGlzdEl0ZW0obGluZSkgJiYgIXRoaXMuaXNMaW5lV2l0aEluZGVudChsaW5lKSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmICghdGhpcy5pc0VtcHR5TGluZShsaW5lKSkge1xuICAgICAgICBsaXN0RW5kTGluZSA9IGxpc3RFbmRMaW5lTG9va3VwO1xuICAgICAgfVxuICAgICAgaWYgKGxpc3RFbmRMaW5lTG9va3VwID49IGxpbWl0VG8pIHtcbiAgICAgICAgbGlzdEVuZExpbmUgPSBsaW1pdFRvO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGxpc3RFbmRMaW5lTG9va3VwKys7XG4gICAgfVxuXG4gICAgaWYgKGxpc3RTdGFydExpbmUgPiBwYXJzaW5nU3RhcnRMaW5lIHx8IGxpc3RFbmRMaW5lIDwgcGFyc2luZ1N0YXJ0TGluZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlIGxhc3QgbGluZSBjb250YWlucyBvbmx5IHNwYWNlcyBhbmQgdGhhdCdzIGluY29ycmVjdCBpbmRlbnQsIHRoZW4gaWdub3JlIHRoZSBsYXN0IGxpbmVcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vdnNsaW5rby9vYnNpZGlhbi1vdXRsaW5lci9pc3N1ZXMvMzY4XG4gICAgaWYgKGxpc3RFbmRMaW5lID4gbGlzdFN0YXJ0TGluZSkge1xuICAgICAgY29uc3QgbGFzdExpbmUgPSBlZGl0b3IuZ2V0TGluZShsaXN0RW5kTGluZSk7XG4gICAgICBpZiAobGFzdExpbmUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb25zdCBwcmV2TGluZSA9IGVkaXRvci5nZXRMaW5lKGxpc3RFbmRMaW5lIC0gMSk7XG4gICAgICAgIGNvbnN0IFssIHByZXZMaW5lSW5kZW50XSA9IC9eKFxccyopLy5leGVjKHByZXZMaW5lKTtcbiAgICAgICAgaWYgKCFsYXN0TGluZS5zdGFydHNXaXRoKHByZXZMaW5lSW5kZW50KSkge1xuICAgICAgICAgIGxpc3RFbmRMaW5lLS07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFJvb3QoXG4gICAgICB7IGxpbmU6IGxpc3RTdGFydExpbmUsIGNoOiAwIH0sXG4gICAgICB7IGxpbmU6IGxpc3RFbmRMaW5lLCBjaDogZWRpdG9yLmdldExpbmUobGlzdEVuZExpbmUpLmxlbmd0aCB9LFxuICAgICAgZWRpdG9yLmxpc3RTZWxlY3Rpb25zKCkubWFwKChyKSA9PiAoe1xuICAgICAgICBhbmNob3I6IHsgbGluZTogci5hbmNob3IubGluZSwgY2g6IHIuYW5jaG9yLmNoIH0sXG4gICAgICAgIGhlYWQ6IHsgbGluZTogci5oZWFkLmxpbmUsIGNoOiByLmhlYWQuY2ggfSxcbiAgICAgIH0pKSxcbiAgICApO1xuXG4gICAgbGV0IGN1cnJlbnRQYXJlbnQ6IFBhcnNlTGlzdExpc3QgPSByb290LmdldFJvb3RMaXN0KCk7XG4gICAgbGV0IGN1cnJlbnRMaXN0OiBQYXJzZUxpc3RMaXN0IHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IGN1cnJlbnRJbmRlbnQgPSBcIlwiO1xuXG4gICAgY29uc3QgZm9sZGVkTGluZXMgPSBlZGl0b3IuZ2V0QWxsRm9sZGVkTGluZXMoKTtcblxuICAgIGZvciAobGV0IGwgPSBsaXN0U3RhcnRMaW5lOyBsIDw9IGxpc3RFbmRMaW5lOyBsKyspIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBlZGl0b3IuZ2V0TGluZShsKTtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSBwYXJzZUxpc3RJdGVtUmUuZXhlYyhsaW5lKTtcblxuICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgWywgaW5kZW50LCBidWxsZXQsIHNwYWNlQWZ0ZXJCdWxsZXRdID0gbWF0Y2hlcztcbiAgICAgICAgbGV0IFssICwgLCAsIG9wdGlvbmFsQ2hlY2tib3gsIGNvbnRlbnRdID0gbWF0Y2hlcztcblxuICAgICAgICBjb250ZW50ID0gb3B0aW9uYWxDaGVja2JveCArIGNvbnRlbnQ7XG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmtlZXBDdXJzb3JXaXRoaW5Db250ZW50ICE9PSBcImJ1bGxldC1hbmQtY2hlY2tib3hcIikge1xuICAgICAgICAgIG9wdGlvbmFsQ2hlY2tib3ggPSBcIlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29tcGFyZUxlbmd0aCA9IE1hdGgubWluKGN1cnJlbnRJbmRlbnQubGVuZ3RoLCBpbmRlbnQubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgaW5kZW50U2xpY2UgPSBpbmRlbnQuc2xpY2UoMCwgY29tcGFyZUxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRlbnRTbGljZSA9IGN1cnJlbnRJbmRlbnQuc2xpY2UoMCwgY29tcGFyZUxlbmd0aCk7XG5cbiAgICAgICAgaWYgKGluZGVudFNsaWNlICE9PSBjdXJyZW50SW5kZW50U2xpY2UpIHtcbiAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IGN1cnJlbnRJbmRlbnRTbGljZVxuICAgICAgICAgICAgLnJlcGxhY2UoLyAvZywgXCJTXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csIFwiVFwiKTtcbiAgICAgICAgICBjb25zdCBnb3QgPSBpbmRlbnRTbGljZS5yZXBsYWNlKC8gL2csIFwiU1wiKS5yZXBsYWNlKC9cXHQvZywgXCJUXCIpO1xuXG4gICAgICAgICAgcmV0dXJuIGVycm9yKFxuICAgICAgICAgICAgYFVuYWJsZSB0byBwYXJzZSBsaXN0OiBleHBlY3RlZCBpbmRlbnQgXCIke2V4cGVjdGVkfVwiLCBnb3QgXCIke2dvdH1cImAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpbmRlbnQubGVuZ3RoID4gY3VycmVudEluZGVudC5sZW5ndGgpIHtcbiAgICAgICAgICBjdXJyZW50UGFyZW50ID0gY3VycmVudExpc3Q7XG4gICAgICAgICAgY3VycmVudEluZGVudCA9IGluZGVudDtcbiAgICAgICAgfSBlbHNlIGlmIChpbmRlbnQubGVuZ3RoIDwgY3VycmVudEluZGVudC5sZW5ndGgpIHtcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBjdXJyZW50UGFyZW50LmdldEZpcnN0TGluZUluZGVudCgpLmxlbmd0aCA+PSBpbmRlbnQubGVuZ3RoICYmXG4gICAgICAgICAgICBjdXJyZW50UGFyZW50LmdldFBhcmVudCgpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjdXJyZW50UGFyZW50ID0gY3VycmVudFBhcmVudC5nZXRQYXJlbnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3VycmVudEluZGVudCA9IGluZGVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZvbGRSb290ID0gZm9sZGVkTGluZXMuaW5jbHVkZXMobCk7XG5cbiAgICAgICAgY3VycmVudExpc3QgPSBuZXcgTGlzdChcbiAgICAgICAgICByb290LFxuICAgICAgICAgIGluZGVudCxcbiAgICAgICAgICBidWxsZXQsXG4gICAgICAgICAgb3B0aW9uYWxDaGVja2JveCxcbiAgICAgICAgICBzcGFjZUFmdGVyQnVsbGV0LFxuICAgICAgICAgIGNvbnRlbnQsXG4gICAgICAgICAgZm9sZFJvb3QsXG4gICAgICAgICk7XG4gICAgICAgIGN1cnJlbnRQYXJlbnQuYWRkQWZ0ZXJBbGwoY3VycmVudExpc3QpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTGluZVdpdGhJbmRlbnQobGluZSkpIHtcbiAgICAgICAgaWYgKCFjdXJyZW50TGlzdCkge1xuICAgICAgICAgIHJldHVybiBlcnJvcihcbiAgICAgICAgICAgIGBVbmFibGUgdG8gcGFyc2UgbGlzdDogZXhwZWN0ZWQgbGlzdCBpdGVtLCBnb3QgZW1wdHkgbGluZWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGluZGVudFRvQ2hlY2sgPSBjdXJyZW50TGlzdC5nZXROb3Rlc0luZGVudCgpIHx8IGN1cnJlbnRJbmRlbnQ7XG5cbiAgICAgICAgaWYgKGxpbmUuaW5kZXhPZihpbmRlbnRUb0NoZWNrKSAhPT0gMCkge1xuICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gaW5kZW50VG9DaGVjay5yZXBsYWNlKC8gL2csIFwiU1wiKS5yZXBsYWNlKC9cXHQvZywgXCJUXCIpO1xuICAgICAgICAgIGNvbnN0IGdvdCA9IGxpbmVcbiAgICAgICAgICAgIC5tYXRjaCgvXlsgXFx0XSovKVswXVxuICAgICAgICAgICAgLnJlcGxhY2UoLyAvZywgXCJTXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csIFwiVFwiKTtcblxuICAgICAgICAgIHJldHVybiBlcnJvcihcbiAgICAgICAgICAgIGBVbmFibGUgdG8gcGFyc2UgbGlzdDogZXhwZWN0ZWQgaW5kZW50IFwiJHtleHBlY3RlZH1cIiwgZ290IFwiJHtnb3R9XCJgLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWN1cnJlbnRMaXN0LmdldE5vdGVzSW5kZW50KCkpIHtcbiAgICAgICAgICBjb25zdCBtYXRjaGVzID0gbGluZS5tYXRjaCgvXlsgXFx0XSsvKTtcblxuICAgICAgICAgIGlmICghbWF0Y2hlcyB8fCBtYXRjaGVzWzBdLmxlbmd0aCA8PSBjdXJyZW50SW5kZW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKC9eXFxzKyQvLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBlcnJvcihcbiAgICAgICAgICAgICAgYFVuYWJsZSB0byBwYXJzZSBsaXN0OiBleHBlY3RlZCBzb21lIGluZGVudCwgZ290IG5vIGluZGVudGAsXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGN1cnJlbnRMaXN0LnNldE5vdGVzSW5kZW50KG1hdGNoZXNbMF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY3VycmVudExpc3QuYWRkTGluZShsaW5lLnNsaWNlKGN1cnJlbnRMaXN0LmdldE5vdGVzSW5kZW50KCkubGVuZ3RoKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZXJyb3IoXG4gICAgICAgICAgYFVuYWJsZSB0byBwYXJzZSBsaXN0OiBleHBlY3RlZCBsaXN0IGl0ZW0gb3Igbm90ZSwgZ290IFwiJHtsaW5lfVwiYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuXG4gIHByaXZhdGUgaXNFbXB0eUxpbmUobGluZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGxpbmUubGVuZ3RoID09PSAwO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0xpbmVXaXRoSW5kZW50KGxpbmU6IHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmdXaXRoU3BhY2VzUmUudGVzdChsaW5lKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNMaXN0SXRlbShsaW5lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbGlzdEl0ZW1SZS50ZXN0KGxpbmUpO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0xpc3RJdGVtV2l0aG91dFNwYWNlcyhsaW5lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbGlzdEl0ZW1XaXRob3V0U3BhY2VzUmUudGVzdChsaW5lKTtcbiAgfVxufVxuIiwiZXhwb3J0IHR5cGUgVmVydGljYWxMaW5lc0FjdGlvbiA9IFwibm9uZVwiIHwgXCJ6b29tLWluXCIgfCBcInRvZ2dsZS1mb2xkaW5nXCI7XG5leHBvcnQgdHlwZSBLZWVwQ3Vyc29yV2l0aGluQ29udGVudCA9XG4gIHwgXCJuZXZlclwiXG4gIHwgXCJidWxsZXQtb25seVwiXG4gIHwgXCJidWxsZXQtYW5kLWNoZWNrYm94XCI7XG5cbmludGVyZmFjZSBTZXR0aW5nc09iamVjdCB7XG4gIHN0eWxlTGlzdHM6IGJvb2xlYW47XG4gIGRlYnVnOiBib29sZWFuO1xuICBzdGlja0N1cnNvcjogS2VlcEN1cnNvcldpdGhpbkNvbnRlbnQgfCBib29sZWFuO1xuICBiZXR0ZXJFbnRlcjogYm9vbGVhbjtcbiAgYmV0dGVyVGFiOiBib29sZWFuO1xuICBzZWxlY3RBbGw6IGJvb2xlYW47XG4gIGxpc3RMaW5lczogYm9vbGVhbjtcbiAgbGlzdExpbmVBY3Rpb246IFZlcnRpY2FsTGluZXNBY3Rpb247XG4gIGRuZDogYm9vbGVhbjtcbiAgcHJldmlvdXNSZWxlYXNlOiBzdHJpbmcgfCBudWxsO1xufVxuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBTZXR0aW5nc09iamVjdCA9IHtcbiAgc3R5bGVMaXN0czogdHJ1ZSxcbiAgZGVidWc6IGZhbHNlLFxuICBzdGlja0N1cnNvcjogXCJidWxsZXQtYW5kLWNoZWNrYm94XCIsXG4gIGJldHRlckVudGVyOiB0cnVlLFxuICBiZXR0ZXJUYWI6IHRydWUsXG4gIHNlbGVjdEFsbDogdHJ1ZSxcbiAgbGlzdExpbmVzOiBmYWxzZSxcbiAgbGlzdExpbmVBY3Rpb246IFwidG9nZ2xlLWZvbGRpbmdcIixcbiAgZG5kOiB0cnVlLFxuICBwcmV2aW91c1JlbGVhc2U6IG51bGwsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3JhZ2Uge1xuICBsb2FkRGF0YSgpOiBQcm9taXNlPFNldHRpbmdzT2JqZWN0PjtcbiAgc2F2ZURhdGEoc2V0dGluZ3M6IFNldHRpbmdzT2JqZWN0KTogUHJvbWlzZTx2b2lkPjtcbn1cblxudHlwZSBDYWxsYmFjayA9ICgpID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5ncyB7XG4gIHByaXZhdGUgc3RvcmFnZTogU3RvcmFnZTtcbiAgcHJpdmF0ZSB2YWx1ZXM6IFNldHRpbmdzT2JqZWN0O1xuICBwcml2YXRlIGNhbGxiYWNrczogU2V0PENhbGxiYWNrPjtcblxuICBjb25zdHJ1Y3RvcihzdG9yYWdlOiBTdG9yYWdlKSB7XG4gICAgdGhpcy5zdG9yYWdlID0gc3RvcmFnZTtcbiAgICB0aGlzLmNhbGxiYWNrcyA9IG5ldyBTZXQoKTtcbiAgfVxuXG4gIGdldCBrZWVwQ3Vyc29yV2l0aGluQ29udGVudCgpIHtcbiAgICAvLyBBZGFwdG9yIGZvciB1c2VycyBtaWdyYXRpbmcgZnJvbSBvbGRlciB2ZXJzaW9uIG9mIHRoZSBwbHVnaW4uXG4gICAgaWYgKHRoaXMudmFsdWVzLnN0aWNrQ3Vyc29yID09PSB0cnVlKSB7XG4gICAgICByZXR1cm4gXCJidWxsZXQtYW5kLWNoZWNrYm94XCI7XG4gICAgfSBlbHNlIGlmICh0aGlzLnZhbHVlcy5zdGlja0N1cnNvciA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybiBcIm5ldmVyXCI7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLnN0aWNrQ3Vyc29yO1xuICB9XG5cbiAgc2V0IGtlZXBDdXJzb3JXaXRoaW5Db250ZW50KHZhbHVlOiBLZWVwQ3Vyc29yV2l0aGluQ29udGVudCkge1xuICAgIHRoaXMuc2V0KFwic3RpY2tDdXJzb3JcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IG92ZXJyaWRlVGFiQmVoYXZpb3VyKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcy5iZXR0ZXJUYWI7XG4gIH1cblxuICBzZXQgb3ZlcnJpZGVUYWJCZWhhdmlvdXIodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcImJldHRlclRhYlwiLCB2YWx1ZSk7XG4gIH1cblxuICBnZXQgb3ZlcnJpZGVFbnRlckJlaGF2aW91cigpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMuYmV0dGVyRW50ZXI7XG4gIH1cblxuICBzZXQgb3ZlcnJpZGVFbnRlckJlaGF2aW91cih2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwiYmV0dGVyRW50ZXJcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IG92ZXJyaWRlU2VsZWN0QWxsQmVoYXZpb3VyKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcy5zZWxlY3RBbGw7XG4gIH1cblxuICBzZXQgb3ZlcnJpZGVTZWxlY3RBbGxCZWhhdmlvdXIodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcInNlbGVjdEFsbFwiLCB2YWx1ZSk7XG4gIH1cblxuICBnZXQgYmV0dGVyTGlzdHNTdHlsZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLnN0eWxlTGlzdHM7XG4gIH1cblxuICBzZXQgYmV0dGVyTGlzdHNTdHlsZXModmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcInN0eWxlTGlzdHNcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IHZlcnRpY2FsTGluZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLmxpc3RMaW5lcztcbiAgfVxuXG4gIHNldCB2ZXJ0aWNhbExpbmVzKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5zZXQoXCJsaXN0TGluZXNcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IHZlcnRpY2FsTGluZXNBY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLmxpc3RMaW5lQWN0aW9uO1xuICB9XG5cbiAgc2V0IHZlcnRpY2FsTGluZXNBY3Rpb24odmFsdWU6IFZlcnRpY2FsTGluZXNBY3Rpb24pIHtcbiAgICB0aGlzLnNldChcImxpc3RMaW5lQWN0aW9uXCIsIHZhbHVlKTtcbiAgfVxuXG4gIGdldCBkcmFnQW5kRHJvcCgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMuZG5kO1xuICB9XG5cbiAgc2V0IGRyYWdBbmREcm9wKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5zZXQoXCJkbmRcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IGRlYnVnKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcy5kZWJ1ZztcbiAgfVxuXG4gIHNldCBkZWJ1Zyh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwiZGVidWdcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IHByZXZpb3VzUmVsZWFzZSgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMucHJldmlvdXNSZWxlYXNlO1xuICB9XG5cbiAgc2V0IHByZXZpb3VzUmVsZWFzZSh2YWx1ZTogc3RyaW5nIHwgbnVsbCkge1xuICAgIHRoaXMuc2V0KFwicHJldmlvdXNSZWxlYXNlXCIsIHZhbHVlKTtcbiAgfVxuXG4gIG9uQ2hhbmdlKGNiOiBDYWxsYmFjaykge1xuICAgIHRoaXMuY2FsbGJhY2tzLmFkZChjYik7XG4gIH1cblxuICByZW1vdmVDYWxsYmFjayhjYjogQ2FsbGJhY2spOiB2b2lkIHtcbiAgICB0aGlzLmNhbGxiYWNrcy5kZWxldGUoY2IpO1xuICB9XG5cbiAgcmVzZXQoKSB7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoREVGQVVMVF9TRVRUSU5HUykpIHtcbiAgICAgIHRoaXMuc2V0KGsgYXMga2V5b2YgU2V0dGluZ3NPYmplY3QsIHYpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy52YWx1ZXMgPSBPYmplY3QuYXNzaWduKFxuICAgICAge30sXG4gICAgICBERUZBVUxUX1NFVFRJTkdTLFxuICAgICAgYXdhaXQgdGhpcy5zdG9yYWdlLmxvYWREYXRhKCksXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmUoKSB7XG4gICAgYXdhaXQgdGhpcy5zdG9yYWdlLnNhdmVEYXRhKHRoaXMudmFsdWVzKTtcbiAgfVxuXG4gIGdldFZhbHVlcygpOiBTZXR0aW5nc09iamVjdCB7XG4gICAgcmV0dXJuIHsgLi4udGhpcy52YWx1ZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0PFQgZXh0ZW5kcyBrZXlvZiBTZXR0aW5nc09iamVjdD4oXG4gICAga2V5OiBULFxuICAgIHZhbHVlOiBTZXR0aW5nc09iamVjdFtUXSxcbiAgKTogdm9pZCB7XG4gICAgdGhpcy52YWx1ZXNba2V5XSA9IHZhbHVlO1xuXG4gICAgZm9yIChjb25zdCBjYiBvZiB0aGlzLmNhbGxiYWNrcykge1xuICAgICAgY2IoKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBBcnJvd0xlZnRBbmRDdHJsQXJyb3dMZWZ0QmVoYXZpb3VyT3ZlcnJpZGUgfSBmcm9tIFwiLi9mZWF0dXJlcy9BcnJvd0xlZnRBbmRDdHJsQXJyb3dMZWZ0QmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IEJhY2tzcGFjZUJlaGF2aW91ck92ZXJyaWRlIH0gZnJvbSBcIi4vZmVhdHVyZXMvQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IEJldHRlckxpc3RzU3R5bGVzIH0gZnJvbSBcIi4vZmVhdHVyZXMvQmV0dGVyTGlzdHNTdHlsZXNcIjtcbmltcG9ydCB7IEN0cmxBQW5kQ21kQUJlaGF2aW91ck92ZXJyaWRlIH0gZnJvbSBcIi4vZmVhdHVyZXMvQ3RybEFBbmRDbWRBQmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IERlbGV0ZUJlaGF2aW91ck92ZXJyaWRlIH0gZnJvbSBcIi4vZmVhdHVyZXMvRGVsZXRlQmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IERyYWdBbmREcm9wIH0gZnJvbSBcIi4vZmVhdHVyZXMvRHJhZ0FuZERyb3BcIjtcbmltcG9ydCB7IEVkaXRvclNlbGVjdGlvbnNCZWhhdmlvdXJPdmVycmlkZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0VkaXRvclNlbGVjdGlvbnNCZWhhdmlvdXJPdmVycmlkZVwiO1xuaW1wb3J0IHsgRW50ZXJCZWhhdmlvdXJPdmVycmlkZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0VudGVyQmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9GZWF0dXJlXCI7XG5pbXBvcnQgeyBMaXN0c0ZvbGRpbmdDb21tYW5kcyB9IGZyb20gXCIuL2ZlYXR1cmVzL0xpc3RzRm9sZGluZ0NvbW1hbmRzXCI7XG5pbXBvcnQgeyBMaXN0c01vdmVtZW50Q29tbWFuZHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9MaXN0c01vdmVtZW50Q29tbWFuZHNcIjtcbmltcG9ydCB7IE1ldGFCYWNrc3BhY2VCZWhhdmlvdXJPdmVycmlkZSB9IGZyb20gXCIuL2ZlYXR1cmVzL01ldGFCYWNrc3BhY2VCZWhhdmlvdXJPdmVycmlkZVwiO1xuLy8gaW1wb3J0IHsgUmVsZWFzZU5vdGVzQW5ub3VuY2VtZW50IH0gZnJvbSBcIi4vZmVhdHVyZXMvUmVsZWFzZU5vdGVzQW5ub3VuY2VtZW50XCI7XG5pbXBvcnQgeyBTZXR0aW5nc1RhYiB9IGZyb20gXCIuL2ZlYXR1cmVzL1NldHRpbmdzVGFiXCI7XG5pbXBvcnQgeyBTaGlmdFRhYkJlaGF2aW91ck92ZXJyaWRlIH0gZnJvbSBcIi4vZmVhdHVyZXMvU2hpZnRUYWJCZWhhdmlvdXJPdmVycmlkZVwiO1xuaW1wb3J0IHsgU3lzdGVtSW5mbyB9IGZyb20gXCIuL2ZlYXR1cmVzL1N5c3RlbUluZm9cIjtcbmltcG9ydCB7IFRhYkJlaGF2aW91ck92ZXJyaWRlIH0gZnJvbSBcIi4vZmVhdHVyZXMvVGFiQmVoYXZpb3VyT3ZlcnJpZGVcIjtcbmltcG9ydCB7IFZlcnRpY2FsTGluZXMgfSBmcm9tIFwiLi9mZWF0dXJlcy9WZXJ0aWNhbExpbmVzXCI7XG5pbXBvcnQgeyBDaGFuZ2VzQXBwbGljYXRvciB9IGZyb20gXCIuL3NlcnZpY2VzL0NoYW5nZXNBcHBsaWNhdG9yXCI7XG5pbXBvcnQgeyBJTUVEZXRlY3RvciB9IGZyb20gXCIuL3NlcnZpY2VzL0lNRURldGVjdG9yXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9zZXJ2aWNlcy9Mb2dnZXJcIjtcbmltcG9ydCB7IE9ic2lkaWFuU2V0dGluZ3MgfSBmcm9tIFwiLi9zZXJ2aWNlcy9PYnNpZGlhblNldHRpbmdzXCI7XG5pbXBvcnQgeyBPcGVyYXRpb25QZXJmb3JtZXIgfSBmcm9tIFwiLi9zZXJ2aWNlcy9PcGVyYXRpb25QZXJmb3JtZXJcIjtcbmltcG9ydCB7IFBhcnNlciB9IGZyb20gXCIuL3NlcnZpY2VzL1BhcnNlclwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi9zZXJ2aWNlcy9TZXR0aW5nc1wiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGNvbnN0IFBMVUdJTl9WRVJTSU9OOiBzdHJpbmc7XG4gIGNvbnN0IENIQU5HRUxPR19NRDogc3RyaW5nO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBPYnNpZGlhbk91dGxpbmVyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcHJpdmF0ZSBmZWF0dXJlczogRmVhdHVyZVtdO1xuICBwcm90ZWN0ZWQgc2V0dGluZ3M6IFNldHRpbmdzO1xuICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyO1xuICBwcml2YXRlIG9ic2lkaWFuU2V0dGluZ3M6IE9ic2lkaWFuU2V0dGluZ3M7XG4gIHByaXZhdGUgcGFyc2VyOiBQYXJzZXI7XG4gIHByaXZhdGUgY2hhbmdlc0FwcGxpY2F0b3I6IENoYW5nZXNBcHBsaWNhdG9yO1xuICBwcml2YXRlIG9wZXJhdGlvblBlcmZvcm1lcjogT3BlcmF0aW9uUGVyZm9ybWVyO1xuICBwcml2YXRlIGltZURldGVjdG9yOiBJTUVEZXRlY3RvcjtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coYExvYWRpbmcgb2JzaWRpYW4tb3V0bGluZXJgKTtcblxuICAgIGF3YWl0IHRoaXMucHJlcGFyZVNldHRpbmdzKCk7XG5cbiAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MgPSBuZXcgT2JzaWRpYW5TZXR0aW5ncyh0aGlzLmFwcCk7XG4gICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHRoaXMuc2V0dGluZ3MpO1xuICAgIHRoaXMucGFyc2VyID0gbmV3IFBhcnNlcih0aGlzLmxvZ2dlciwgdGhpcy5zZXR0aW5ncyk7XG4gICAgdGhpcy5jaGFuZ2VzQXBwbGljYXRvciA9IG5ldyBDaGFuZ2VzQXBwbGljYXRvcigpO1xuICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyID0gbmV3IE9wZXJhdGlvblBlcmZvcm1lcihcbiAgICAgIHRoaXMucGFyc2VyLFxuICAgICAgdGhpcy5jaGFuZ2VzQXBwbGljYXRvcixcbiAgICApO1xuXG4gICAgdGhpcy5pbWVEZXRlY3RvciA9IG5ldyBJTUVEZXRlY3RvcigpO1xuICAgIGF3YWl0IHRoaXMuaW1lRGV0ZWN0b3IubG9hZCgpO1xuXG4gICAgdGhpcy5mZWF0dXJlcyA9IFtcbiAgICAgIC8vIHNlcnZpY2UgZmVhdHVyZXNcbiAgICAgIC8vIG5ldyBSZWxlYXNlTm90ZXNBbm5vdW5jZW1lbnQodGhpcywgdGhpcy5zZXR0aW5ncyksXG4gICAgICBuZXcgU2V0dGluZ3NUYWIodGhpcywgdGhpcy5zZXR0aW5ncyksXG4gICAgICBuZXcgU3lzdGVtSW5mbyh0aGlzLCB0aGlzLnNldHRpbmdzKSxcblxuICAgICAgLy8gZ2VuZXJhbCBmZWF0dXJlc1xuICAgICAgbmV3IExpc3RzTW92ZW1lbnRDb21tYW5kcyhcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5vYnNpZGlhblNldHRpbmdzLFxuICAgICAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lcixcbiAgICAgICksXG4gICAgICBuZXcgTGlzdHNGb2xkaW5nQ29tbWFuZHModGhpcywgdGhpcy5vYnNpZGlhblNldHRpbmdzKSxcblxuICAgICAgLy8gZmVhdHVyZXMgYmFzZWQgb24gc2V0dGluZ3Mua2VlcEN1cnNvcldpdGhpbkNvbnRlbnRcbiAgICAgIG5ldyBFZGl0b3JTZWxlY3Rpb25zQmVoYXZpb3VyT3ZlcnJpZGUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMucGFyc2VyLFxuICAgICAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lcixcbiAgICAgICksXG4gICAgICBuZXcgQXJyb3dMZWZ0QW5kQ3RybEFycm93TGVmdEJlaGF2aW91ck92ZXJyaWRlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZURldGVjdG9yLFxuICAgICAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lcixcbiAgICAgICksXG4gICAgICBuZXcgQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMuaW1lRGV0ZWN0b3IsXG4gICAgICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLFxuICAgICAgKSxcbiAgICAgIG5ldyBNZXRhQmFja3NwYWNlQmVoYXZpb3VyT3ZlcnJpZGUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMuaW1lRGV0ZWN0b3IsXG4gICAgICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLFxuICAgICAgKSxcbiAgICAgIG5ldyBEZWxldGVCZWhhdmlvdXJPdmVycmlkZShcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5zZXR0aW5ncyxcbiAgICAgICAgdGhpcy5pbWVEZXRlY3RvcixcbiAgICAgICAgdGhpcy5vcGVyYXRpb25QZXJmb3JtZXIsXG4gICAgICApLFxuXG4gICAgICAvLyBmZWF0dXJlcyBiYXNlZCBvbiBzZXR0aW5ncy5vdmVycmlkZVRhYkJlaGF2aW91clxuICAgICAgbmV3IFRhYkJlaGF2aW91ck92ZXJyaWRlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLmltZURldGVjdG9yLFxuICAgICAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLFxuICAgICAgKSxcbiAgICAgIG5ldyBTaGlmdFRhYkJlaGF2aW91ck92ZXJyaWRlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLmltZURldGVjdG9yLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lcixcbiAgICAgICksXG5cbiAgICAgIC8vIGZlYXR1cmVzIGJhc2VkIG9uIHNldHRpbmdzLm92ZXJyaWRlRW50ZXJCZWhhdmlvdXJcbiAgICAgIG5ldyBFbnRlckJlaGF2aW91ck92ZXJyaWRlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZURldGVjdG9yLFxuICAgICAgICB0aGlzLm9ic2lkaWFuU2V0dGluZ3MsXG4gICAgICAgIHRoaXMucGFyc2VyLFxuICAgICAgICB0aGlzLm9wZXJhdGlvblBlcmZvcm1lcixcbiAgICAgICksXG5cbiAgICAgIC8vIGZlYXR1cmVzIGJhc2VkIG9uIHNldHRpbmdzLm92ZXJyaWRlU2VsZWN0QWxsQmVoYXZpb3VyXG4gICAgICBuZXcgQ3RybEFBbmRDbWRBQmVoYXZpb3VyT3ZlcnJpZGUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMuaW1lRGV0ZWN0b3IsXG4gICAgICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLFxuICAgICAgKSxcblxuICAgICAgLy8gZmVhdHVyZXMgYmFzZWQgb24gc2V0dGluZ3MuYmV0dGVyTGlzdHNTdHlsZXNcbiAgICAgIG5ldyBCZXR0ZXJMaXN0c1N0eWxlcyh0aGlzLnNldHRpbmdzLCB0aGlzLm9ic2lkaWFuU2V0dGluZ3MpLFxuXG4gICAgICAvLyBmZWF0dXJlcyBiYXNlZCBvbiBzZXR0aW5ncy52ZXJ0aWNhbExpbmVzXG4gICAgICBuZXcgVmVydGljYWxMaW5lcyhcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5zZXR0aW5ncyxcbiAgICAgICAgdGhpcy5vYnNpZGlhblNldHRpbmdzLFxuICAgICAgICB0aGlzLnBhcnNlcixcbiAgICAgICksXG5cbiAgICAgIC8vIGZlYXR1cmVzIGJhc2VkIG9uIHNldHRpbmdzLmRyYWdBbmREcm9wXG4gICAgICBuZXcgRHJhZ0FuZERyb3AoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMub2JzaWRpYW5TZXR0aW5ncyxcbiAgICAgICAgdGhpcy5wYXJzZXIsXG4gICAgICAgIHRoaXMub3BlcmF0aW9uUGVyZm9ybWVyLFxuICAgICAgKSxcbiAgICBdO1xuXG4gICAgZm9yIChjb25zdCBmZWF0dXJlIG9mIHRoaXMuZmVhdHVyZXMpIHtcbiAgICAgIGF3YWl0IGZlYXR1cmUubG9hZCgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG9udW5sb2FkKCkge1xuICAgIGNvbnNvbGUubG9nKGBVbmxvYWRpbmcgb2JzaWRpYW4tb3V0bGluZXJgKTtcblxuICAgIGF3YWl0IHRoaXMuaW1lRGV0ZWN0b3IudW5sb2FkKCk7XG5cbiAgICBmb3IgKGNvbnN0IGZlYXR1cmUgb2YgdGhpcy5mZWF0dXJlcykge1xuICAgICAgYXdhaXQgZmVhdHVyZS51bmxvYWQoKTtcbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgYXN5bmMgcHJlcGFyZVNldHRpbmdzKCkge1xuICAgIHRoaXMuc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3ModGhpcyk7XG4gICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5sb2FkKCk7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJlZGl0b3JJbmZvRmllbGQiLCJmb2xkZWRSYW5nZXMiLCJmb2xkYWJsZSIsImZvbGRFZmZlY3QiLCJ1bmZvbGRFZmZlY3QiLCJydW5TY29wZUhhbmRsZXJzIiwia2V5bWFwIiwiTm90aWNlIiwiaW5kZW50U3RyaW5nIiwiZ2V0SW5kZW50VW5pdCIsIlN0YXRlRWZmZWN0IiwiRGVjb3JhdGlvbiIsIlN0YXRlRmllbGQiLCJFZGl0b3JWaWV3IiwiUGxhdGZvcm0iLCJFZGl0b3JTdGF0ZSIsIlByZWMiLCJQbHVnaW5TZXR0aW5nVGFiIiwiU2V0dGluZyIsIk1vZGFsIiwiVmlld1BsdWdpbiIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBa0dBO0FBQ08sU0FBUyxTQUFTLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFO0FBQzdELElBQUksU0FBUyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxLQUFLLFlBQVksQ0FBQyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxVQUFVLE9BQU8sRUFBRSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFO0FBQ2hILElBQUksT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsVUFBVSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQy9ELFFBQVEsU0FBUyxTQUFTLENBQUMsS0FBSyxFQUFF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
