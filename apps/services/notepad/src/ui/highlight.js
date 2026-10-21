// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Find's matches marked in the text (a
 * mirror layer). A textarea cannot paint parts of its own text, and the
 * CSS Custom Highlight API does not reach inside it; moving the caret is
 * not enough either (the selection of an unfocused textarea is faint or
 * invisible). So the matches are measured on a hidden mirror of the
 * textarea (`reveal.js` `measureRanges`) and drawn as translucent boxes in
 * a layer laid over the textarea, which ignores the pointer: the text
 * stays a native textarea (input methods, spelling, selection,
 * accessibility). The current match is drawn stronger.
 *
 * Scrolling only moves the layer; boxes are created for the visible part
 * only. Measuring lays the text out once more, so it is bounded: up to
 * `MIRROR_MAX` characters every match is marked (at most `MAX_MARKS`
 * around the current one); above, the current match alone.
 *
 * @module notepad/ui/highlight
 */
import { measureRanges } from './reveal.js';

/** Up to this many characters, every match is marked. */
export const MIRROR_MAX = 1_000_000;
/** At most this many matches are marked, around the current one. */
export const MAX_MARKS = 2000;

/**
 * @param {{text: HTMLTextAreaElement, host: HTMLElement}} opts `host`: the
 *   positioned element holding the textarea (the layer goes inside it).
 */
export function createHighlighter({ text, host }) {
    const doc = text.ownerDocument;
    const layer = doc.createElement('div');
    layer.className = 'awn-marks';
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    const plane = doc.createElement('div');
    plane.className = 'awn-marks-plane';
    layer.append(plane);
    host.append(layer);

    /** @type {{top: number, bottom: number, left: number, right: number, current: boolean}[]} */
    let boxes = [];
    /** @type {{start: number, end: number}[]} */
    let shown = [];
    let currentIndex = -1;

    /** Lay the layer over the textarea's visible text area. */
    function place() {
        layer.style.left = `${text.offsetLeft}px`;
        layer.style.top = `${text.offsetTop}px`;
        layer.style.width = `${text.clientWidth}px`;
        layer.style.height = `${text.clientHeight}px`;
    }

    /** Draw the boxes that intersect the view (plus one screen around). */
    function paint() {
        if (layer.hidden) return;
        const top = text.scrollTop, height = text.clientHeight;
        plane.style.transform = `translate(${-text.scrollLeft}px, ${-top}px)`;
        const nodes = [];
        for (const b of boxes) {
            if (b.bottom < top - height || b.top > top + 2 * height) continue;
            const mark = doc.createElement('div');
            mark.className = b.current ? 'awn-mark awn-mark--current' : 'awn-mark';
            mark.style.top = `${b.top}px`;
            mark.style.left = `${b.left}px`;
            mark.style.width = `${Math.max(2, b.right - b.left)}px`;
            mark.style.height = `${b.bottom - b.top}px`;
            nodes.push(mark);
        }
        plane.replaceChildren(...nodes);
    }

    /** Measure the shown matches again (the text, its width or its font changed). */
    function measure() {
        if (!shown.length) { boxes = []; return; }
        const big = text.value.length > MIRROR_MAX;
        let from = 0, to = shown.length;
        if (big) {
            from = Math.max(0, currentIndex);
            to = currentIndex < 0 ? 0 : from + 1;
        } else if (shown.length > MAX_MARKS) {
            from = Math.max(0, Math.min(shown.length - MAX_MARKS, (currentIndex < 0 ? 0 : currentIndex) - MAX_MARKS / 2));
            to = from + MAX_MARKS;
        }
        const ranges = shown.slice(from, to);
        const measured = measureRanges(text, ranges);
        boxes = measured.flatMap((list, k) => list.map((b) => ({ ...b, current: from + k === currentIndex })));
    }

    const onScroll = () => paint();
    text.addEventListener('scroll', onScroll);
    const resize = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => { if (!layer.hidden) { place(); measure(); paint(); } })
        : null;
    resize?.observe(text);

    return {
        /**
         * Mark these matches, `current` drawn stronger (-1: none).
         * @param {{start: number, end: number}[]} matches In order.
         * @param {number} current
         */
        show(matches, current) {
            shown = matches;
            currentIndex = current;
            layer.hidden = !matches.length;
            if (layer.hidden) { boxes = []; plane.replaceChildren(); return; }
            place();
            measure();
            paint();
        },
        /** Re-measure after the text, wrapping or text size changed. */
        refresh() {
            if (layer.hidden) return;
            place();
            measure();
            paint();
        },
        clear() {
            shown = [];
            boxes = [];
            currentIndex = -1;
            layer.hidden = true;
            plane.replaceChildren();
        },
        /** How many boxes are drawn now (tests). */
        get drawn() { return plane.childElementCount; },
        destroy() {
            text.removeEventListener('scroll', onScroll);
            resize?.disconnect();
            layer.remove();
        }
    };
}
