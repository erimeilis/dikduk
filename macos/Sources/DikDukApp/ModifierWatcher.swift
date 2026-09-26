import AppKit

/// Polls the global modifier state and pointer every 50 ms. Polling (not event
/// monitors) keeps working while another app tracks an open menu.
@MainActor final class ModifierWatcher {
    var required: CGEventFlags = [.maskAlternate]
    var onHoldChange: ((Bool, CGPoint) -> Void)?
    var onMove: ((CGPoint) -> Void)?

    private static let relevant: CGEventFlags = [.maskAlternate, .maskControl, .maskCommand, .maskShift]
    private var timer: Timer?
    private var held = false
    private var lastPoint = CGPoint(x: -1, y: -1)
    private var stillTicks = 0
    /// While held with the pointer still, re-report it every 10 ticks (500 ms) so a
    /// UI that changes under a stationary pointer (a menu opening) is re-read.
    private static let rereadEveryTicks = 10

    func start() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        if held {
            held = false
            onHoldChange?(false, lastPoint)
        }
    }

    private func tick() {
        let flags = CGEventSource.flagsState(.combinedSessionState).intersection(Self.relevant)
        let point = NSEvent.mouseLocation
        let nowHeld = flags == required
        if nowHeld != held {
            held = nowHeld
            lastPoint = point
            stillTicks = 0
            onHoldChange?(nowHeld, point)
        } else if held, point != lastPoint {
            lastPoint = point
            stillTicks = 0
            onMove?(point)
        } else if held {
            stillTicks += 1
            if stillTicks >= Self.rereadEveryTicks {
                stillTicks = 0
                onMove?(point)
            }
        }
    }
}
