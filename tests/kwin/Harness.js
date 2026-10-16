// Tiny TAP test harness for KWin declarative scripts.
//
// QML's JS engine has no async/await, so tests are generator functions that
// yield what they are waiting for:
//   yield 200;                                   // sleep 200ms
//   yield t.until(() => cond, "what", 2000);     // poll until cond is truthy
// The runner (main.qml) drives the generators with Timers.

let results = [];
let current = null;

function log(line) {
    console.warn("TAP " + line);
}

function request(verb, arg) {
    // Serviced by tests/session.sh (spawning windows, screenshots).
    console.warn("REQUEST " + verb + " " + arg);
}

function fmt(v) {
    if (v === undefined) return "undefined";
    if (v && typeof v === "object" && typeof v.caption === "string") return "window(" + v.caption + ")";
    if (v && typeof v === "object" && "width" in v && "x" in v)
        return "rect(" + v.x + "," + v.y + " " + v.width + "x" + v.height + ")";
    try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function makeContext(name) {
    current = { name: name, failures: [] };
    const t = {
        fail: function (msg) { current.failures.push(msg); },
        ok: function (cond, msg) { if (!cond) current.failures.push(msg || "expected truthy"); return !!cond; },
        equal: function (actual, expected, msg) {
            if (actual !== expected)
                current.failures.push((msg || "values differ") + ": got " + fmt(actual) + ", want " + fmt(expected));
            return actual === expected;
        },
        sameMembers: function (actual, expected, msg) {
            const a = actual.slice().sort(), e = expected.slice().sort();
            if (JSON.stringify(a) !== JSON.stringify(e))
                current.failures.push((msg || "members differ") + ": got " + fmt(actual) + ", want " + fmt(expected));
        },
        // Rect equality with a tolerance, since KWin geometry is fractional.
        rectNear: function (actual, expected, msg, tolerance) {
            const tol = tolerance === undefined ? 1.5 : tolerance;
            const near = actual && ["x", "y", "width", "height"].every(k => Math.abs(actual[k] - expected[k]) <= tol);
            if (!near) current.failures.push((msg || "rects differ") + ": got " + fmt(actual) + ", want " + fmt(expected));
            return near;
        },
        until: function (predicate, what, timeoutMs) {
            return { until: predicate, what: what, timeout: timeoutMs || 3000 };
        },
        diag: function (msg) { log("# " + msg); },
    };
    return t;
}

function finishTest(index, skipReason) {
    const ok = current.failures.length === 0;
    if (skipReason) {
        log("ok " + index + " - " + current.name + " # SKIP " + skipReason);
    } else {
        log((ok ? "ok " : "not ok ") + index + " - " + current.name);
        current.failures.forEach(f => log("#   " + f));
    }
    results.push({ name: current.name, ok: ok || !!skipReason });
    current = null;
}

function finishRun(count) {
    log("1.." + count);
    const failed = results.filter(r => !r.ok).length;
    log("# " + (results.length - failed) + "/" + results.length + " passed");
}
