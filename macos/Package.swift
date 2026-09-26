// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "DikDuk",
    platforms: [.macOS("15.0")],
    products: [
        .executable(name: "DikDuk", targets: ["DikDukApp"]),
    ],
    targets: [
        .target(name: "DikDukCore"),
        .executableTarget(name: "DikDukApp", dependencies: ["DikDukCore"]),
        .testTarget(
            name: "DikDukCoreTests",
            dependencies: ["DikDukCore"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
