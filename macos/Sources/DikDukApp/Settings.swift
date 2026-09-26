import AppKit
import DikDukCore

enum TriggerModifier: String, CaseIterable {
    case option
    case controlOption

    var flags: CGEventFlags {
        switch self {
        case .option: [.maskAlternate]
        case .controlOption: [.maskAlternate, .maskControl]
        }
    }

    var title: String {
        switch self {
        case .option: "Hold ⌥"
        case .controlOption: "Hold ⌃⌥"
        }
    }
}

@MainActor final class Settings {
    private let defaults = UserDefaults.standard

    var enabled: Bool {
        get { defaults.object(forKey: "enabled") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "enabled") }
    }

    var modifier: TriggerModifier {
        get { TriggerModifier(rawValue: defaults.string(forKey: "modifier") ?? "") ?? .option }
        set { defaults.set(newValue.rawValue, forKey: "modifier") }
    }

    /// Override for testing before /translate is deployed. Bundled app:
    /// `defaults write dev.dikduk.companion workerURL http://localhost:8787`.
    /// `swift run` has no bundle id (its defaults domain is the executable name),
    /// so there use `DIKDUK_WORKER_URL=http://localhost:8787 swift run DikDuk`.
    var workerURL: URL {
        let override = ProcessInfo.processInfo.environment["DIKDUK_WORKER_URL"] ?? defaults.string(forKey: "workerURL")
        return override.flatMap(URL.init(string:)) ?? WorkerClient.defaultBaseURL
    }
}
