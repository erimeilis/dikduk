import AppKit
import DikDukCore
import os

/// Session event tap that swallows the ⌥+click sequence that pins the panel.
/// It runs on its own thread and decides from lock-protected state, so a busy
/// main thread (blocking AX calls) never delays the user's clicks anywhere.
final class ClickInterceptor: @unchecked Sendable {
    /// Called on the main actor after a click sequence was swallowed to pin the panel.
    /// Set before `start()`.
    var onPin: (@MainActor () -> Void)?

    private struct Handles {
        var tap: CFMachPort?
        var runLoop: CFRunLoop?
    }

    private let gate = OSAllocatedUnfairLock(initialState: ClickGate())
    private let handles = OSAllocatedUnfairLock(uncheckedState: Handles())
    private var thread: Thread?

    /// Armed only while the panel shows, the modifier is held and it isn't pinned yet.
    func setArmed(_ armed: Bool) {
        gate.withLock { $0.armed = armed }
    }

    func start() {
        guard thread == nil else { return }
        let thread = Thread { [weak self] in self?.runTap() }
        thread.name = "dev.dikduk.click-tap"
        thread.start()
        self.thread = thread
    }

    func stop() {
        gate.withLock { $0 = ClickGate() }
        let current = handles.withLockUnchecked { handles -> Handles in
            let current = handles
            handles = Handles()
            return current
        }
        if let tap = current.tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let runLoop = current.runLoop { CFRunLoopStop(runLoop) }
        thread = nil
    }

    private func runTap() {
        let mask = CGEventMask(1 << CGEventType.leftMouseDown.rawValue)
            | CGEventMask(1 << CGEventType.leftMouseDragged.rawValue)
            | CGEventMask(1 << CGEventType.leftMouseUp.rawValue)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: { _, type, event, refcon in
                guard let refcon else { return Unmanaged.passUnretained(event) }
                let interceptor = Unmanaged<ClickInterceptor>.fromOpaque(refcon).takeUnretainedValue()
                return interceptor.handle(type) ? nil : Unmanaged.passUnretained(event)
            },
            userInfo: refcon
        ) else {
            log.error("click tap could not be created (Accessibility not granted?)")
            return
        }
        let runLoop = CFRunLoopGetCurrent()
        handles.withLockUnchecked { $0 = Handles(tap: tap, runLoop: runLoop) }
        let source = CFMachPortCreateRunLoopSource(nil, tap, 0)
        CFRunLoopAddSource(runLoop, source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        CFRunLoopRun()
        CFRunLoopRemoveSource(runLoop, source, .commonModes)
        CFMachPortInvalidate(tap)
    }

    /// Returns true to swallow the event. Runs on the tap thread.
    private func handle(_ type: CGEventType) -> Bool {
        let event: ClickGate.Event
        switch type {
        case .leftMouseDown: event = .down
        case .leftMouseDragged: event = .dragged
        case .leftMouseUp: event = .up
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            log.info("click tap re-enabled after \(type.rawValue)")
            if let tap = handles.withLockUnchecked({ $0.tap }) { CGEvent.tapEnable(tap: tap, enable: true) }
            return false
        default:
            return false
        }
        let decision = gate.withLock { $0.handle(event) }
        if decision == .swallowAndPin {
            DispatchQueue.main.async { [weak self] in
                MainActor.assumeIsolated { self?.onPin?() }
            }
        }
        return decision != .pass
    }
}
