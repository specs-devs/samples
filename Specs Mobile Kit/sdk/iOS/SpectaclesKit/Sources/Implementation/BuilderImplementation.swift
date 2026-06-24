// Copyright © 2024 Snap, Inc. All rights reserved.

import Combine
import Foundation

final class Dependencies: Sendable {
    let bondingRepository: BondingRepository
    let bondingResultFetcher: BondingResultFetcher
    init(bondingRepository: BondingRepository, bondingResultFetcher: BondingResultFetcher) {
        self.bondingRepository = bondingRepository
        self.bondingResultFetcher = bondingResultFetcher
    }
}

/// Internal implementation of the Builder class
internal class BuilderImplementation: Builder {
    /// Default base URL used when the integrator does not call `setBondingRedirectURL`.
    static let defaultBondingRedirectURL = URL(string: "specskitapp://specs-mobile-kit/")!

    private var identifier: ClientIdentifier?
    private var version: String?
    private var auth: (any Authentication)?
    private var bluetoothAdapter: BluetoothAdapter?
    private var bondingRedirectURL: URL?

    func setIdentifier(_ identifier: ClientIdentifier) -> Self {
        self.identifier = identifier
        return self
    }

    func setVersion(_ version: String) -> Self {
        self.version = version
        return self
    }

    func setAuth(_ auth: any Authentication) -> Self {
        self.auth = auth
        return self
    }

    func setBluetoothAdaptor(_ bluetoothAdapter: BluetoothAdapter) -> Self {
        self.bluetoothAdapter = bluetoothAdapter
        return self
    }

    func setBondingRedirectURL(_ baseURL: URL) -> Self {
        self.bondingRedirectURL = baseURL
        return self
    }

    func build() -> any BondingManager {
        // Validate the required fields
        guard let identifier else {
            fatalError("ClientIdentifier is required")
        }
        guard let version else {
            fatalError("Version is required")
        }
        guard let auth else {
            fatalError("Authentication is required")
        }
        let rawRedirectURL = bondingRedirectURL ?? Self.defaultBondingRedirectURL
        guard var components = URLComponents(url: rawRedirectURL, resolvingAgainstBaseURL: false) else {
            fatalError("Bonding redirect URL is malformed: \(rawRedirectURL)")
        }
        components.query = nil
        components.fragment = nil
        guard let redirectURL = components.url else {
            fatalError("Bonding redirect URL is malformed: \(rawRedirectURL)")
        }
        let bondingRepository = BondingRepository()
        let bondingResultFetcher = BondingResultFetcher(clientId: identifier, redirectBaseURL: redirectURL)
        let dependencies = Dependencies(bondingRepository: bondingRepository, bondingResultFetcher: bondingResultFetcher)
        return BondingManagerImplementation(
            identifier: identifier,
            version: version,
            auth: auth,
            bluetoothAdapter: bluetoothAdapter ?? .defaultInstance,
            dependencies: dependencies
        )
    }
}
