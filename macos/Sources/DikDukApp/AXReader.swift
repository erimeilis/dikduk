import ApplicationServices
import DikDukCore

/// Reads the text of the UI element under a point in any app (spec §6).
@MainActor final class AXReader {
    private let systemWide = AXUIElementCreateSystemWide()
    private var appsAskedForAccessibility = Set<pid_t>()
    private static let textAttributes = ["AXTitle", "AXDescription", "AXValue", "AXHelp"]
    private static let parentLevels = 3

    init() {
        AXUIElementSetMessagingTimeout(systemWide, 0.25)
    }

    /// Hebrew text of the element at a global top-left-origin point, or nil.
    func text(at point: CGPoint) -> String? {
        var hit: AXUIElement?
        let result = AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &hit)
        guard result == .success, var element = hit else {
            if result != .noValue { log.debug("AX element lookup failed: \(result.rawValue)") }
            return nil
        }
        askAppForAccessibilityTree(element)
        for level in 0...Self.parentLevels {
            if isSecure(element) { return nil }
            for attribute in Self.textAttributes {
                if let text = string(element, attribute)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   HebrewText.containsHebrew(text) {
                    return HebrewText.truncateAtTermBoundary(text)
                }
            }
            guard level < Self.parentLevels, let parent = parent(of: element) else { return nil }
            element = parent
        }
        return nil
    }

    /// Chromium/Electron build their web-content AX tree only when asked.
    private func askAppForAccessibilityTree(_ element: AXUIElement) {
        var pid: pid_t = 0
        guard AXUIElementGetPid(element, &pid) == .success,
              appsAskedForAccessibility.insert(pid).inserted else { return }
        let app = AXUIElementCreateApplication(pid)
        let result = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        if result != .success && result != .attributeUnsupported {
            log.debug("AXManualAccessibility for pid \(pid) returned \(result.rawValue)")
        }
    }

    private func isSecure(_ element: AXUIElement) -> Bool {
        string(element, "AXRole") == "AXSecureTextField" || string(element, "AXSubrole") == "AXSecureTextField"
    }

    private func string(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? String
    }

    private func parent(of element: AXUIElement) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, "AXParent" as CFString, &value) == .success,
              let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }
}
