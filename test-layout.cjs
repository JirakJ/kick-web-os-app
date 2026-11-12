// Run in the installed app's webOS Web Inspector: checkLayout().
// Reports painted overflow and overlapping controls; intentional ellipses are allowed.
// checkLayout({ report: true }) also returns notes for scroll extent without painted overflow.
// The function must stay self-contained: browser harnesses serialize it into the page.
function checkLayout(options) {
    const errors = [], notes = [];
    const label = el => el.id || (typeof el.className === 'string' && el.className) || el.tagName;
    const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    // Painted extent of the content inside an element: descendant border boxes and text runs.
    // Old engines (Chromium 68 on webOS 5) add a collapsed trailing child margin to scrollHeight
    // although nothing paints there, so scroll extent alone cannot prove clipped content.
    function paintedExtent(el) {
        const extent = { right: -Infinity, bottom: -Infinity };
        function add(rect) {
            if (!rect || !rect.width && !rect.height) return;
            if (rect.right > extent.right) extent.right = rect.right;
            if (rect.bottom > extent.bottom) extent.bottom = rect.bottom;
        }
        (function walk(parent) {
            for (let node = parent.firstChild; node; node = node.nextSibling) {
                if (node.nodeType === 3) {
                    if (!node.nodeValue.trim()) continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    add(range.getBoundingClientRect());
                    if (range.detach) range.detach();
                } else if (node.nodeType === 1 && visible(node)) {
                    const style = getComputedStyle(node);
                    add(node.getBoundingClientRect());
                    // A clipping descendant contains its own content; its box is already measured.
                    if (style.overflowX === 'visible' && style.overflowY === 'visible') walk(node);
                }
            }
        }(el));
        return extent;
    }
    function contentOverflow(el, style, rect) {
        const horizontal = style.overflowX === 'visible' && el.clientWidth && el.scrollWidth > el.clientWidth + 1;
        const vertical = style.overflowY === 'visible' && el.clientHeight && el.scrollHeight > el.clientHeight + 1;
        if (!horizontal && !vertical) return;
        const painted = paintedExtent(el);
        // Compare against the padding box, where in-flow content is allowed to paint.
        const right = rect.left + el.clientLeft + el.clientWidth, bottom = rect.top + el.clientTop + el.clientHeight;
        [[horizontal, 'horizontal', painted.right - right, el.scrollWidth - el.clientWidth],
         [vertical, 'vertical', painted.bottom - bottom, el.scrollHeight - el.clientHeight]].forEach(entry => {
            if (!entry[0]) return;
            if (entry[2] > 1) errors.push(label(el) + ': ' + entry[1] + ' content overflow');
            else notes.push(label(el) + ': ' + entry[1] + ' scroll extent +' + Math.round(entry[3]) + 'px without painted overflow (collapsed margin)');
        });
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('Page has horizontal overflow');
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      // Inline text can extend into an intentional ellipsis/line clamp ancestor.
      if (style.display === 'inline' || el.matches('input, source, progress')) continue;
      if (rect.left < -1 || rect.right > innerWidth + 1) errors.push(label(el) + ': box outside viewport');
      contentOverflow(el, style, rect);
    }
    function disjoint(a, b) {
      a = document.querySelector(a); b = document.querySelector(b);
      if (!visible(a) || !visible(b)) return;
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
          Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1)
        errors.push(label(a) + ' overlaps ' + label(b));
    }
    disjoint('.catalog-description', '.catalog-actions');
    disjoint('#play', '#recordings');
    disjoint('#playback-status', '#playback-controls');
    disjoint('#back', '#playback-status');
    disjoint('#back', '#playback-controls');
    disjoint('#elapsed', '.seek-track');
    disjoint('#duration', '.seek-track');
    for (const card of document.querySelectorAll('#videos button')) {
      const a = card.querySelector('.last-watched'), b = card.querySelector('.watched-badge');
      if (visible(a) && visible(b) && a.getBoundingClientRect().bottom > b.getBoundingClientRect().top + 1)
        errors.push('Replay badges overlap');
    }
    return options && options.report ? { errors, notes } : errors;
}
if (typeof module !== "undefined") module.exports = checkLayout;
