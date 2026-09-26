import CoreGraphics

/// Where the panel goes relative to the pointer (Cocoa coordinates, origin
/// bottom-left): below-right by default, flipped left / above when it would
/// leave the visible frame, and clamped on-screen when neither side fits.
public enum PanelPlacement {
    public static let offset: CGFloat = 16

    public static func origin(size: CGSize, pointer: CGPoint, visible: CGRect) -> CGPoint {
        var x = pointer.x + offset
        if x + size.width > visible.maxX { x = pointer.x - offset - size.width }
        x = min(max(x, visible.minX), visible.maxX - size.width)

        var y = pointer.y - offset - size.height
        if y < visible.minY { y = pointer.y + offset }
        if y + size.height > visible.maxY { y = max(visible.minY, visible.maxY - size.height) }
        return CGPoint(x: x, y: y)
    }
}
