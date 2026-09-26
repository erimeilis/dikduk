import Testing
@testable import DikDukCore

@Suite struct ClickGateTests {
    @Test func passesClicksWhenDisarmed() {
        var gate = ClickGate()
        #expect(gate.handle(.down) == .pass)
        #expect(gate.handle(.up) == .pass)
    }

    @Test func swallowsTheWholeArmedClickSequence() {
        var gate = ClickGate()
        gate.armed = true
        #expect(gate.handle(.down) == .swallowAndPin)
        #expect(gate.handle(.dragged) == .swallow)
        #expect(gate.handle(.up) == .swallow) // menus fire on mouse-up
        #expect(gate.armed == false)
    }

    @Test func passesTheNextClickAfterTheSwallowedOne() {
        var gate = ClickGate()
        gate.armed = true
        _ = gate.handle(.down)
        _ = gate.handle(.up)
        #expect(gate.handle(.down) == .pass)
        #expect(gate.handle(.up) == .pass)
    }

    @Test func passesAStrayUpWhenNothingWasSwallowed() {
        var gate = ClickGate()
        gate.armed = true
        #expect(gate.handle(.up) == .pass)
    }
}
