/// Decides which left-mouse events the pin tap swallows. While armed (panel
/// showing, modifier held, not yet pinned) the next click sequence — down, any
/// drags, and the up — is swallowed whole: menus fire their item on mouse-up,
/// so swallowing only the down would still activate the item underneath.
public struct ClickGate: Sendable {
    public enum Event: Sendable { case down, dragged, up }
    public enum Decision: Equatable, Sendable { case pass, swallow, swallowAndPin }

    public var armed = false
    private var swallowing = false

    public init() {}

    public mutating func handle(_ event: Event) -> Decision {
        switch event {
        case .down:
            guard armed else { return .pass }
            armed = false
            swallowing = true
            return .swallowAndPin
        case .dragged:
            return swallowing ? .swallow : .pass
        case .up:
            guard swallowing else { return .pass }
            swallowing = false
            return .swallow
        }
    }
}
