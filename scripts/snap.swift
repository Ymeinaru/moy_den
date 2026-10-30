// Рендер страницы в PNG через WKWebView + сбор ошибок JS.
// Использование: snap <url> <out.png> <width> <height> [full]
import Cocoa
import WebKit

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 5 else { fail("usage: snap <url> <out.png> <w> <h> [full]") }
let urlStr = args[1]
let outPath = args[2]
let W = Double(args[3]) ?? 390
let H = Double(args[4]) ?? 844
let fullPage = args.count > 5 && args[5] == "full"

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let hook = """
window.__denErrors = [];
window.addEventListener('error', function (e) { window.__denErrors.push(String(e.message)); });
window.addEventListener('unhandledrejection', function (e) { window.__denErrors.push('rejection: ' + String(e.reason)); });
"""

let config = WKWebViewConfiguration()
config.userContentController.addUserScript(
    WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true)
)

let web = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: config)
let win = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: W, height: H),
    styleMask: [.borderless], backing: .buffered, defer: false
)
win.contentView = web
win.orderFrontRegardless()

var loaded = false
final class Nav: NSObject, WKNavigationDelegate {
    var onFinish: (() -> Void)?
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { onFinish?() }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { onFinish?() }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { onFinish?() }
}
let nav = Nav()
web.navigationDelegate = nav
nav.onFinish = { loaded = true }

guard let url = URL(string: urlStr) else { fail("bad url") }
web.load(URLRequest(url: url))

let deadline = Date().addingTimeInterval(20)
while !loaded && Date() < deadline {
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
}
if !loaded { fail("load timeout") }
let warm = Date().addingTimeInterval(1.4)
while Date() < warm { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }

func jsSync(_ code: String) -> String {
    var result = ""
    var finished = false
    web.evaluateJavaScript(code) { value, _ in
        if let value = value { result = String(describing: value) } else { result = "nil" }
        finished = true
    }
    let dl = Date().addingTimeInterval(6)
    while !finished && Date() < dl { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    return result
}

print("errors:  " + jsSync("JSON.stringify(window.__denErrors || ['no-hook'])"))
print("date:    " + jsSync("(document.getElementById('dateLabel')||{}).textContent || 'no-node'"))
print("hours:   " + jsSync("document.querySelectorAll('.hour').length"))
print("tasks:   " + jsSync("document.querySelectorAll('.task').length"))
print("chips:   " + jsSync("document.querySelectorAll('.habit-chip').length"))
print("tabs:    " + jsSync("document.querySelectorAll('.tab').length"))
print("scrollH: " + jsSync("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)"))

var snapH = H
if fullPage {
    let raw = jsSync("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
    snapH = max(H, Double(raw) ?? H)
    web.frame = NSRect(x: 0, y: 0, width: W, height: snapH)
    let settle = Date().addingTimeInterval(0.6)
    while Date() < settle { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
}

var png: Data? = nil
var done = false
let scfg = WKSnapshotConfiguration()
scfg.rect = NSRect(x: 0, y: 0, width: W, height: snapH)
scfg.snapshotWidth = NSNumber(value: W * 2)
web.takeSnapshot(with: scfg) { image, _ in
    if let image = image, let tiff = image.tiffRepresentation,
       let rep = NSBitmapImageRep(data: tiff) {
        png = rep.representation(using: .png, properties: [:])
    }
    done = true
}
while !done { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }

guard let data = png else { fail("snapshot failed") }
do {
    try data.write(to: URL(fileURLWithPath: outPath))
} catch {
    fail("write failed: \(error)")
}
print("saved:   \(outPath) (\(data.count) bytes, \(Int(W))x\(Int(snapH)) @2x)")
