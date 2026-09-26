import CoreGraphics
import Testing
@testable import DikDukCore

@Suite struct PanelPlacementTests {
    let screen = CGRect(x: 0, y: 0, width: 1000, height: 800)

    func frame(_ size: CGSize, _ pointer: CGPoint) -> CGRect {
        CGRect(origin: PanelPlacement.origin(size: size, pointer: pointer, visible: screen), size: size)
    }

    @Test func placesBelowRightOfThePointer() {
        let f = frame(CGSize(width: 320, height: 100), CGPoint(x: 100, y: 500))
        #expect(f.minX == 116)
        #expect(f.maxY == 484)
    }

    @Test func flipsAboveWhenTooCloseToTheBottom() {
        let f = frame(CGSize(width: 320, height: 100), CGPoint(x: 100, y: 50))
        #expect(f.minY == 66)
        #expect(!f.contains(CGPoint(x: 100, y: 50)))
    }

    @Test func grownPanelNearTheBottomStaysOnScreenAndOffThePointer() {
        let pointer = CGPoint(x: 100, y: 120)
        let f = frame(CGSize(width: 320, height: 260), pointer)
        #expect(screen.contains(f))
        #expect(!f.contains(pointer))
    }

    @Test func flipsLeftAtTheRightEdge() {
        let f = frame(CGSize(width: 320, height: 100), CGPoint(x: 900, y: 500))
        #expect(f.maxX == 884)
    }

    @Test func clampsIntoTheScreenWhenNeitherSideFits() {
        let f = frame(CGSize(width: 320, height: 790), CGPoint(x: 100, y: 400))
        #expect(f.minY >= screen.minY)
        #expect(f.maxY <= screen.maxY)
    }
}
