import AppKit
import SwiftUI
import DikDukCore

/// Borderless, non-activating panel above menus; click-through unless pinned.
@MainActor final class TranslationPanel {
    private let panel: NSPanel
    private let host = NSHostingView(rootView: AnyView(EmptyView()))
    private var lastPointer = CGPoint.zero

    init() {
        panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.isFloatingPanel = true
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.popUpMenuWindow)) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.ignoresMouseEvents = true
        panel.contentView = host
    }

    var isVisible: Bool { panel.isVisible }
    var frame: CGRect { panel.frame }

    func show(_ model: PanelModel, near point: CGPoint, openEntry: @escaping (LookupResult) -> Void) {
        host.rootView = AnyView(PanelView(model: model, openEntry: openEntry))
        move(near: point)
        panel.orderFrontRegardless()
    }

    /// Places the panel near a Cocoa-coordinate point, kept on screen and off the pointer.
    func move(near point: CGPoint) {
        lastPointer = point
        place()
    }

    /// Re-fits after content changes; re-runs placement so a grown panel is
    /// flipped/clamped again instead of growing off-screen or under the pointer.
    func refit() {
        guard panel.isVisible else { return }
        place()
    }

    private func place() {
        let size = host.fittingSize
        panel.setContentSize(size)
        let visible = Self.screen(nearest: lastPointer)?.visibleFrame ?? .zero
        let origin = PanelPlacement.origin(size: size, pointer: lastPointer, visible: visible)
        panel.setFrameOrigin(origin)
    }

    /// The screen under the pointer, or the nearest one when the pointer sits on
    /// an edge (`contains` excludes maxX/maxY, e.g. the very top of the screen).
    private static func screen(nearest point: CGPoint) -> NSScreen? {
        NSScreen.screens.min { distance($0.frame, point) < distance($1.frame, point) }
    }

    private static func distance(_ rect: CGRect, _ point: CGPoint) -> CGFloat {
        let dx = max(rect.minX - point.x, 0, point.x - rect.maxX)
        let dy = max(rect.minY - point.y, 0, point.y - rect.maxY)
        return dx * dx + dy * dy
    }

    func setInteractive(_ interactive: Bool) {
        panel.ignoresMouseEvents = !interactive
    }

    func hide() {
        panel.orderOut(nil)
        setInteractive(false)
    }
}
