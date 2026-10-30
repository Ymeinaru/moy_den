// Рендер страницы в PNG через WKWebView + сбор ошибок JS.
// Сборка: clang -fobjc-arc -fno-modules -framework Cocoa -framework WebKit tools/snap.m -o /tmp/snap
// Запуск: /tmp/snap <url> <out.png> <width> <height> [full]
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString *evalSync(WKWebView *web, NSString *code) {
    __block NSString *result = @"nil";
    __block BOOL done = NO;
    [web evaluateJavaScript:code completionHandler:^(id value, NSError *error) {
        if (error) result = [NSString stringWithFormat:@"error: %@", error.localizedDescription];
        else if (value) result = [value description];
        else result = @"nil";
        done = YES;
    }];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:6.0];
    while (!done && [deadline timeIntervalSinceNow] > 0) {
        [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
    }
    return result;
}

static void pump(double seconds) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:seconds];
    while ([deadline timeIntervalSinceNow] > 0) {
        [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.03]];
    }
}

@interface Snapper : NSObject <WKNavigationDelegate>
@property (assign) BOOL loaded;
@end

@implementation Snapper
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.loaded = YES;
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"nav fail: %@", error.localizedDescription);
    self.loaded = YES;
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"nav provisional fail: %@", error.localizedDescription);
    self.loaded = YES;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 5) {
            fprintf(stderr, "usage: snap <url> <out.png> <w> <h> [full]\n");
            return 1;
        }
        NSString *urlString = [NSString stringWithUTF8String:argv[1]];
        NSString *outPath = [NSString stringWithUTF8String:argv[2]];
        double W = atof(argv[3]);
        double H = atof(argv[4]);
        BOOL full = (argc > 5 && strcmp(argv[5], "full") == 0);

        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

        WKWebViewConfiguration *config = [WKWebViewConfiguration new];
        NSString *hook =
            @"window.__denErrors = [];"
            @"window.addEventListener('error', function (e) { window.__denErrors.push(String(e.message)); });"
            @"window.addEventListener('unhandledrejection', function (e) { window.__denErrors.push('rejection: ' + String(e.reason)); });";
        [config.userContentController addUserScript:
            [[WKUserScript alloc] initWithSource:hook
                                   injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                forMainFrameOnly:YES]];

        WKWebView *web = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, W, H) configuration:config];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, W, H)
                                                       styleMask:NSWindowStyleMaskBorderless
                                                         backing:NSBackingStoreBuffered
                                                           defer:NO];
        window.contentView = web;
        [window orderFrontRegardless];

        Snapper *snapper = [Snapper new];
        web.navigationDelegate = snapper;

        NSURL *url = [NSURL URLWithString:urlString];
        if (!url) { fprintf(stderr, "bad url\n"); return 1; }
        [web loadRequest:[NSURLRequest requestWithURL:url]];

        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];
        while (!snapper.loaded && [deadline timeIntervalSinceNow] > 0) pump(0.05);
        if (!snapper.loaded) { fprintf(stderr, "load timeout\n"); return 1; }
        pump(1.4);

        printf("errors:  %s\n", [evalSync(web, @"JSON.stringify(window.__denErrors || ['no-hook'])") UTF8String]);
        printf("date:    %s\n", [evalSync(web, @"(document.getElementById('dateLabel')||{}).textContent || 'no-node'") UTF8String]);
        printf("hours:   %s\n", [evalSync(web, @"String(document.querySelectorAll('.hour').length)") UTF8String]);
        printf("tasks:   %s\n", [evalSync(web, @"String(document.querySelectorAll('.task').length)") UTF8String]);
        printf("chips:   %s\n", [evalSync(web, @"String(document.querySelectorAll('.habit-chip').length)") UTF8String]);
        printf("tabs:    %s\n", [evalSync(web, @"String(document.querySelectorAll('.tab').length)") UTF8String]);
        printf("scrollH: %s\n", [evalSync(web, @"String(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))") UTF8String]);
        printf("selTab:  %s\n", [evalSync(web, @"(document.querySelector('.tab[aria-selected=\"true\"]')||{}).id || 'none'") UTF8String]);
        printf("hidden:  %s\n", [evalSync(web, @"['day','habits','week','stats','settings'].map(function(k){return k+':'+(document.getElementById('page-'+k).hidden?'h':'v')}).join(' ')") UTF8String]);
        printf("rows:    %s\n", [evalSync(web, @"String(document.querySelectorAll('.habit-row').length)") UTF8String]);
        printf("cards:   %s\n", [evalSync(web, @"String(document.querySelectorAll('.day-card').length)") UTF8String]);
        printf("hash:    %s\n", [evalSync(web, @"location.hash + ' tasks=' + document.querySelectorAll('.task').length") UTF8String]);
        printf("first:   %s\n", [evalSync(web, @"(document.querySelector('.task-title')||{}).textContent || 'none'") UTF8String]);
        printf("blocks:  %s\n", [evalSync(web, @"String(document.querySelectorAll('.block').length)") UTF8String]);
        printf("cloud:   %s\n", [evalSync(web, @"document.body.innerText.indexOf('Встреча из облака') >= 0 ? 'found' : 'missing'") UTF8String]);

        double snapH = H;
        if (full) {
            NSString *raw = evalSync(web, @"String(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))");
            double measured = [raw doubleValue];
            if (measured > H) {
                snapH = measured;
                web.frame = NSMakeRect(0, 0, W, snapH);
                window.contentView = web;
                pump(0.6);
            }
        }

        WKSnapshotConfiguration *snapConfig = [WKSnapshotConfiguration new];
        snapConfig.rect = NSMakeRect(0, 0, W, snapH);
        snapConfig.snapshotWidth = @(W * 2);

        __block NSData *png = nil;
        __block BOOL done = NO;
        [web takeSnapshotWithConfiguration:snapConfig completionHandler:^(NSImage *image, NSError *error) {
            if (error) NSLog(@"snapshot error: %@", error.localizedDescription);
            if (image) {
                NSData *tiff = [image TIFFRepresentation];
                NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:tiff];
                png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            }
            done = YES;
        }];
        NSDate *snapDeadline = [NSDate dateWithTimeIntervalSinceNow:20];
        while (!done && [snapDeadline timeIntervalSinceNow] > 0) pump(0.05);

        if (!png) { fprintf(stderr, "snapshot failed\n"); return 1; }
        if (![png writeToFile:outPath atomically:YES]) { fprintf(stderr, "write failed\n"); return 1; }
        printf("saved:   %s (%lu bytes, %dx%d @2x)\n", [outPath UTF8String], (unsigned long)png.length, (int)W, (int)snapH);
    }
    return 0;
}
