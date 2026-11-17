// Copyright © 2024 Snap, Inc. All rights reserved.

import Foundation

struct BondingIdentifier: Equatable {
    /// The bonding ID assigned by the Spectacles when creating a bonding. Stored verbatim as a
    /// lowercase string (matching the device-generated form); never round-tripped through
    /// `UUID.uuidString`, which would uppercase it and break the device's case-sensitive compare.
    let assignedId: String
    /// iOS `CBPeripheral.identifier` of the Spectacles
    let peripheralId: UUID

    enum Keys: String {
        case assignedId = "bondingId"
        case peripheralId = "peripheralId"
    }
}

struct SpectaclesBonding: Bonding, Equatable {
    public let id: String

    let identifier: BondingIdentifier
    let deviceId: String
    let lensId: String?
    nonisolated(unsafe) var publicKey: SecKey?
    var keyAlgorithm: String?
}
